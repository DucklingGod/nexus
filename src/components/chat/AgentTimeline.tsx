import { useState, useMemo } from "react";
import type { ToolEvent } from "../../hooks/useChat";

interface Props {
  toolEvents: ToolEvent[];
  /** Start collapsed (default true) */
  defaultCollapsed?: boolean;
}

interface TimelineStep {
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  output?: string;
  error?: string;
  elapsed_ms?: number;
  status: "success" | "error" | "pending";
}

/** Friendly tool name mapping */
const TOOL_LABELS: Record<string, string> = {
  terminal_exec: "Terminal",
  file_read: "Read file",
  file_write: "Write file",
  file_list: "List files",
  file_edit: "Edit file",
  remember: "Save memory",
  web_search: "Web search",
  web_extract: "Extract page",
  search_documents: "Search docs",
  knowledge_search: "Search facts",
  image_generate: "Generate image",
  complete_once: "AI completion",
  delegate_task: "Delegate task",
  cronjob_create: "Schedule task",
  skill_manage: "Manage skill",
  browser_navigate: "Open page",
  browser_click: "Click element",
  browser_type: "Type text",
  browser_snapshot: "Page snapshot",
};

/** Tool category icons */
const TOOL_ICONS: Record<string, string> = {
  terminal: "🖥️",
  file: "📄",
  web: "🌐",
  search: "🔍",
  remember: "🧠",
  image: "🎨",
  ai: "✨",
  delegate: "👥",
  schedule: "⏰",
  skill: "⭐",
  browser: "🌍",
};

function getToolCategory(name: string): string {
  if (name.startsWith("terminal")) return "terminal";
  if (name.startsWith("file")) return "file";
  if (name.startsWith("web") || name === "web_extract") return "web";
  if (name.includes("search") || name.includes("knowledge")) return "search";
  if (name === "remember") return "remember";
  if (name.includes("image")) return "image";
  if (name.includes("complete") || name.includes("delegate")) return "ai";
  if (name.includes("cron") || name.includes("schedule")) return "schedule";
  if (name.includes("skill")) return "skill";
  if (name.startsWith("browser")) return "browser";
  return "ai";
}

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getToolIcon(name: string): string {
  return TOOL_ICONS[getToolCategory(name)] ?? "⚙️";
}

