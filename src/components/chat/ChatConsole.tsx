import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useChat, type ImageAttachment, type FileAttachment } from "../../hooks/useChat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { RightPanel } from "../panel/RightPanel";
import { ErrorToast } from "../common/ErrorToast";
import { EmptyState } from "../common/EmptyState";
import { getUserMessage } from "../../lib/errorHandler";
import { IconHand, IconCheckCircle, IconClipboard, IconShield } from "../icons";
import { AgentTimeline } from "./AgentTimeline";
import { AgentDAG } from "./AgentDAG";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

/** Collapsible reasoning/thinking block — shows model's internal reasoning */
function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-nexus-border/30 bg-nexus-surface/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-nexus-muted transition hover:text-nexus-fg"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 2C5 2 3 4.5 3 7c0 3 5 7 5 7s5-4 5-7c0-2.5-2-5-5-5z" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="7" r="1.5" stroke="currentColor" strokeWidth="1" />
        </svg>
        <span className="font-medium">Thinking</span>
        <svg
          width="8" height="8" viewBox="0 0 16 16" fill="none"
          className={`ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-nexus-border/20 px-3 py-2">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-nexus-muted/80">{text}</p>
        </div>
      )}
    </div>
  );
}

const SAFETY_MODES = [
  { id: "ask", label: "Ask before changes", icon: "hand", desc: "Confirm before file changes" },
  { id: "auto", label: "Edit automatically", icon: "check", desc: "Edit files without asking" },
  { id: "plan", label: "Plan first", icon: "clipboard", desc: "Plan before editing" },
  { id: "full", label: "Full access", icon: "shield", desc: "Fewer confirmations" },
];

const SAFETY_ICON_MAP: Record<string, React.FC<{ size?: number }>> = {
  hand: IconHand,
  check: IconCheckCircle,
  clipboard: IconClipboard,
  shield: IconShield,
};

function SafetyIcon({ name, size = 11 }: { name: string; size?: number }) {
  const Comp = SAFETY_ICON_MAP[name];
  return Comp ? <Comp size={size} /> : null;
}

const REASONING_LEVELS = [
  { id: "low", label: "Quick", desc: "Fast, short answers" },
  { id: "medium", label: "Balanced", desc: "Good balance of speed and depth" },
  { id: "high", label: "Thorough", desc: "Longer, more detailed thinking" },
  { id: "max", label: "Max", desc: "Deep reasoning, takes longer" },
];

interface Props {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  inputPrefill?: string | null;
  onConsumedPrefill?: () => void;
}

export function ChatConsole({ conversationId, onConversationCreated, inputPrefill, onConsumedPrefill }: Props) {
  const { messages, sendMessage, loading, error, stopChat, pendingApproval, respondApproval, pendingOptions, respondOptions, toolEvents, setFeedback } = useChat(conversationId, onConversationCreated);
  const [otherText, setOtherText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Keep scrolling during streaming if user is near bottom
  useEffect(() => {
    if (loading) {
      const el = scrollRef.current;
      if (el) {
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
        if (nearBottom) scrollToBottom();
      }
    }
  }, [messages, loading, scrollToBottom]);

  const [input, setInput] = useState("");
  const [improving, setImproving] = useState(false);
  // Vision (Task 58): images picked for the NEXT send only — not persisted,
  // consistent with how the rest of the composer state works.
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [attachingImage, setAttachingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lastSentImages, setLastSentImages] = useState<ImageAttachment[] | undefined>(undefined);

  // Apply a prefill injected by the TopBar (e.g. picking an SSH host).
  useEffect(() => {
    if (inputPrefill) {
      setInput(prev => prev.trim() ? `${prev}\n${inputPrefill}` : inputPrefill);
      onConsumedPrefill?.();
    }
  }, [inputPrefill, onConsumedPrefill]);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [bottomTerminalOpen, setBottomTerminalOpen] = useState(false);
  const [safetyMode, setSafetyMode] = useState("ask");
  const [showSafetyDropdown, setShowSafetyDropdown] = useState(false);
  const [reasoningLevel, setReasoningLevel] = useState("medium");
  const [showReasoningDropdown, setShowReasoningDropdown] = useState(false);
  const [showAttachPopover, setShowAttachPopover] = useState(false);
  const [timelineView, setTimelineView] = useState<"timeline" | "dag">("timeline");
  const [modelName, setModelName] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelList, setModelList] = useState<{ id: string; isFree?: boolean; supportsTools?: boolean }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [lastSentContent, setLastSentContent] = useState<string | null>(null);
  const [lastReasoningLevel, setLastReasoningLevel] = useState<string>("medium");
  const [errorDismissed, setErrorDismissed] = useState(false);

  // Reset dismissed flag when error changes
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  // Load the current provider + model. Runs on mount AND whenever the provider
  // is changed in Settings — which is a z-50 overlay that never unmounts this
  // component, so a one-time mount effect would leave the chat header/model
  // picker showing the old provider. SettingsContext emits "provider-changed".
  const loadProvider = useCallback(() => {
    invoke<{ provider: string; model: string; baseUrl: string } | null>("provider_get")
      .then(cfg => {
        if (cfg) {
          setModelName(cfg.model);
          setProviderId(cfg.provider);
          setBaseUrl(cfg.baseUrl);
          setModelList([]); // drop the old provider's cached model list so the dropdown re-fetches
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadProvider(); }, [loadProvider]);

  useEffect(() => {
    const un = listen("provider-changed", () => loadProvider());
    return () => { un.then(f => f()).catch(() => {}); };
  }, [loadProvider]);

  const safety = SAFETY_MODES.find(m => m.id === safetyMode) ?? SAFETY_MODES[0];
  const reasoning = REASONING_LEVELS.find(r => r.id === reasoningLevel) ?? REASONING_LEVELS[1];

  // Fetch models from provider when dropdown opens
  async function openModelDropdown() {
    if (showModelDropdown) { setShowModelDropdown(false); return; }
    setShowModelDropdown(true);
    if (modelList.length > 0) return; // already loaded
    setModelsLoading(true);
    try {
      const result = await invoke<{ models: { id: string }[] }>("provider_list_models", { provider: providerId, baseUrl });
      setModelList(result.models ?? []);
    } catch { setModelList([]); }
    finally { setModelsLoading(false); }
  }

  // Switch model
  async function switchModel(model: string) {
    setShowModelDropdown(false);
    if (model === modelName) return;
    try {
      await invoke("provider_set", { provider: providerId, model, baseUrl });
      setModelName(model);
      // Persist tool-calling capability so the engine can decide whether to send
      // a tools array. Free models that lack native function-calling will emit
      // <tool_call> text blobs if sent tools — gating prevents that leak.
      const supports = modelList.find(m => m.id === model)?.supportsTools ?? true;
      await invoke("engine_rpc", { method: "settings.set", params: { key: "model.supportsTools", value: supports ? "true" : "false" } }).catch(() => {});
    } catch { /* ignore */ }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const msg = input;
    const images = pendingImages.length ? pendingImages : undefined;
    setLastSentContent(msg);
    setLastReasoningLevel(reasoningLevel);
    setLastSentImages(images);
    setInput("");
    setPendingImages([]);
    await sendMessage(msg, reasoningLevel, safetyMode, images);
  }

  async function attachFile() {
    try {
      const path = await open({ multiple: false, title: "Attach a file for the agent to read" });
      if (typeof path === "string") {
        setInput(prev => prev.trim() ? `${prev}\nRead this file: ${path}` : `Read this file: ${path}`);
      }
    } catch { /* cancelled */ }
  }

  async function attachImage() {
    if (attachingImage) return;
    try {
      const path = await open({
        multiple: false,
        title: "Attach an image for a vision model",
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      });
      if (typeof path !== "string") return;
      setAttachingImage(true);
      setImageError(null);
      const img = await invoke<ImageAttachment>("engine_rpc", { method: "image.readBase64", params: { path } });
      setPendingImages(prev => [...prev, img]);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttachingImage(false);
    }
  }

  function removePendingImage(index: number) {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }

  // Thumbs-up/down: log feedback. On thumbs-down, the user can add a manual
  // correction rule in Settings → Learning; the engine injects matching rules
  // into future turns so the mistake isn't repeated. (LLM-based auto-extraction
  // would need a key-brokering command — manual rules cover the common case.)
  const handleFeedback = (msgId: string, expId: string, feedback: "up" | "down") => {
    setFeedback(msgId, expId, feedback);
  };

  async function improvePrompt() {
    if (!input.trim() || improving) return;
    setImproving(true);
    try {
      const r = await invoke<{ content: string }>("complete_once", {
        text: input,
        system: "You are a prompt engineer. Rewrite the user's text into a clearer, more specific, well-structured prompt for an AI assistant, preserving their intent. Return ONLY the improved prompt — no preamble, no quotes, no explanation.",
        provider: providerId, model: modelName, baseUrl,
      });
      if (r.content?.trim()) setInput(r.content.trim());
    } catch { /* ignore */ } finally { setImproving(false); }
  }

  const handleRetry = useCallback(() => {
    if (lastSentContent) {
      sendMessage(lastSentContent, lastReasoningLevel, safetyMode, lastSentImages);
    }
  }, [lastSentContent, lastReasoningLevel, safetyMode, lastSentImages, sendMessage]);

  const errorInfo = useMemo(() => error ? getUserMessage(error) : null, [error]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = messages.length === 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function downloadAttachment(att: FileAttachment) {
    try {
      const binary = atob(att.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-full">
      {/* Main chat + bottom terminal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {isEmpty ? (
          /* Empty state — ZCode-style greeting + faint watermark + suggested prompts */
          <EmptyState
            icon={
              <span className="text-gold-foil font-display text-6xl font-bold leading-none select-none">N</span>
            }
            title={`${greeting}, ready when you are`}
            description="Type a message below to start a conversation with Nexus."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[
                  "Summarize a document for me",
                  "Help me write an email",
                  "What can you do?",
                  "Search my notes",
                ].map((text) => (
                  <button
                    key={text}
                    onClick={() => {
                      setInput(text);
                      setTimeout(() => textareaRef.current?.focus(), 50);
                    }}
                    className="rounded-full border border-gold-faint/40 bg-nexus-surface/40 px-3 py-1.5 text-[11px] text-nexus-muted transition hover:border-nexus-gold/50 hover:text-nexus-fg"
                  >
                    {text}
                  </button>
                ))}
              </div>
            }
          />
        ) : (
          /* Conversation */
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
            {messages.map((msg, idx) => {
              // Add extra spacing between consecutive assistant messages
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const isConsecutiveAssistant = msg.role === "assistant" && prevMsg?.role === "assistant";
              return (
              <div key={msg.id} className={isConsecutiveAssistant ? "mb-8 mt-4 border-t border-nexus-border/20 pt-4" : "mb-6"}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-nexus-surface px-4 py-2.5">
                      {msg.images && msg.images.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {msg.images.map((img, i) => (
                            <img key={i} src={`data:${img.mediaType};base64,${img.data}`} alt="" className="h-16 w-16 rounded-md object-cover" />
                          ))}
                        </div>
                      )}
                      <p className="text-sm text-nexus-fg whitespace-pre-wrap">{msg.content}</p>
                      <p className="mt-1 text-[9px] text-nexus-muted/40">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Reasoning/thinking block — collapsible */}
                    {msg.reasoning && (
                      <ReasoningBlock text={msg.reasoning} />
                    )}
                    {/* Agent timeline / DAG — inline view of tool execution */}
                    {msg.toolEvents && msg.toolEvents.length > 0 && (
                      <>
                        {/* View toggle */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setTimelineView("timeline")}
                            className={`rounded-md px-2 py-0.5 text-[9px] transition ${
                              timelineView === "timeline" ? "bg-nexus-surface text-nexus-fg" : "text-nexus-muted/40 hover:text-nexus-muted"
                            }`}
                          >
                            Timeline
                          </button>
                          <button
                            onClick={() => setTimelineView("dag")}
                            className={`rounded-md px-2 py-0.5 text-[9px] transition ${
                              timelineView === "dag" ? "bg-nexus-surface text-nexus-fg" : "text-nexus-muted/40 hover:text-nexus-muted"
                            }`}
                          >
                            Graph
                          </button>
                        </div>
                        {timelineView === "timeline" ? (
                          <AgentTimeline toolEvents={msg.toolEvents} />
                        ) : (
                          <AgentDAG toolEvents={msg.toolEvents} />
                        )}
                      </>
                    )}
                    {msg.meta && (msg.meta.skills?.length || msg.meta.routedModel || msg.meta.cached || msg.meta.model || msg.meta.usage) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.meta.cached && (
                          <span title="Answer reused from an earlier identical question — instant and free" className="flex items-center gap-1 rounded-full border border-gold-faint bg-nexus-surface/50 px-2.5 py-1 text-[10px] text-nexus-gold">↺ cached</span>
                        )}
                        {msg.meta.routedModel && (
                          <span title="Smart routing picked this model for your request" className="flex items-center gap-1 rounded-full border border-nexus-border/30 bg-nexus-surface/50 px-2.5 py-1 text-[10px] text-nexus-muted">↘ {msg.meta.routedModel}</span>
                        )}
                        {msg.meta.skills?.map((s) => (
                          <span key={s} title="A skill was automatically applied to answer this" className="flex items-center gap-1 rounded-full border border-gold-faint bg-nexus-surface/50 px-2.5 py-1 text-[10px] text-nexus-gold/90">✦ {s}</span>
                        ))}
                        {(msg.meta.model || msg.meta.usage) && !msg.meta.cached && (
                          <span title="Which AI model answered and how much text it processed" className="flex items-center gap-1 rounded-full border border-nexus-border/30 bg-nexus-surface/50 px-2.5 py-1 text-[10px] text-nexus-muted/70">
                            {msg.meta.model ?? ""}{msg.meta.usage ? ` · ${msg.meta.usage.input}→${msg.meta.usage.output} tok` : ""}
                          </span>
                        )}
                      </div>
                    ) : null}
                    <div className="max-w-[85%]">
                      <div className="text-sm text-nexus-fg/90">
                        <MarkdownRenderer content={msg.content} />
                      </div>
                      {/* File attachments from send_file tool */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((att, i) => (
                            <button
                              key={i}
                              onClick={() => openPath(att.path).catch(() => downloadAttachment(att))}
                              title={`Open ${att.path}`}
                              className="flex items-center gap-2.5 rounded-lg border border-gold-faint/40 bg-nexus-surface/50 px-3 py-2 transition hover:border-nexus-gold/60 hover:bg-nexus-surface cursor-pointer"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-nexus-gold">
                                <path d="M3 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                                <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.1"/>
                              </svg>
                              <div className="min-w-0 text-left">
                                <p className="truncate text-[11px] font-medium text-nexus-fg">{att.label}</p>
                                <p className="text-[9px] text-nexus-muted/50">{formatSize(att.size)}</p>
                              </div>
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="ml-1 flex-shrink-0 text-nexus-muted/40">
                                <path d="M6 3h7v7M13 3L6 10M3 13V3h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Feedback (Task 49): thumbs up/down */}
                      {msg.meta?.experienceId && !loading && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <button
                            onClick={() => handleFeedback(msg.id, msg.meta!.experienceId!, "up")}
                            title="Good response"
                            className={`rounded p-1 transition hover:bg-nexus-surface ${msg.meta?.feedback === "up" ? "text-green-400" : "text-nexus-muted/40 hover:text-nexus-fg"}`}
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 7v6h2V7H2zm3 6V7l4-5c.5 0 1 .5 1 1.5V6h3c.6 0 1 .4 1 1l-1.2 5c-.1.6-.6 1-1.2 1H5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                          </button>
                          <button
                            onClick={() => handleFeedback(msg.id, msg.meta!.experienceId!, "down")}
                            title="Bad response"
                            className={`rounded p-1 transition hover:bg-nexus-surface ${msg.meta?.feedback === "down" ? "text-red-400" : "text-nexus-muted/40 hover:text-nexus-fg"}`}
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 9V3h2v6H2zm3-6v6l4 5c.5 0 1-.5 1-1.5V10h3c.6 0 1-.4 1-1l-1.2-5c-.1-.6-.6-1-1.2-1H5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )})}
            <div ref={bottomRef} />
            {loading && !pendingOptions && (
              <div className="flex items-center gap-2 text-xs text-nexus-muted">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
                Thinking...
              </div>
            )}
          </div>
        )}

        {/* Bottom terminal (toggleable) */}
        {bottomTerminalOpen && (
          <div className="flex h-48 animate-panel flex-col border-t border-nexus-border/30 bg-nexus-bg">
            <div className="flex items-center justify-between border-b border-nexus-border/20 px-3 py-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-nexus-fg/70">Terminal</span>
                <span className="text-[10px] text-nexus-muted/40">PowerShell</span>
              </div>
              <button
                onClick={() => setBottomTerminalOpen(false)}
                className="rounded p-0.5 text-nexus-muted/40 hover:text-nexus-muted"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 12l8-8M12 12l-8-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] text-nexus-fg/60">
              <p className="text-nexus-muted/40">PS C:\Users\iHC\Desktop\Nexus-App&gt;</p>
            </div>
          </div>
        )}

        {error && errorInfo && !errorDismissed && (
          <ErrorToast
            type={errorInfo.type}
            message={errorInfo.message}
            onRetry={errorInfo.action === 'Retry' ? handleRetry : undefined}
            onDismiss={() => setErrorDismissed(true)}
          />
        )}

        {/* ask_user option selector (Claude-style) — the agent loop is paused
            here; picking an option resumes it autonomously with the choice. */}
        {pendingOptions && (
          <div className="px-4 pt-2">
            <div className="mx-auto max-w-3xl rounded-xl border border-gold-faint bg-nexus-surface/70 p-4 shadow-lg shadow-black/20 animate-dropdown">
              <p className="mb-3 text-sm font-medium text-nexus-fg">{pendingOptions.question}</p>
              <div className="flex flex-col gap-2">
                {pendingOptions.options.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setOtherText(""); respondOptions(pendingOptions.id, o.label); }}
                    className="flex flex-col items-start rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-left transition hover:border-nexus-accent hover:bg-nexus-elevated"
                  >
                    <span className="text-sm text-nexus-fg">{o.label}</span>
                    {o.description && <span className="mt-0.5 text-[11px] text-nexus-muted">{o.description}</span>}
                  </button>
                ))}
              </div>
              {pendingOptions.other && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && otherText.trim()) { respondOptions(pendingOptions.id, otherText.trim()); setOtherText(""); } }}
                    placeholder="Or type your own answer…"
                    className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent"
                  />
                  <button
                    onClick={() => { if (otherText.trim()) { respondOptions(pendingOptions.id, otherText.trim()); setOtherText(""); } }}
                    disabled={!otherText.trim()}
                    className="rounded-lg bg-gold-sheen px-4 py-2 text-sm font-medium text-black transition hover:brightness-110 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom input — ZCode style */}
        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl rounded-xl border border-nexus-border/40 bg-nexus-surface/60 shadow-lg shadow-black/20">
            {/* Pending image attachments (Task 58 — vision input) */}
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-nexus-border/20 px-3 pt-2.5">
                {pendingImages.map((img, i) => (
                  <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-md border border-nexus-border/40">
                    <img src={`data:${img.mediaType};base64,${img.data}`} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => removePendingImage(i)} title="Remove"
                      className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {imageError && (
              <p className="border-b border-nexus-border/20 px-3 pt-2 text-[10px] text-red-400">{imageError}</p>
            )}
            {/* Input field */}
            <textarea
              ref={(el) => {
                textareaRef.current = el;
                if (el) {
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 200) + "px";
                }
              }}
              value={input}
              onChange={(e) => { setInput(e.target.value); }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 200) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask Nexus anything…"
              rows={1}
              className="w-full resize-none bg-transparent px-4 py-3 text-sm text-nexus-fg placeholder-nexus-muted/40 outline-none"
            />

            {/* Bottom controls */}
            <div className="flex items-center justify-between border-t border-nexus-border/20 px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                {/* + attach menu — merged file + image */}
                <div className="relative">
                  <button
                    onClick={() => setShowAttachPopover(!showAttachPopover)}
                    title="Attach"
                    className="rounded-md p-1 text-nexus-muted/40 transition hover:bg-nexus-surface hover:text-nexus-muted"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </button>
                  {showAttachPopover && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowAttachPopover(false)} />
                      <div className="absolute bottom-full left-0 z-50 mb-1 w-48 origin-bottom animate-dropdown rounded-xl border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
                        <button
                          onClick={() => { attachFile(); setShowAttachPopover(false); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition hover:bg-nexus-surface text-nexus-fg"
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
                          Attach a file
                        </button>
                        <button
                          onClick={() => { attachImage(); setShowAttachPopover(false); }}
                          disabled={attachingImage}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition hover:bg-nexus-surface text-nexus-fg disabled:opacity-40"
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="6.5" r="1" fill="currentColor"/><path d="M3 11.5l3.5-3.5 2 2 2.5-3 3 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Attach a photo
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* ✨ Improve prompt */}
                <button onClick={improvePrompt} disabled={!input.trim() || improving} title="Improve this prompt"
                  className={`rounded-md p-1 transition hover:bg-nexus-surface disabled:opacity-30 ${improving ? "animate-pulse text-nexus-gold" : "text-nexus-muted/40 hover:text-nexus-gold"}`}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.4 3.6L13 6l-3.6 1.4L8 11 6.6 7.4 3 6l3.6-1.4z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/><path d="M12.5 10.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="currentColor"/></svg>
                </button>

                {/* Safety mode dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowSafetyDropdown(!showSafetyDropdown)}
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] transition ${
                      safetyMode !== "ask" ? "text-nexus-accent" : "text-nexus-muted/60"
                    } hover:bg-nexus-surface hover:text-nexus-fg`}
                  >
                    <SafetyIcon name={safety.icon} size={11} />
                    {safety.label}
                    <svg width="7" height="7" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                  {showSafetyDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSafetyDropdown(false)} />
                      <div className="absolute bottom-full left-0 z-50 mb-1 w-52 origin-bottom animate-dropdown rounded-xl border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
                        {SAFETY_MODES.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { setSafetyMode(m.id); setShowSafetyDropdown(false); }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-nexus-surface ${
                              m.id === safetyMode ? "text-nexus-accent" : "text-nexus-fg"
                            }`}
                          >
                            <SafetyIcon name={m.icon} size={13} />
                            <div>
                              <p className="text-[11px] font-medium">{m.label}</p>
                              <p className="text-[9px] text-nexus-muted/60">{m.desc}</p>
                            </div>
                            {m.id === safetyMode && <span className="ml-auto text-[9px]">✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Context count circle */}
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-nexus-border/40 text-[8px] text-nexus-muted/60" title={`${messages.length} messages in this chat — Nexus remembers all of them`}>
                  {messages.length}
                </div>

                {/* Model selector dropdown */}
                <div className="relative">
                  <button
                    onClick={openModelDropdown}
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] transition hover:bg-nexus-surface hover:text-nexus-fg ${
                      showModelDropdown ? "bg-nexus-surface text-nexus-fg" : "text-nexus-muted/70"
                    }`}
                  >
                    {modelName || "Choose model"}
                    <svg width="7" height="7" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                  {showModelDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowModelDropdown(false)} />
                      <div className="absolute bottom-full right-0 z-50 mb-1 max-h-72 w-64 origin-bottom animate-dropdown overflow-y-auto rounded-xl border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
                        {modelsLoading && (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <div className="h-3 w-3 animate-spin rounded-full border border-nexus-accent border-t-transparent" />
                            <span className="text-[10px] text-nexus-muted">Loading...</span>
                          </div>
                        )}
                        {!modelsLoading && modelList.length === 0 && (
                          <p className="px-3 py-2 text-[10px] text-nexus-muted">No models available</p>
                        )}
                        {/* Free models group (OpenRouter) */}
                        {!modelsLoading && modelList.some(m => m.isFree) && (
                          <>
                            <p className="px-3 pt-1 pb-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-500/70">Free Models</p>
                            {modelList.filter(m => m.isFree).map(m => (
                              <button
                                key={m.id}
                                onClick={() => switchModel(m.id)}
                                className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] transition hover:bg-nexus-surface ${
                                  m.id === modelName ? "text-nexus-accent" : "text-nexus-fg"
                                }`}
                              >
                                <span className="truncate">{m.id}</span>
                                <span className="flex items-center gap-1.5">
                                  <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] text-emerald-400">FREE</span>
                                  {m.id === modelName && <span className="text-[9px]">✓</span>}
                                </span>
                              </button>
                            ))}
                            <div className="mx-2 my-1 border-t border-nexus-border/30" />
                          </>
                        )}
                        {/* Paid models group */}
                        {!modelsLoading && (() => {
                          const paid = modelList.filter(m => !m.isFree);
                          const hasFree = modelList.some(m => m.isFree);
                          if (paid.length === 0) return null;
                          return (
                            <>
                              {hasFree && <p className="px-3 pt-1 pb-0.5 text-[9px] font-medium uppercase tracking-wider text-nexus-muted/50">Paid Models</p>}
                              {paid.map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => switchModel(m.id)}
                                  className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] transition hover:bg-nexus-surface ${
                                    m.id === modelName ? "text-nexus-accent" : "text-nexus-fg"
                                  }`}
                                >
                                  <span className="truncate">{m.id}</span>
                                  {m.id === modelName && <span className="ml-2 text-[9px]">✓</span>}
                                </button>
                              ))}
                            </>
                          );
                        })()}
                        {/* Non-OpenRouter: just a flat list */}
                        {!modelsLoading && !modelList.some(m => m.isFree) && modelList.filter(m => !m.isFree).length > 0 && modelList.length > 0 && (
                          (() => {
                            // If no isFree at all, this is a direct provider — show flat list
                            const alreadyShown = modelList.filter(m => !m.isFree).length;
                            return alreadyShown === modelList.length ? null : null; // avoid double-render
                          })()
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Reasoning level dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowReasoningDropdown(!showReasoningDropdown)}
                    title="How long the AI thinks before answering"
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] transition ${
                      reasoningLevel !== "medium" ? "text-nexus-accent" : "text-nexus-muted/60"
                    } hover:bg-nexus-surface hover:text-nexus-fg`}
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 2C5 2 3 4.5 3 7c0 3 5 7 5 7s5-4 5-7c0-2.5-2-5-5-5z" stroke="currentColor" strokeWidth="1.2"/></svg>
                    {reasoning.label}
                    <svg width="7" height="7" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                  {showReasoningDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowReasoningDropdown(false)} />
                      <div className="absolute bottom-full right-0 z-50 mb-1 w-52 origin-bottom animate-dropdown rounded-xl border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
                        {REASONING_LEVELS.map(r => (
                          <button
                            key={r.id}
                            onClick={() => { setReasoningLevel(r.id); setShowReasoningDropdown(false); }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-nexus-surface ${
                              r.id === reasoningLevel ? "text-nexus-accent" : "text-nexus-fg"
                            }`}
                          >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 2C5 2 3 4.5 3 7c0 3 5 7 5 7s5-4 5-7c0-2.5-2-5-5-5z" stroke="currentColor" strokeWidth="1.2"/></svg>
                            <div>
                              <p className="text-[11px] font-medium">{r.label}</p>
                              <p className="text-[9px] text-nexus-muted/60">{r.desc}</p>
                            </div>
                            {r.id === reasoningLevel && <span className="ml-auto text-[9px]">✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Send / Stop button */}
                {loading ? (
                  <button
                    onClick={stopChat}
                    title="Stop agent"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/80 text-white transition hover:bg-red-500 animate-pulse"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-nexus-fg/80 text-nexus-bg transition hover:bg-nexus-fg disabled:opacity-30"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 12V4M5 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[9px] text-nexus-muted/30">
            Enter to send · Shift+Enter for newline
          </p>
        </div>

        {/* Approval gate */}
        {pendingApproval && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md rounded-xl border border-gold-faint bg-nexus-elevated p-5 shadow-2xl">
              <h3 className="font-display text-base font-semibold text-nexus-gold">Approve action?</h3>
              <p className="mt-1 text-xs text-nexus-muted">The agent wants to run a privileged tool.</p>
              <div className="mt-3 rounded-xl border border-nexus-border bg-nexus-bg p-3">
                <p className="font-mono text-xs font-medium text-nexus-fg">{pendingApproval.name}</p>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-nexus-fg/70">
                  {JSON.stringify(pendingApproval.arguments, null, 2)}
                </pre>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => respondApproval(false)}
                  className="rounded-xl border border-nexus-border px-3 py-1.5 text-xs text-nexus-muted transition hover:bg-nexus-surface"
                >
                  Deny
                </button>
                <button
                  onClick={() => respondApproval(true)}
                  className="rounded-xl bg-gold-sheen px-4 py-1.5 text-xs font-medium text-black transition hover:brightness-110"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <RightPanel
        messages={messages}
        toolEvents={toolEvents}
        filesChanged={[]}
        collapsed={rightPanelCollapsed}
        onToggle={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        onToggleTerminal={() => setBottomTerminalOpen(!bottomTerminalOpen)}
      />
    </div>
  );
}
