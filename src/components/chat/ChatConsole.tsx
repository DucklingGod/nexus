import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useChat } from "../../hooks/useChat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { RightPanel } from "../panel/RightPanel";
import { ErrorToast } from "../common/ErrorToast";
import { EmptyState } from "../common/EmptyState";
import { getUserMessage } from "../../lib/errorHandler";
import { IconHand, IconCheckCircle, IconClipboard, IconShield } from "../icons";
import { open } from "@tauri-apps/plugin-dialog";

/** Collapsible reasoning/thinking block — shows model's internal reasoning */
function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-nexus-border/30 bg-nexus-surface/30">
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
  { id: "plan", label: "Plan mode", icon: "clipboard", desc: "Plan before editing" },
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
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
];

interface Props {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}

export function ChatConsole({ conversationId, onConversationCreated }: Props) {
  const { messages, sendMessage, loading, error, stopChat, pendingApproval, respondApproval, toolEvents } = useChat(conversationId, onConversationCreated);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [bottomTerminalOpen, setBottomTerminalOpen] = useState(false);
  const [safetyMode, setSafetyMode] = useState("ask");
  const [showSafetyDropdown, setShowSafetyDropdown] = useState(false);
  const [reasoningLevel, setReasoningLevel] = useState("medium");
  const [showReasoningDropdown, setShowReasoningDropdown] = useState(false);
  const [modelName, setModelName] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelList, setModelList] = useState<{ id: string; isFree?: boolean }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [lastSentContent, setLastSentContent] = useState<string | null>(null);
  const [lastReasoningLevel, setLastReasoningLevel] = useState<string>("medium");
  const [errorDismissed, setErrorDismissed] = useState(false);

  // Reset dismissed flag when error changes
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  // Load current provider + model
  useEffect(() => {
    invoke<{ provider: string; model: string; baseUrl: string } | null>("provider_get")
      .then(cfg => {
        if (cfg) {
          setModelName(cfg.model);
          setProviderId(cfg.provider);
          setBaseUrl(cfg.baseUrl);
        }
      })
      .catch(() => {});
  }, []);

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
    } catch { /* ignore */ }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const msg = input;
    setLastSentContent(msg);
    setLastReasoningLevel(reasoningLevel);
    setInput("");
    await sendMessage(msg, reasoningLevel, safetyMode);
  }

  async function attachFile() {
    try {
      const path = await open({ multiple: false, title: "Attach a file for the agent to read" });
      if (typeof path === "string") {
        setInput(prev => prev.trim() ? `${prev}\nRead this file: ${path}` : `Read this file: ${path}`);
      }
    } catch { /* cancelled */ }
  }

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
      sendMessage(lastSentContent, lastReasoningLevel, safetyMode);
    }
  }, [lastSentContent, lastReasoningLevel, safetyMode, sendMessage]);

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

  return (
    <div className="flex h-full">
      {/* Main chat + bottom terminal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {isEmpty ? (
          /* Empty state — ZCode-style greeting + faint watermark */
          <EmptyState
            icon={
              <span className="text-gold-foil font-display text-6xl font-bold leading-none select-none">N</span>
            }
            title={`${greeting}, ready when you are`}
            description="Type a message below to start a conversation with Nexus."
          />
        ) : (
          /* Conversation */
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
            {messages.map((msg) => (
              <div key={msg.id} className="mb-4">
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-nexus-surface px-4 py-2.5">
                      <p className="text-sm text-nexus-fg">{msg.content}</p>
                      <p className="mt-1 text-[9px] text-nexus-muted/40">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Reasoning/thinking block — collapsible */}
                    {msg.reasoning && (
                      <ReasoningBlock text={msg.reasoning} />
                    )}
                    {msg.toolEvents && msg.toolEvents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.toolEvents.filter(e => e.type === "result").map((e, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded-full border border-nexus-border/30 bg-nexus-surface/50 px-2.5 py-1 text-[10px]">
                            <span className={e.error ? "text-red-400" : "text-green-400"}>
                              {e.error ? "✗" : "✓"}
                            </span>
                            <span className="text-nexus-fg/70">{e.name}</span>
                            {e.elapsed_ms && <span className="text-nexus-muted/40">{e.elapsed_ms}ms</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.meta && (msg.meta.skills?.length || msg.meta.routedModel || msg.meta.cached) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.meta.cached && (
                          <span className="flex items-center gap-1 rounded-full border border-gold-faint bg-nexus-surface/50 px-2.5 py-1 text-[10px] text-nexus-gold">↺ cached</span>
                        )}
                        {msg.meta.routedModel && (
                          <span title="Smart model routing chose this model" className="flex items-center gap-1 rounded-full border border-nexus-border/30 bg-nexus-surface/50 px-2.5 py-1 text-[10px] text-nexus-muted">↘ {msg.meta.routedModel}</span>
                        )}
                        {msg.meta.skills?.map((s) => (
                          <span key={s} title="Skill auto-applied" className="flex items-center gap-1 rounded-full border border-gold-faint bg-nexus-surface/50 px-2.5 py-1 text-[10px] text-nexus-gold/90">✦ {s}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="max-w-[85%]">
                      <div className="text-sm text-nexus-fg/90">
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
            {loading && (
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

        {/* Bottom input — ZCode style */}
        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl rounded-xl border border-nexus-border/40 bg-nexus-surface/60 shadow-lg shadow-black/20">
            {/* Input field */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Nexus anything, @ to add files, / for commands, $ for skills"
              rows={1}
              className="w-full resize-none bg-transparent px-4 py-3 text-sm text-nexus-fg placeholder-nexus-muted/40 outline-none"
            />

            {/* Bottom controls */}
            <div className="flex items-center justify-between border-t border-nexus-border/20 px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                {/* + attach file */}
                <button onClick={attachFile} title="Attach a file" className="rounded-md p-1 text-nexus-muted/40 transition hover:bg-nexus-surface hover:text-nexus-muted">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </button>

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
                      <div className="absolute bottom-full left-0 z-50 mb-1 w-52 origin-bottom animate-dropdown rounded-lg border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
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
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-nexus-border/40 text-[8px] text-nexus-muted/60" title="Context tokens used">
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
                    {modelName || "No model"}
                    <svg width="7" height="7" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                  {showModelDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowModelDropdown(false)} />
                      <div className="absolute bottom-full right-0 z-50 mb-1 max-h-72 w-64 origin-bottom animate-dropdown overflow-y-auto rounded-lg border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
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
                      <div className="absolute bottom-full right-0 z-50 mb-1 w-28 origin-bottom animate-dropdown rounded-lg border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
                        {REASONING_LEVELS.map(r => (
                          <button
                            key={r.id}
                            onClick={() => { setReasoningLevel(r.id); setShowReasoningDropdown(false); }}
                            className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] transition hover:bg-nexus-surface ${
                              r.id === reasoningLevel ? "text-nexus-accent" : "text-nexus-fg"
                            }`}
                          >
                            {r.label}
                            {r.id === reasoningLevel && <span className="text-[9px]">✓</span>}
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
              <div className="mt-3 rounded-lg border border-nexus-border bg-nexus-bg p-3">
                <p className="font-mono text-xs font-medium text-nexus-fg">{pendingApproval.name}</p>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-nexus-fg/70">
                  {JSON.stringify(pendingApproval.arguments, null, 2)}
                </pre>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => respondApproval(false)}
                  className="rounded-lg border border-nexus-border px-3 py-1.5 text-xs text-nexus-muted transition hover:bg-nexus-surface"
                >
                  Deny
                </button>
                <button
                  onClick={() => respondApproval(true)}
                  className="rounded-lg bg-gold-sheen px-4 py-1.5 text-xs font-medium text-black transition hover:brightness-110"
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
        toolEvents={toolEvents}
        filesChanged={[]}
        collapsed={rightPanelCollapsed}
        onToggle={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        onToggleTerminal={() => setBottomTerminalOpen(!bottomTerminalOpen)}
      />
    </div>
  );
}
