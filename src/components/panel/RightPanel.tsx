import { useState, useMemo } from "react";
import type { ToolEvent } from "../../hooks/useChat";
import type { Message } from "../../hooks/useChat";

interface Props {
  messages: Message[];
  toolEvents: ToolEvent[];
  filesChanged: string[];
  collapsed: boolean;
  onToggle: () => void;
  onToggleTerminal?: () => void;
}

export function RightPanel({ messages, toolEvents, filesChanged, collapsed, onToggle, onToggleTerminal }: Props) {
  const [activeTab, setActiveTab] = useState<"context" | "terminal">("context");

  // ── Context extraction (memoized) ──────────────────────────────────────────

  const context = useMemo(() => {
    const assistantMsgs = messages.filter(m => m.role === "assistant");

    // 1. Skills applied
    const skills = [...new Set(
      assistantMsgs.flatMap(m => m.meta?.skills ?? [])
    )];

    // 2. Models used
    const models = [...new Set(
      assistantMsgs
        .map(m => m.meta?.routedModel || m.meta?.model)
        .filter(Boolean) as string[]
    )];

    // 3. Files referenced — from tool events + file paths in content
    const toolFiles = [...new Set(
      toolEvents
        .filter(e => e.type === "result" && e.name?.startsWith("file_"))
        .map(e => e.arguments?.path as string)
        .filter(Boolean)
    )];
    const allFiles = [...new Set([...filesChanged, ...toolFiles])];

    // 4. User topics — extract key phrases from user messages
    const userMsgs = messages.filter(m => m.role === "user").map(m => m.content);
    const topics = extractTopics(userMsgs);

    // 5. Token usage totals
    const totalTokens = assistantMsgs.reduce(
      (acc, m) => {
        if (m.meta?.usage) {
          acc.input += m.meta.usage.input;
          acc.output += m.meta.usage.output;
        }
        return acc;
      },
      { input: 0, output: 0 }
    );

    // 6. Message count
    const userCount = messages.filter(m => m.role === "user").length;
    const assistantCount = assistantMsgs.length;

    return { skills, models, allFiles, topics, totalTokens, userCount, assistantCount };
  }, [messages, toolEvents, filesChanged]);

  // ── Collapsed state ────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div className="flex h-full w-10 flex-col items-center justify-start gap-2 border-l border-nexus-border/30 bg-nexus-surface/20 pt-3">
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-nexus-muted/40 transition hover:bg-nexus-surface hover:text-nexus-muted"
          title="Expand side pane"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    );
  }

  const hasContext = context.skills.length > 0 || context.models.length > 0 || context.allFiles.length > 0 || context.topics.length > 0 || messages.length > 0;

  return (
    <div className="flex h-full w-64 animate-panel flex-col border-l border-nexus-border/30 bg-nexus-surface/20">
      {/* Tab buttons */}
      <div className="flex items-center gap-0.5 border-b border-nexus-border/30 px-2 py-1.5">
        {(["context", "terminal"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1 text-[10px] capitalize transition ${
              activeTab === tab ? "bg-nexus-surface text-nexus-fg" : "text-nexus-muted/60 hover:text-nexus-muted"
            }`}
          >
            {tab === "context" ? "Context" : "Terminal"}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onToggle}
          className="rounded p-0.5 text-nexus-muted/40 hover:text-nexus-muted"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {activeTab === "context" && (
          <div className="flex flex-col gap-3">
            {/* Conversation stats */}
            {messages.length > 0 && (
              <div className="rounded-xl border border-nexus-border/30 bg-nexus-bg/50 p-3">
                <p className="text-[10px] font-medium text-nexus-muted/60 mb-1.5">This conversation</p>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-nexus-fg">{context.userCount} messages sent</span>
                  <span className="text-nexus-fg">{context.assistantCount} replies</span>
                </div>
                {context.totalTokens.input > 0 && (
                  <p className="mt-1 text-[10px] text-nexus-muted/50">
                    {formatTokens(context.totalTokens.input + context.totalTokens.output)} tokens processed
                  </p>
                )}
              </div>
            )}

            {/* Topics — what the user is asking about */}
            {context.topics.length > 0 && (
              <Section title="Topics">
                <div className="flex flex-wrap gap-1">
                  {context.topics.map((t, i) => (
                    <span key={i} className="rounded-full border border-nexus-border/30 bg-nexus-surface/50 px-2 py-0.5 text-[10px] text-nexus-fg/70">{t}</span>
                  ))}
                </div>
              </Section>
            )}

            {/* Skills applied */}
            {context.skills.length > 0 && (
              <Section title="Skills applied">
                {context.skills.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded px-2 py-1">
                    <span className="text-[9px] text-nexus-gold">✦</span>
                    <span className="text-[10px] text-nexus-fg/80">{s}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Models used */}
            {context.models.length > 0 && (
              <Section title="Models used">
                {context.models.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded px-2 py-1">
                    <span className="text-[9px] text-nexus-accent">●</span>
                    <span className="truncate text-[10px] text-nexus-fg/80">{m}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Files referenced */}
            {context.allFiles.length > 0 && (
              <Section title="Files referenced">
                {context.allFiles.slice(0, 15).map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded px-2 py-1">
                    <span className="text-[9px] text-green-400">M</span>
                    <span className="truncate text-[10px] text-nexus-fg/80" title={f}>{shortPath(f)}</span>
                  </div>
                ))}
                {context.allFiles.length > 15 && (
                  <p className="px-2 py-1 text-[9px] text-nexus-muted/40">+{context.allFiles.length - 15} more</p>
                )}
              </Section>
            )}

            {/* Empty state */}
            {!hasContext && (
              <div className="flex flex-col items-center justify-center py-8">
                <svg width="24" height="24" viewBox="0 0 16 16" fill="none" className="mb-2 text-nexus-muted/30">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 5v3M8 10v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p className="text-[11px] text-nexus-muted/40">Context appears here as you chat</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "terminal" && (
          <div className="flex flex-col items-center justify-center py-8">
            <button
              onClick={onToggleTerminal}
              className="flex flex-col items-center gap-2 rounded-xl border border-nexus-border/30 px-6 py-4 transition hover:bg-nexus-surface"
            >
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" className="text-nexus-muted/50"><path d="M2 3h12v10H2zM4 6l3 2.5L4 11M8 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p className="text-[10px] text-nexus-muted/60">Toggle Terminal</p>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Section wrapper with label */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium text-nexus-muted/60">{title}</p>
      {children}
    </div>
  );
}

/** Extract key topics from user messages — simple keyword extraction */
function extractTopics(msgs: string[]): string[] {
  const combined = msgs.join(" ").toLowerCase();
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "because", "but", "and",
    "or", "if", "while", "about", "up", "it", "its", "i", "me", "my",
    "we", "our", "you", "your", "he", "him", "his", "she", "her", "they",
    "them", "their", "this", "that", "these", "those", "what", "which",
    "who", "whom", "help", "please", "want", "need", "make", "like",
    "get", "got", "let", "know", "think", "see", "look", "use", "used",
    "find", "give", "take", "come", "go", "keep", "put", "say", "said",
    "tell", "told", "try", "tried", "show", "read", "file", "files",
  ]);

  // Extract words 3+ chars, not stop words, appearing 1+ times
  const words = combined
    .replace(/[^a-z0-9\u0E00-\u0E7F\s-]/g, " ")  // keep Thai chars + alphanumeric
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  // Count frequency
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  // Top 8 by frequency, skip very common (appears in >80% of messages)
  const threshold = Math.max(2, Math.floor(msgs.length * 0.8));
  return [...freq.entries()]
    .filter(([, count]) => count >= 2 && count <= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

/** Format token count for display */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Shorten a file path for display — show last 2 segments */
function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length <= 2 ? p : "…/" + parts.slice(-2).join("/");
}
