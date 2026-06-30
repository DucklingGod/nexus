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
        const systemPrompt = [
          `You are ${personality.name || "Nexus Agent"}, an AI assistant running inside the Nexus desktop app — an open-source local-first AI agent platform built with Tauri 2 and React.`,
          `You have access to tools (file operations, web search, terminal, code execution, knowledge base, memory) and can perform multi-step tasks autonomously.`,
          `You have persistent memory across conversations: user profile, rules, soul/persona, memory notes, and context. Use the 'remember' tool to save important facts about the user.`,
          personality.role ? `Your role: ${personality.role}.` : "",
          personality.tone ? `Your tone: ${personality.tone}.` : "",
          personality.language
            ? `Always respond in ${langMap[personality.language] ?? personality.language}.`
            : "",
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
          const existing = prev.find((m) => m.id === assistantId);
          if (existing) {
            persistMessage({ ...existing, content: existing.content || (response.content ?? "") }, convId);
            return prev;
          }
          const finalMsg: Message = {
            id: assistantId,
            role: "assistant",
            content: response.content ?? "(empty response)",
            timestamp: Date.now(),
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
  };
}