/** Format elapsed time */
function formatElapsed(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** Extract a short preview of the arguments */
function argsPreview(args?: Record<string, unknown>): string {
  if (!args) return "";
  // Show the most relevant arg
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  const firstKey = keys[0];
  const val = args[firstKey];
  if (typeof val === "string") {
    const short = val.length > 60 ? val.slice(0, 57) + "…" : val;
    return `${firstKey}: ${short}`;
  }
  return `${firstKey}: ${JSON.stringify(val)}`;
}

export function AgentTimeline({ toolEvents, defaultCollapsed = true }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // Pair call + result events into steps
  const steps = useMemo(() => {
    const callMap = new Map<string, ToolEvent>();
    const resultMap = new Map<string, ToolEvent>();

    for (const e of toolEvents) {
      if (e.type === "call") callMap.set(e.id, e);
      else if (e.type === "result") resultMap.set(e.id, e);
    }

    const allIds = [...new Set([...callMap.keys(), ...resultMap.keys()])];
    return allIds.map((id): TimelineStep => {
      const call = callMap.get(id);
      const result = resultMap.get(id);
      return {
        id,
        name: call?.name ?? result?.name ?? "unknown",
        arguments: call?.arguments,
        output: result?.output,
        error: result?.error,
        elapsed_ms: result?.elapsed_ms,
        status: result ? (result.error ? "error" : "success") : "pending",
      };
    });
  }, [toolEvents]);

  if (steps.length === 0) return null;

  const totalMs = steps.reduce((sum, s) => sum + (s.elapsed_ms ?? 0), 0);
  const successCount = steps.filter(s => s.status === "success").length;
  const errorCount = steps.filter(s => s.status === "error").length;

  return (
    <div className="mt-2 rounded-xl border border-nexus-border/30 bg-nexus-surface/30">
      {/* Header — always visible */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-nexus-surface/50"
      >
        <svg
          width="8" height="8" viewBox="0 0 16 16" fill="none"
          className={`flex-shrink-0 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
        >
          <path d="M5 3l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-medium text-nexus-fg/80">
          {steps.length} step{steps.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[10px] text-nexus-muted/50">
          {formatElapsed(totalMs)}
        </span>
        {successCount > 0 && (
          <span className="text-[9px] text-green-400">✓{successCount}</span>
        )}
        {errorCount > 0 && (
          <span className="text-[9px] text-red-400">✗{errorCount}</span>
        )}
        {/* Mini icon bar — show tool categories used */}
        <span className="ml-auto flex items-center gap-0.5">
          {[...new Set(steps.map(s => getToolCategory(s.name)))].slice(0, 5).map((cat, i) => (
            <span key={i} className="text-[10px]">{TOOL_ICONS[cat] ?? "⚙️"}</span>
          ))}
        </span>
      </button>

      {/* Expanded timeline */}
      {!collapsed && (
        <div className="border-t border-nexus-border/20 px-3 py-2">
          <div className="relative">
            {/* Vertical line connector */}
            <div className="absolute left-[11px] top-0 bottom-0 w-px bg-nexus-border/30" />

            {steps.map((step) => {
              const isExpanded = expandedStep === step.id;
              return (
                <div key={step.id} className="relative flex gap-3 pb-2 last:pb-0">
                  {/* Node dot */}
                  <div className={`relative z-10 mt-1 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border text-[9px] ${
                    step.status === "success"
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : step.status === "error"
                        ? "border-red-500/40 bg-red-500/10 text-red-400"
                        : "border-nexus-accent/40 bg-nexus-accent/10 text-nexus-accent"
                  }`}>
                    {step.status === "success" ? "✓" : step.status === "error" ? "✗" : "…"}
                  </div>

                  {/* Step content */}
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                      className="flex w-full items-center gap-1.5 text-left"
                    >
                      <span className="text-[10px]">{getToolIcon(step.name)}</span>
                      <span className={`text-[11px] font-medium ${step.status === "error" ? "text-red-400" : "text-nexus-fg/80"}`}>
                        {getToolLabel(step.name)}
                      </span>
                      <span className="truncate text-[10px] text-nexus-muted/40" title={argsPreview(step.arguments)}>
                        {argsPreview(step.arguments)}
                      </span>
                      {step.elapsed_ms && (
                        <span className="ml-auto flex-shrink-0 text-[9px] text-nexus-muted/40">
                          {formatElapsed(step.elapsed_ms)}
                        </span>
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-1 rounded-lg border border-nexus-border/20 bg-nexus-bg/50 p-2">
                        {step.arguments && Object.keys(step.arguments).length > 0 && (
                          <div className="mb-1.5">
                            <p className="text-[9px] font-medium text-nexus-muted/50 mb-0.5">Arguments</p>
                            <pre className="whitespace-pre-wrap break-all text-[10px] text-nexus-fg/60 font-mono">
                              {JSON.stringify(step.arguments, null, 2)}
                            </pre>
                          </div>
                        )}
                        {step.output && (
                          <div className="mb-1.5">
                            <p className="text-[9px] font-medium text-nexus-muted/50 mb-0.5">Output</p>
                            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all text-[10px] text-nexus-fg/60 font-mono">
                              {step.output.length > 500 ? step.output.slice(0, 497) + "…" : step.output}
                            </pre>
                          </div>
                        )}
                        {step.error && (
                          <div>
                            <p className="text-[9px] font-medium text-red-400/70 mb-0.5">Error</p>
                            <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap break-all text-[10px] text-red-400/60 font-mono">
                              {step.error}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
