import { useRef, useEffect } from "react";
import type { Message } from "../../hooks/useChat";
import { ToolCallBubble } from "./ToolCallBubble";

// Escape HTML so model output can never inject tags/handlers (XSS). We only
// re-introduce our own safe tags (strong/code/li/br) afterwards.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ponytail: simple markdown rendering (bold, code, lists) — input is escaped first
function renderContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const code = part.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-xl border border-nexus-border bg-black/40 p-3 font-mono text-xs leading-relaxed text-nexus-fg/85"
        >
          <code>{code}</code>
        </pre>
      );
    }
    let text = escapeHtml(part).replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-nexus-fg">$1</strong>');
    text = text.replace(/`(.*?)`/g, '<code class="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.82em] text-nexus-gold-light">$1</code>');
    text = text.replace(/^- (.*)/gm, '<li class="ml-4 list-disc marker:text-nexus-gold/60">$1</li>');
    text = text.replace(/\n/g, "<br />");
    return <span key={i} dangerouslySetInnerHTML={{ __html: text }} />;
  });
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {message.toolEvents && message.toolEvents.length > 0 && (
        <ToolCallBubble events={message.toolEvents} />
      )}
      {message.content || isUser ? (
        <div
          className={`max-w-[78%] px-4 py-3 text-[13.5px] leading-relaxed ${
            isUser
              ? "rounded-2xl rounded-br-md border border-gold-faint bg-nexus-gold/[0.08] text-nexus-fg"
              : "rounded-2xl rounded-bl-md border border-nexus-border bg-nexus-surface text-nexus-fg/90"
          }`}
        >
          {isUser
            ? message.content
            : message.content
              ? renderContent(message.content)
              : null}
        </div>
      ) : null}
      {/* Loading indicator when streaming tool calls but no text yet */}
      {!isUser && !message.content && (!message.toolEvents || message.toolEvents.length === 0) && (
        <div className="rounded-2xl rounded-bl-md border border-nexus-border bg-nexus-surface px-4 py-3.5">
          <span className="inline-block h-4 w-[2px] animate-pulse bg-nexus-gold align-middle" />
        </div>
      )}
    </div>
  );
}

interface ChatAreaProps {
  messages: Message[];
  loading: boolean;
  onSuggest: (text: string) => void;
}

const SUGGESTIONS = [
  "Summarize this in three bullet points",
  "Help me draft a professional email",
  "Explain a complex topic simply",
];

export function ChatArea({ messages, loading, onSuggest }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Premium empty state — gold-foil wordmark + casual starter prompts.
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <div className="text-center">
          <h2 className="font-display text-5xl font-semibold tracking-tight text-gold-foil">Nexus</h2>
          <p className="mt-3 text-sm text-nexus-muted">How can I help you today?</p>
        </div>
        <div className="flex w-full max-w-md flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSuggest(s)}
              className="rounded-xl border border-nexus-border bg-nexus-surface/60 px-4 py-3 text-left text-sm text-nexus-fg/80 transition hover:border-gold-faint hover:bg-nexus-surface hover:text-nexus-fg"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const waiting = loading && messages[messages.length - 1]?.role !== "assistant";

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {waiting && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-nexus-border bg-nexus-surface px-4 py-3.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-nexus-gold [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-nexus-gold [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-nexus-gold" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
