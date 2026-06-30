import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconChart, IconDollar, IconTrendingUp, IconLightbulb, IconType } from "../icons";

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCostUsd: number;
  totalMessages: number;
  byDay: { date: string; input: number; output: number; cost: number; messages: number }[];
  byModel: { model: string; input: number; output: number; cost: number; messages: number }[];
}

type TimeRange = "7d" | "30d" | "all";

export function TokenDashboard() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [range, setRange] = useState<TimeRange>("30d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 365;
    invoke<UsageStats>("engine_rpc", { method: "usage.stats", params: { days } })
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
      </div>
    );
  }

  if (!stats || stats.totalMessages === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <IconChart size={40} className="text-nexus-muted/30" />
        <p className="mt-3 text-sm text-nexus-muted">No usage data yet</p>
        <p className="mt-1 text-xs text-nexus-muted/60">Start chatting to see your token usage here</p>
      </div>
    );
  }

  const avgCost = stats.totalCostUsd / stats.totalMessages;
  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;

  // Find max daily cost for chart scaling
  const maxDailyCost = Math.max(...stats.byDay.map(d => d.cost), 0.001);

  return (
    <div className="flex flex-col gap-5">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["7d", "30d", "all"] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                range === r
                  ? "bg-nexus-accent text-black"
                  : "text-nexus-muted hover:bg-nexus-surface hover:text-nexus-fg"
              }`}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "All Time"}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const days = range === "7d" ? 7 : range === "30d" ? 30 : 365;
            invoke<UsageStats>("engine_rpc", { method: "usage.stats", params: { days } })
              .then(setStats)
              .catch(() => {});
          }}
          className="rounded-lg px-2 py-1 text-xs text-nexus-muted hover:bg-nexus-surface hover:text-nexus-fg"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label="Total Tokens"
          value={formatTokens(totalTokens)}
          sub={`${formatTokens(stats.totalInputTokens)} in · ${formatTokens(stats.totalOutputTokens)} out`}
          icon={<IconType size={14} />}
        />
        <SummaryCard
          label="Total Cost"
          value={`$${stats.totalCostUsd.toFixed(4)}`}
          sub={`${stats.totalMessages} messages`}
          icon={<IconDollar size={14} />}
        />
        <SummaryCard
          label="Avg / Message"
          value={`$${avgCost.toFixed(6)}`}
          sub={`${formatTokens(totalTokens / stats.totalMessages)} tokens`}
          icon={<IconTrendingUp size={14} />}
        />
        <SummaryCard
          label="Savings"
          value="—"
          sub="Caching & routing coming soon"
          icon={<IconLightbulb size={14} />}
          muted
        />
      </div>

      {/* Daily usage chart */}
      {stats.byDay.length > 0 && (
        <div className="rounded-lg border border-nexus-border bg-nexus-surface p-4">
          <h3 className="mb-3 text-xs font-medium text-nexus-fg">Daily Cost</h3>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {stats.byDay.slice(-14).map(d => {
              const heightPct = maxDailyCost > 0 ? (d.cost / maxDailyCost) * 100 : 0;
              return (
                <div
                  key={d.date}
                  className="group relative flex flex-1 flex-col items-center"
                  style={{ height: "100%" }}
                >
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full mb-1 hidden rounded bg-nexus-elevated px-2 py-1 text-[10px] text-nexus-fg shadow-lg group-hover:block z-10 whitespace-nowrap">
                    <p className="font-medium">{d.date}</p>
                    <p>${d.cost.toFixed(4)} · {d.messages} msgs</p>
                  </div>
                  {/* Bar */}
                  <div className="mt-auto w-full rounded-t-sm bg-nexus-accent/80 transition-all hover:bg-nexus-accent" style={{ height: `${Math.max(heightPct, 2)}%` }} />
                  {/* Date label (show every other) */}
                  <span className="mt-1 text-[8px] text-nexus-muted/50 truncate w-full text-center">
                    {stats.byDay.length <= 7 ? d.date.slice(5) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cost by model */}
      {stats.byModel.length > 0 && (
        <div className="rounded-lg border border-nexus-border bg-nexus-surface p-4">
          <h3 className="mb-3 text-xs font-medium text-nexus-fg">Cost by Model</h3>
          <div className="flex flex-col gap-2">
            {stats.byModel.map(m => {
              const pct = stats.totalCostUsd > 0 ? (m.cost / stats.totalCostUsd) * 100 : 0;
              return (
                <div key={m.model} className="flex items-center gap-3">
                  <div className="w-36 truncate text-xs text-nexus-fg" title={m.model}>
                    {shortModelName(m.model)}
                  </div>
                  <div className="flex-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-nexus-border">
                      <div
                        className="h-full rounded-full bg-nexus-accent/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-20 text-right text-xs text-nexus-muted">
                    ${m.cost.toFixed(4)}
                  </div>
                  <div className="w-16 text-right text-[10px] text-nexus-muted/60">
                    {m.messages} msgs
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Token breakdown */}
      <div className="rounded-lg border border-nexus-border bg-nexus-surface p-4">
        <h3 className="mb-3 text-xs font-medium text-nexus-fg">Token Breakdown</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-nexus-muted">Input tokens</span>
              <span className="text-nexus-fg">{formatTokens(stats.totalInputTokens)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-nexus-border">
              <div
                className="h-full rounded-full bg-blue-500/60"
                style={{ width: `${totalTokens > 0 ? (stats.totalInputTokens / totalTokens) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="text-nexus-muted">Output tokens</span>
              <span className="text-nexus-fg">{formatTokens(stats.totalOutputTokens)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-nexus-border">
              <div
                className="h-full rounded-full bg-nexus-accent/60"
                style={{ width: `${totalTokens > 0 ? (stats.totalOutputTokens / totalTokens) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
        {stats.totalCachedTokens > 0 && (
          <div className="mt-2 text-[10px] text-green-400/70">
            ⚡ {formatTokens(stats.totalCachedTokens)} cached tokens (savings from caching)
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, icon, muted }: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-nexus-border bg-nexus-surface p-3 ${muted ? "opacity-60" : ""}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-nexus-muted">{icon}</span>
        <span className="text-[10px] text-nexus-muted">{label}</span>
      </div>
      <p className="text-lg font-semibold text-nexus-fg">{value}</p>
      <p className="text-[10px] text-nexus-muted/60">{sub}</p>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function shortModelName(model: string): string {
  // e.g. "gpt-4o-mini" or "openai/gpt-4o-mini" → "gpt-4o-mini"
  const parts = model.split("/");
  return parts[parts.length - 1];
}
