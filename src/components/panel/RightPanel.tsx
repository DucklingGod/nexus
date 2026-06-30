import { useState } from "react";
import type { ToolEvent } from "../../hooks/useChat";

interface Props {
  toolEvents: ToolEvent[];
  filesChanged: string[];
  collapsed: boolean;
  onToggle: () => void;
  onToggleTerminal?: () => void;
}

export function RightPanel({ toolEvents, filesChanged, collapsed, onToggle, onToggleTerminal }: Props) {
  const [activeTab, setActiveTab] = useState<"review" | "terminal" | "browser">("review");

  const uniqueFiles = filesChanged.length > 0 ? filesChanged : [...new Set(
    toolEvents
      .filter(e => e.type === "result" && e.name.startsWith("file_"))
      .map(e => e.arguments?.path as string)
      .filter(Boolean)
  )];

  const completedTools = toolEvents.filter(e => e.type === "result" && !e.error).length;
  const failedTools = toolEvents.filter(e => e.type === "result" && e.error).length;

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

  return (
    <div className="flex h-full w-64 animate-panel flex-col border-l border-nexus-border/30 bg-nexus-surface/20">
      {/* Tab buttons */}
      <div className="flex items-center gap-0.5 border-b border-nexus-border/30 px-2 py-1.5">
        {(["review", "terminal", "browser"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1 text-[10px] capitalize transition ${
              activeTab === tab ? "bg-nexus-surface text-nexus-fg" : "text-nexus-muted/60 hover:text-nexus-muted"
            }`}
          >
            {tab}
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
        {activeTab === "review" && (
          <div className="flex flex-col gap-3">
            {/* Summary card */}
            {(uniqueFiles.length > 0 || completedTools > 0) && (
              <div className="rounded-lg border border-nexus-border/30 bg-nexus-bg/50 p-3">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-nexus-fg">{uniqueFiles.length} files changed</span>
                  <span className="text-green-400">+{completedTools}</span>
                  {failedTools > 0 && <span className="text-red-400">-{failedTools}</span>}
                </div>
              </div>
            )}

            {/* Verify status */}
            {completedTools > 0 && failedTools === 0 && (
              <div className="flex items-center gap-2 rounded-md bg-green-900/15 px-3 py-2 text-[10px] text-green-400">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M5.5 8l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                All checks passed
              </div>
            )}

            {/* Changed files */}
            {uniqueFiles.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium text-nexus-muted/60">Changed files</p>
                {uniqueFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded px-2 py-1">
                    <span className="text-[9px] text-green-400">M</span>
                    <span className="truncate text-[10px] text-nexus-fg/80">{f}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tool log */}
            {toolEvents.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium text-nexus-muted/60">Activity</p>
                {toolEvents.filter(e => e.type === "result").slice(-10).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 rounded px-2 py-1">
                    <span className={`text-[8px] ${e.error ? "text-red-400" : "text-green-400"}`}>
                      {e.error ? "✗" : "✓"}
                    </span>
                    <span className="truncate text-[10px] text-nexus-fg/70">{e.name}</span>
                    {e.elapsed_ms && <span className="text-[8px] text-nexus-muted/40">{e.elapsed_ms}ms</span>}
                  </div>
                ))}
              </div>
            )}

            {toolEvents.length === 0 && uniqueFiles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-[11px] text-nexus-muted/40">Choose a tab to open in the side pane.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "terminal" && (
          <div className="flex flex-col items-center justify-center py-8">
            <button
              onClick={onToggleTerminal}
              className="flex flex-col items-center gap-2 rounded-lg border border-nexus-border/30 px-6 py-4 transition hover:bg-nexus-surface"
            >
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" className="text-nexus-muted/50"><path d="M2 3h12v10H2zM4 6l3 2.5L4 11M8 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p className="text-[10px] text-nexus-muted/60">Toggle Terminal</p>
            </button>
          </div>
        )}

        {activeTab === "browser" && (
          <div className="flex flex-col items-center justify-center py-8">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none" className="mb-2 text-nexus-muted/30"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M2 8h12M8 2c-2 2-2 4-2 6s0 4 2 6M8 2c2 2 2 4 2 6s0 4-2 6" stroke="currentColor" strokeWidth="1.2"/></svg>
            <p className="text-[10px] text-nexus-muted/40">Browser preview — coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
