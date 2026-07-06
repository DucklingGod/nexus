import { useEffect } from "react";
import { useSettings } from "../SettingsContext";

export default function LogsTab() {
  const { logs, logsAuto, setLogsAuto, logFilter, setLogFilter, refreshLogs, handleClearLogs } = useSettings();

  useEffect(() => {
    refreshLogs();
    if (!logsAuto) return;
    const iv = setInterval(refreshLogs, 2000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsAuto]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input type="text" value={logFilter} onChange={e => setLogFilter(e.target.value)} placeholder="Filter logs…"
          className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-xs text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <button onClick={refreshLogs} className="rounded-xl border border-nexus-border px-3 py-2 text-xs text-nexus-fg hover:bg-nexus-surface">Refresh</button>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-nexus-muted">
          <input type="checkbox" checked={logsAuto} onChange={e => setLogsAuto(e.target.checked)} className="accent-nexus-accent" /> Auto
        </label>
        <button onClick={handleClearLogs} className="rounded-xl border border-nexus-border px-3 py-2 text-xs text-red-400 hover:bg-nexus-surface">Clear</button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-nexus-border bg-nexus-bg/60 p-3 font-mono text-[11px] leading-relaxed">
        {(() => {
          const q = logFilter.trim().toLowerCase();
          const filtered = q ? logs.filter(l => l.text.toLowerCase().includes(q)) : logs;
          if (filtered.length === 0) return <p className="text-nexus-muted/40">No log lines{q ? " match the filter" : " yet"}.</p>;
          return filtered.map((l, i) => {
            const err = /error|fail|✗|denied|exception/i.test(l.text);
            return (
              <div key={i} className={`whitespace-pre-wrap ${err ? "text-red-400/90" : "text-nexus-fg/80"}`}>
                <span className="text-nexus-muted/40">{new Date(l.ts).toLocaleTimeString([], { hour12: false })} </span>{l.text}
              </div>
            );
          });
        })()}
      </div>
      <p className="text-[10px] text-nexus-muted/50">Engine runtime logs (last {logs.length}) — tool calls, MCP, scheduler, connectors, errors. Captured from the sidecar.</p>
    </div>
  );
}
