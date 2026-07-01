import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ToolEvent {
  type: "call" | "result";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  output?: string;
  error?: string;
  elapsed_ms?: number;
}

export interface MessageMeta {
  skills?: string[];
  routedModel?: string;
  cached?: boolean;
  model?: string;
  usage?: { input: number; output: number };
  experienceId?: string;
  feedback?: "up" | "down" | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolEvents?: ToolEvent[];
  meta?: MessageMeta;
  reasoning?: string;
}

export interface ToolApproval {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface UseChatReturn {
  messages: Message[];
  sendMessage: (content: string, reasoningEffort?: string, safetyMode?: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  newChat: () => void;
  stopChat: () => void;
  toolEvents: ToolEvent[];
  pendingApproval: ToolApproval | null;
  respondApproval: (approved: boolean) => void;
  setFeedback: (messageId: string, experienceId: string, feedback: "up" | "down") => void;
}

export function useChat(conversationId: string | null, onConversationCreated?: (id: string) => void): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ToolApproval | null>(null);
  const [allToolEvents, setAllToolEvents] = useState<ToolEvent[]>([]);
  const nextId = useRef(Date.now());
  const streamingId = useRef<string | null>(null);
  const toolEventsRef = useRef<ToolEvent[]>([]);
  const convIdRef = useRef<string | null>(null);

  // Sync conversation when conversationId prop changes
  useEffect(() => {
    if (conversationId && conversationId !== convIdRef.current) {
      convIdRef.current = conversationId;
      invoke<{
        conversation: { id: string };
        messages: { id: string; role: "user" | "assistant"; content: string; toolEvents?: ToolEvent[]; timestamp: number }[];
      }>("engine_rpc", {
        method: "conversation.get",
        params: { id: conversationId },
      }).then(result => {
        setMessages(result.messages.map((m) => ({ ...m, toolEvents: m.toolEvents ?? undefined })));
        // Collect all tool events from loaded messages
        const events: ToolEvent[] = [];
        result.messages.forEach(m => {
          if (m.toolEvents) events.push(...m.toolEvents);
        });
        setAllToolEvents(events);
        setError(null);
      }).catch(() => {});
    } else if (!conversationId) {
      convIdRef.current = null;
      setMessages([]);
      setAllToolEvents([]);
      setError(null);
    }
  }, [conversationId]);

  // Ensure conversation exists in DB
  async function ensureConversation(): Promise<string> {
    if (convIdRef.current) return convIdRef.current;
    const id = `conv-${Date.now()}`;
    await invoke("engine_rpc", {
      method: "conversation.create",
      params: { id, title: "New Chat" },
    });
    convIdRef.current = id;
    onConversationCreated?.(id);
    return id;
  }

  // Persist a message to DB
  function persistMessage(msg: Message, convId: string) {
    invoke("engine_rpc", {
      method: "conversation.addMessage",
      params: {
        id: msg.id,
        conversationId: convId,
        role: msg.role,
        content: msg.content,
        toolEvents: msg.toolEvents?.length ? msg.toolEvents : undefined,
        sortOrder: msg.timestamp,
      },
    }).catch(() => {});
  }

