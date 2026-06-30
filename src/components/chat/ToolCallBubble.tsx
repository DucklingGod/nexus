import { useState } from "react";
import type { ToolEvent } from "../../hooks/useChat";
import { IconSearch, IconGlobe, IconFolder, IconWrench, IconTerminal, IconClipboard, IconBrain, IconGear } from "../icons";

// Tool icons by category
const TOOL_ICONS: Record<string, React.FC<{ size?: number }>> = {
  web_search: IconSearch,
  web_fetch: IconGlobe,
  file_read: IconFolder,
  file_write: IconFolder,
  file_list: IconFolder,
  search_files: IconSearch,
  patch: IconWrench,
  terminal_exec: IconTerminal,
  execute_code: IconTerminal,
  process_start: IconGear,
  process_kill: IconGear,
  todo_read: IconClipboard,
  todo_write: IconClipboard,
  knowledge_save: IconBrain,
  knowledge_search: IconBrain,
  knowledge_list: IconBrain,
  knowledge_delete: IconBrain,
};

function ToolIcon({ name }: { name: string }) {
  const Comp = TOOL_ICONS[name] ?? IconWrench;
  return <Comp size={13} />;
}

// Compact args display
function ArgsPreview({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-0.5">
      {entries.slice(0, 4).map(([key, val]) => {
        const display = typeof val === "string" ? val : JSON.stringify(val);
        const truncated = display.length > 80 ? display.slice(0, 80) + "…" : display;
        return (
          <div key={key} className="flex gap-1.5 font-mono text-[10.5px]">
            <span className="text-nexus-muted">{key}:</span>
            <span className="text-nexus-fg/70 truncate">{truncated}</span>
          </div>
        );
      })}
      {entries.length > 4 && (
        <span className="text-[10px] text-nexus-muted">+{entries.length - 4} more</span>
      )}
    </div>
  );
}

// Result preview with expand
function ResultPreview({ output, error }: { output?: string; error?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!output && !error) return null;

  const text = error ? `Error: ${error}` : output!;
  const preview = text.length > 120 ? text.slice(0, 120) + "…" : text;

  return (
    <div className="mt-1.5">
      <pre
        className={`whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed ${
          error ? "text-red-400" : "text-nexus-fg/60"
        }`}
      >
        {expanded ? text : preview}
      </pre>
      {text.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] text-nexus-gold hover:text-nexus-gold-light"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

interface ToolCallBubbleProps {
  events: ToolEvent[];
}

export function ToolCallBubble({ events }: ToolCallBubbleProps) {
  const [open, setOpen] = useState(false);

  if (events.length === 0) return null;

  // Group call + result pairs
  const calls = events.filter((e) => e.type === "call");
  const results = events.filter((e) => e.type === "result");
  const resultMap = new Map(results.map((r) => [r.id, r]));

  // Summary line
  const toolNames = [...new Set(calls.map((c) => c.name))];
  const summary =
    calls.length === 1
      ? `${calls[0].name}`
      : `${toolNames.join(", ")} (${calls.length} calls)`;

  return (
    <div className="flex justify-start">
      <div className="max-w-[78%]">
        {/* Toggle bar */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-lg border border-nexus-border/60 bg-nexus-elevated/80 px-3 py-1.5 text-xs text-nexus-muted transition hover:border-nexus-border hover:text-nexus-fg/80"
        >
          <span className="text-nexus-gold/70"><IconGear size={13} /></span>
          <span className="font-medium">Used {summary}</span>
          <span className="text-[10px] text-nexus-muted">
            {open ? "▲" : "▼"}
          </span>
          {/* Elapsed time if available */}
          {results.some((r) => r.elapsed_ms) && (
            <span className="text-[10px] text-nexus-muted/70">
              {results.reduce((acc, r) => acc + (r.elapsed_ms ?? 0), 0)}ms
            </span>
          )}
        </button>

        {/* Expanded detail */}
        {open && (
          <div className="mt-1 space-y-1 rounded-lg border border-nexus-border/40 bg-nexus-surface/80 p-2.5">
            {calls.map((call) => {
              const result = resultMap.get(call.id);
              return (
                <div
                  key={call.id}
                  className="rounded-md border border-nexus-border/30 bg-nexus-bg/60 px-2.5 py-2"
                >
                  <div className="flex items-center gap-1.5">
                    <ToolIcon name={call.name} />
                    <span className="font-mono text-[11px] font-medium text-nexus-gold-light">
                      {call.name}
                    </span>
                    {result?.elapsed_ms != null && (
                      <span className="text-[9px] text-nexus-muted/60">
                        {result.elapsed_ms}ms
                      </span>
                    )}
                    {result?.error && (
                      <span className="rounded bg-red-950/60 px-1 text-[9px] text-red-400">
                        error
                      </span>
                    )}
                    {result && !result.error && (
                      <span className="rounded bg-green-950/60 px-1 text-[9px] text-green-400">
                        ok
                      </span>
                    )}
                  </div>
                  {call.arguments && <ArgsPreview args={call.arguments} />}
                  {result && <ResultPreview output={result.output} error={result.error} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
