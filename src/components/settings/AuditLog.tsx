import { useState, useEffect, useCallback, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IconSearch, IconShield } from '../icons';
import { EmptyState } from '../common/EmptyState';

interface AuditEntry {
  id: string;
  toolName: string;
  status: 'success' | 'failed';
  duration: number;
  timestamp: number;
  input?: unknown;
  output?: unknown;
}

type StatusFilter = 'all' | 'success' | 'failed';

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<{ entries: AuditEntry[] }>('engine_rpc', {
        method: 'audit.list',
        params: {},
      });
      setEntries(result.entries ?? []);
    } catch {
      setError('No audit data available');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const filtered = entries.filter((e) => {
    const matchesSearch = e.toolName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function handleExport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: ignore
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium text-nexus-fg">Audit Log</h3>
        <div className="flex items-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
          <span className="text-sm text-nexus-muted">Loading audit data…</span>
        </div>
      </div>
    );
  }

  if (error || entries.length === 0) {
    return (
      <EmptyState
        icon={<IconShield size={32} />}
        title="No Audit Data"
        description="Audit entries will appear here as the agent executes tools during conversations."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-nexus-fg">Audit Log</h3>
        <button
          onClick={handleExport}
          className="rounded-lg border border-nexus-border px-3 py-1.5 text-xs text-nexus-muted hover:bg-nexus-surface hover:text-nexus-accent transition"
        >
          {copied ? '✓ Copied' : 'Export JSON'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <IconSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-nexus-muted/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tool name…"
            className="w-full rounded-lg border border-nexus-border bg-nexus-surface py-2 pl-8 pr-3 text-xs text-nexus-fg placeholder-nexus-muted/40 outline-none focus:border-nexus-accent"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'success', 'failed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize transition ${
                statusFilter === s
                  ? 'border-nexus-accent bg-nexus-surface text-nexus-accent'
                  : 'border-nexus-border text-nexus-muted hover:text-nexus-fg'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-nexus-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-nexus-border bg-nexus-surface/40">
              <th className="px-4 py-2.5 font-medium text-nexus-muted">Tool Name</th>
              <th className="px-4 py-2.5 font-medium text-nexus-muted">Status</th>
              <th className="px-4 py-2.5 font-medium text-nexus-muted">Duration</th>
              <th className="px-4 py-2.5 font-medium text-nexus-muted">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <Fragment key={entry.id}>
                <tr
                  onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                  className="cursor-pointer border-b border-nexus-border/50 transition hover:bg-nexus-surface/30 last:border-b-0"
                >
                  <td className="px-4 py-2.5 font-mono text-nexus-fg">{entry.toolName}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        entry.status === 'success'
                          ? 'bg-green-950/40 text-green-400 border border-green-900/30'
                          : 'bg-red-950/40 text-red-400 border border-red-900/30'
                      }`}
                    >
                      {entry.status === 'success' ? '✓' : '✗'} {entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-nexus-muted">{formatDuration(entry.duration)}</td>
                  <td className="px-4 py-2.5 text-nexus-muted">{formatTimestamp(entry.timestamp)}</td>
                </tr>
                {expandedRow === entry.id && (
                  <tr key={`${entry.id}-detail`}>
                    <td colSpan={4} className="border-b border-nexus-border/50 bg-nexus-bg px-4 py-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-nexus-muted/60">Input</p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-nexus-border bg-nexus-surface p-2 font-mono text-[10px] text-nexus-fg/70">
                            {entry.input ? JSON.stringify(entry.input, null, 2) : '—'}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-nexus-muted/60">Output</p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-nexus-border bg-nexus-surface p-2 font-mono text-[10px] text-nexus-fg/70">
                            {entry.output ? JSON.stringify(entry.output, null, 2) : '—'}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-nexus-muted/40">
        {filtered.length} of {entries.length} entries
      </p>
    </div>
  );
}