  // Stream tokens
  useEffect(() => {
    const unlistenDelta = listen<{ method: string; params: { token?: string } }>(
      "engine-event",
      (e) => {
        if (e.payload.method !== "chat.delta" || !streamingId.current) return;
        const id = streamingId.current;
        const token = e.payload.params.token ?? "";
        setMessages((prev) =>
          prev.some((m) => m.id === id)
            ? prev.map((m) => (m.id === id ? { ...m, content: m.content + token } : m))
            : [...prev, { id, role: "assistant", content: token, timestamp: Date.now() }],
        );
      },
    );

    // Tool call events
    const unlistenToolCall = listen<{
      method: string;
      params: { id: string; name: string; arguments: Record<string, unknown> };
    }>("engine-event", (e) => {
      if (e.payload.method !== "chat.tool_call") return;
      const { id, name, arguments: args } = e.payload.params;
      const assistantId = streamingId.current;
      if (!assistantId) return;
      const event: ToolEvent = { type: "call", id, name, arguments: args };
      toolEventsRef.current = [...toolEventsRef.current, event];
      const events = [...toolEventsRef.current];
      setAllToolEvents(prev => [...prev, event]);
      setMessages((prev) =>
        prev.some((m) => m.id === assistantId)
          ? prev.map((m) => (m.id === assistantId ? { ...m, toolEvents: events } : m))
          : [
              ...prev,
              { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), toolEvents: events },
            ],
      );
    });

    // Tool result events
    const unlistenToolResult = listen<{
      method: string;
      params: { id: string; name: string; output: string; error?: string; elapsed_ms?: number };
    }>("engine-event", (e) => {
      if (e.payload.method !== "chat.tool_result") return;
      const { id, name, output, error: err, elapsed_ms } = e.payload.params;
      const assistantId = streamingId.current;
      if (!assistantId) return;
      const event: ToolEvent = { type: "result", id, name, output, error: err, elapsed_ms };
      toolEventsRef.current = [...toolEventsRef.current, event];
      const events = [...toolEventsRef.current];
      setAllToolEvents(prev => [...prev, event]);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, toolEvents: events } : m)),
      );
    });

    // Tool approval requests
    const unlistenApproval = listen<{
      method: string;
      params: { id: string; name: string; arguments: Record<string, unknown> };
    }>("engine-event", (e) => {
      if (e.payload.method !== "chat.tool_approval") return;
      setPendingApproval(e.payload.params);
    });

    // Cost/skills transparency: attach metadata to the streaming assistant message.
    const patchStreamMeta = (patch: MessageMeta) => {
      const id = streamingId.current;
      if (!id) return;
      setMessages((prev) =>
        prev.some((m) => m.id === id)
          ? prev.map((m) => (m.id === id ? { ...m, meta: { ...m.meta, ...patch } } : m))
          : [...prev, { id, role: "assistant", content: "", timestamp: Date.now(), meta: patch }],
      );
    };
    const unlistenSkills = listen<{ method: string; params: { skills: string[] } }>("engine-event", (e) => {
      if (e.payload.method !== "chat.skills") return;
      patchStreamMeta({ skills: e.payload.params.skills });
    });
    const unlistenRouted = listen<{ method: string; params: { model: string } }>("engine-event", (e) => {
      if (e.payload.method !== "chat.routed") return;
      patchStreamMeta({ routedModel: e.payload.params.model });
    });
    const unlistenCached = listen<{ method: string; params: Record<string, never> }>("engine-event", (e) => {
      if (e.payload.method !== "chat.cached") return;
      patchStreamMeta({ cached: true });
    });
    // Experience logging (Task 47): attach the logged experience id so the
    // feedback buttons (thumbs up/down) can reference it.
    const unlistenExp = listen<{ method: string; params: { id: string } }>("engine-event", (e) => {
      if (e.payload.method !== "chat.experience_logged") return;
      patchStreamMeta({ experienceId: e.payload.params.id });
    });

    // Reasoning/thinking tokens (o1, Claude extended thinking, DeepSeek)
    const unlistenReasoning = listen<{ method: string; params: { token: string } }>(
      "engine-event",
      (e) => {
        if (e.payload.method !== "chat.reasoning.delta" || !streamingId.current) return;
        const id = streamingId.current;
        const token = e.payload.params.token ?? "";
        setMessages((prev) =>
          prev.some((m) => m.id === id)
            ? prev.map((m) => (m.id === id ? { ...m, reasoning: (m.reasoning ?? "") + token } : m))
            : [...prev, { id, role: "assistant", content: "", timestamp: Date.now(), reasoning: token }],
        );
      },
    );

    return () => {
      unlistenDelta.then((f) => f()).catch(() => {});
      unlistenToolCall.then((f) => f()).catch(() => {});
      unlistenToolResult.then((f) => f()).catch(() => {});
      unlistenApproval.then((f) => f()).catch(() => {});
      unlistenSkills.then((f) => f()).catch(() => {});
      unlistenRouted.then((f) => f()).catch(() => {});
      unlistenCached.then((f) => f()).catch(() => {});
      unlistenExp.then((f) => f()).catch(() => {});
      unlistenReasoning.then((f) => f()).catch(() => {});
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, reasoningEffort?: string, safetyMode?: string) => {
      if (!content.trim() || loading) return;

      const convId = await ensureConversation();

      const userMsg: Message = {
        id: `msg-${nextId.current++}`,
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };
      const assistantId = `msg-${nextId.current++}`;
      streamingId.current = assistantId;
      toolEventsRef.current = [];

      setMessages((prev) => [...prev, userMsg]);
      persistMessage(userMsg, convId);
      setLoading(true);
      setError(null);

      try {
        const provider = await invoke<{ provider: string; model: string; baseUrl: string } | null>(
          "provider_get",
        );
        if (!provider) throw new Error("No provider configured. Please complete onboarding first.");

        const personality = await invoke<{
          name: string;
          role: string;
          tone: string;
          language: string;
          instructions: string;
        }>("agent_personality_get");
        const langMap: Record<string, string> = {
          en: "English",
          th: "Thai",
          zh: "Chinese",
          ja: "Japanese",
        };
        const langName = personality.language ? (langMap[personality.language] ?? personality.language) : "";
        const systemPrompt = [
          `You are ${personality.name || "Nexus Agent"}, an autonomous AI agent running directly on the user's machine inside the Nexus desktop app — an open-source local-first AI agent platform built with Tauri 2 and React.`,
          // Language is asserted as a core part of identity, up front — not a
          // trailing afterthought — so the model commits to it and doesn't drift
          // back to English when the user writes in English.
          ...(langName ? [
            `**Language: you MUST reply to the user in ${langName}, always.** This is a hard rule — write every conversational response, explanation, and question to the user in ${langName}, regardless of what language the user wrote in. (Code, file paths, tool arguments, and command output stay as-is.)`,
          ] : []),
          `You run on a real computer and have real tools. You are NOT limited to a chat window or a workspace folder. You can reach the whole machine:`,
          `• Files: file_read / file_write / file_list / patch / search_files accept ABSOLUTE paths anywhere on the host — the user's Desktop, Documents, Downloads, project folders, system files. Example: file_read path="/Users/<name>/Desktop/notes.txt". When in doubt about a user's home folder, run terminal_exec with \`echo $HOME\` (Unix) or \`echo %USERPROFILE%\` (Windows).`,
          `• Terminal: terminal_exec runs any shell command on the host — list files, inspect the OS, install packages, run git, open apps, manage processes. Use it freely (e.g. \`ls -la ~/Desktop\`, \`pwd\`, \`uname -a\`).`,
          `• Remote devices: ssh_exec runs commands on configured remote hosts over SSH (and ssh_upload / ssh_download transfer files). Call the ssh_hosts tool first to see what hosts are configured. If the user refers to "my mac", "my pc", or a device on their Tailscale network, use ssh.`,
          `• Plus: web_search / web_fetch, browser automation, code execution, knowledge base, kanban, scheduling, and persistent memory.`,
          `You have persistent memory across conversations: user profile, rules, soul/persona, memory notes, and context. Use the 'remember' tool to save important facts about the user.`,
          `When asked whether you can access something (a folder, a device, a file), assume you can and USE THE TOOLS to check — do not claim you are limited or sandboxed. Prefer acting over explaining limitations.`,
          personality.role ? `Your role: ${personality.role}.` : "",
          personality.tone ? `Your tone: ${personality.tone}.` : "",
          personality.instructions ? `\n${personality.instructions}` : "",
        ]
          .filter(Boolean)
          .join(" ");

        const maxHist = Number(
          (
            await invoke<{ value: string | null }>("engine_rpc", {
              method: "settings.get",
              params: { key: "chat.maxHistory" },
            }).catch(() => ({ value: null }))
          )?.value,
        );
        const history = maxHist > 0 ? messages.slice(-maxHist * 2) : messages;

        const chatMessages = [
          { role: "system" as const, content: systemPrompt },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: content.trim() },
        ];

        const response = await invoke<{
          content: string;
          model: string;
          usage: { input: number; output: number };
        }>("chat_send", {
          messages: chatMessages,
          model: provider.model,
          provider: provider.provider,
          baseUrl: provider.baseUrl,
          reasoningEffort: reasoningEffort || undefined,
          safetyMode: safetyMode || undefined,
        });

        setMessages((prev) => {
          const meta = { model: response.model, usage: response.usage };
          const existing = prev.find((m) => m.id === assistantId);
          if (existing) {
            const updated = { ...existing, content: existing.content || (response.content ?? ""), meta: { ...existing.meta, ...meta } };
            persistMessage(updated, convId);
            return prev.map((m) => (m.id === assistantId ? updated : m));
          }
          const finalMsg: Message = {
            id: assistantId,
            role: "assistant",
            content: response.content ?? "(empty response)",
            timestamp: Date.now(),
            meta,
          };
          persistMessage(finalMsg, convId);
          return [...prev, finalMsg];
        });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        setError(errorMsg);
        setMessages((prev) =>
          prev.some((m) => m.id === assistantId)
            ? prev.map((m) =>
                m.id === assistantId ? { ...m, content: `Error: ${errorMsg}` } : m,
              )
            : [
                ...prev,
                {
                  id: assistantId,
                  role: "assistant",
                  content: `Error: ${errorMsg}`,
                  timestamp: Date.now(),
                },
              ],
        );
      } finally {
        streamingId.current = null;
        setLoading(false);
      }
    },
    [messages, loading, conversationId],
  );

  const newChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setAllToolEvents([]);
    convIdRef.current = null;
    onConversationCreated?.("");
  }, []);

  const stopChat = useCallback(() => {
    invoke("chat_abort").catch(() => {});
    streamingId.current = null;
    setLoading(false);
  }, []);

  const respondApproval = useCallback((approved: boolean) => {
    setPendingApproval((current) => {
      if (current) {
        invoke("engine_rpc", {
          method: "tool.approvalResult",
          params: { id: current.id, approved },
        }).catch(() => {});
      }
      return null;
    });
  }, []);

  const setFeedback = useCallback((messageId: string, experienceId: string, feedback: "up" | "down") => {
    setMessages((prev) => prev.map((m) =>
      m.id === messageId ? { ...m, meta: { ...m.meta, feedback } } : m,
    ));
    invoke("engine_rpc", {
      method: "experience.feedback",
      params: { id: experienceId, feedback },
    }).catch(() => {});
  }, []);

  return {
    messages,
    sendMessage,
    loading,
    error,
    newChat,
    stopChat,
    toolEvents: allToolEvents,
    pendingApproval,
    respondApproval,
    setFeedback,
  };
}
