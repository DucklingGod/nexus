import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────────

interface CatalogServer {
  id: string;
  name: string;
  title?: string;
  description?: string;
  transport: "stdio" | "http";
  packageIdentifier?: string;
  registryType?: string;
  repositoryUrl?: string;
  status?: string;
  installed: boolean;
}

interface McpServerState {
  config: {
    id: string;
    name: string;
    type: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
  };
  status: "disconnected" | "connecting" | "connected" | "error";
  tools: string[];
  error?: string;
}

interface SkillState {
  id: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  source: "builtin" | "custom";
}

type Tab = "catalog" | "skills" | "installed";

// ── Component ──────────────────────────────────────────────────────────────

export function MarketplaceView() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [notice, setNotice] = useState<string | null>(null);

  function flash(msg: string) { setNotice(msg); setTimeout(() => setNotice(null), 4000); }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-nexus-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl font-semibold text-nexus-fg">Marketplace</h1>
          <p className="text-xs text-nexus-muted">Extend Nexus with MCP servers, skills, and plugins</p>
        </div>
        <div className="mt-3 flex gap-1">
          {([
            { id: "catalog", label: "MCP Servers" },
            { id: "skills", label: "Skills & Plugins" },
            { id: "installed", label: "Installed" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs transition ${tab === t.id ? "bg-nexus-surface text-nexus-gold" : "text-nexus-muted hover:bg-nexus-surface hover:text-nexus-fg"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="mx-6 mt-3 rounded-lg border border-gold-faint bg-nexus-surface px-4 py-2 text-xs text-nexus-gold animate-dropdown">{notice}</div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {tab === "catalog" && <CatalogTab flash={flash} />}
        {tab === "skills" && <SkillsTab flash={flash} />}
        {tab === "installed" && <InstalledTab flash={flash} />}
      </div>
    </div>
  );
}

// ── Tab 1: MCP catalog (live registry) ─────────────────────────────────────

function CatalogTab({ flash }: { flash: (m: string) => void }) {
  const [servers, setServers] = useState<CatalogServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await invoke<{ servers: CatalogServer[]; error?: string }>("engine_rpc", { method: "mcp.catalog", params: { limit: 100, query: query.trim() || undefined } });
    setServers(r.servers ?? []);
    setError(r.error ?? null);
    setLoading(false);
  }, [query]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  // Debounced re-fetch on query change.
  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
  }, [query, load]);

  async function install(s: CatalogServer) {
    setInstalling(s.id);
    try {
      // Build the McpServerConfig from the catalog entry.
      const cfg =
        s.transport === "stdio"
          ? { id: s.name, name: s.name, type: "stdio" as const,
              command: s.registryType === "pypi" ? "uvx" : "npx",
              args: ["-y", s.packageIdentifier ?? s.name] }
          : { id: s.name, name: s.name, type: "http" as const, url: `https://${s.name}` };
      await invoke("engine_rpc", { method: "mcp.add", params: cfg });
      const r = await invoke<{ server: McpServerState }>("engine_rpc", { method: "mcp.connect", params: { id: s.name } });
      const tools = r.server.tools.length;
      if (r.server.status === "connected") flash(`Installed ${s.name} — ${tools} tool${tools === 1 ? "" : "s"} available`);
      else flash(`Installed ${s.name} but connection failed: ${r.server.error ?? r.server.status}`);
      setServers(prev => prev.map(x => x.id === s.id ? { ...x, installed: true } : x));
    } catch (e) { flash(`Install failed: ${e}`); }
    finally { setInstalling(null); }
  }

  if (loading) return <p className="text-xs text-nexus-muted">Loading catalog from the MCP registry…</p>;

  return (
    <div className="flex flex-col gap-4">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the MCP registry…"
        className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
      {error && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3">
          <p className="text-xs text-red-400">Couldn't reach the registry: {error}</p>
          <p className="mt-1 text-[11px] text-nexus-muted">You can still add a server manually from the “Installed” tab.</p>
        </div>
      )}
      {!loading && servers.length === 0 && !error && (
        <p className="text-xs text-nexus-muted">No servers match “{query}”.</p>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {servers.map(s => (
          <div key={s.id} className="flex flex-col gap-2 rounded-lg border border-nexus-border bg-nexus-surface/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-nexus-fg">{s.title ?? s.name}</p>
                <p className="truncate text-[10px] text-nexus-muted/60">{s.name}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${s.transport === "stdio" ? "bg-emerald-500/15 text-emerald-400" : "bg-sky-500/15 text-sky-400"}`}>
                {s.transport}
              </span>
            </div>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-nexus-muted">{s.description ?? "No description."}</p>
            <div className="flex items-center justify-between">
              {s.repositoryUrl ? (
                <a href={s.repositoryUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-nexus-muted/60 hover:text-nexus-gold">repo ↗</a>
              ) : <span />}
              {s.installed ? (
                <span className="text-[10px] text-emerald-400">✓ installed</span>
              ) : (
                <button onClick={() => install(s)} disabled={installing === s.id}
                  className="rounded-md bg-gold-sheen px-3 py-1 text-[11px] font-medium text-black transition hover:brightness-110 disabled:opacity-50">
                  {installing === s.id ? "Installing…" : "Install"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-nexus-muted/50">Catalog from <code className="text-nexus-gold-light">registry.modelcontextprotocol.io</code>. stdio servers run as a local subprocess (npx/uvx); http servers connect over streamable-HTTP.</p>
    </div>
  );
}

// ── Tab 2: Skills & plugins from a repo URL ────────────────────────────────

function SkillsTab({ flash }: { flash: (m: string) => void }) {
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [recent, setRecent] = useState<{ repo: string; imported: number }[]>([]);

  async function installFromUrl() {
    if (!url.trim() || installing) return;
    setInstalling(true);
    try {
      const r = await invoke<{ imported: number; scanned: number; repo: string }>("engine_rpc", { method: "skills.importGithub", params: { url: url.trim() } });
      setRecent(prev => [{ repo: r.repo, imported: r.imported }, ...prev].slice(0, 8));
      flash(r.imported > 0 ? `Imported ${r.imported} skill${r.imported === 1 ? "" : "s"} from ${r.repo}` : `No new skills found in ${r.repo}`);
      setUrl("");
    } catch (e) { flash(`Import failed: ${e}`); }
    finally { setInstalling(false); }
  }

  const POPULAR = [
    { url: "https://github.com/NousResearch/hermes-agent", label: "Hermes Agent skills", desc: "1000+ Hermes skills (SKILL.md)" },
    { url: "https://github.com/modelcontextprotocol/servers", label: "MCP reference servers", desc: "Reference implementations" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-nexus-muted">Install skills (SKILL.md format) or plugins from a public GitHub repository. Nexus scans the repo for skill files and imports them.</p>
      <div className="flex gap-2">
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/owner/repo"
          className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <button onClick={installFromUrl} disabled={installing || !url.trim()}
          className="rounded-lg bg-gold-sheen px-4 py-2 text-sm font-medium text-black transition hover:brightness-110 disabled:opacity-50">
          {installing ? "Installing…" : "Install"}
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-nexus-fg">Popular skill repos</h3>
        <div className="flex flex-col gap-2">
          {POPULAR.map(p => (
            <button key={p.url} onClick={() => setUrl(p.url)}
              className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface/50 px-3 py-2 text-left transition hover:border-nexus-accent">
              <div><p className="text-xs text-nexus-fg">{p.label}</p><p className="text-[10px] text-nexus-muted">{p.desc}</p></div>
              <span className="text-[10px] text-nexus-muted">use →</span>
            </button>
          ))}
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-nexus-fg">Recently installed</h3>
          <div className="flex flex-col gap-1">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-nexus-border/40 bg-nexus-surface/30 px-3 py-1.5">
                <span className="truncate text-[11px] text-nexus-fg/80">{r.repo}</span>
                <span className="text-[10px] text-emerald-400">+{r.imported}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Installed (manage everything) ───────────────────────────────────

function InstalledTab({ flash }: { flash: (m: string) => void }) {
  const [mcpServers, setMcpServers] = useState<McpServerState[]>([]);
  const [skills, setSkills] = useState<SkillState[]>([]);
  // Manual add form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ id: "", name: "", type: "stdio", command: "npx", args: "", url: "" });

  const load = useCallback(async () => {
    const m = await invoke<{ servers: McpServerState[] }>("engine_rpc", { method: "mcp.list", params: {} }).catch(() => ({ servers: [] }));
    setMcpServers(m.servers ?? []);
    const s = await invoke<{ skills: SkillState[] }>("engine_rpc", { method: "skills.list", params: {} }).catch(() => ({ skills: [] }));
    setSkills(s.skills ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleConnect(s: McpServerState) {
    if (s.status === "connected") {
      await invoke("engine_rpc", { method: "mcp.disconnect", params: { id: s.config.id } }).catch(() => {});
    } else {
      const r = await invoke<{ server: McpServerState }>("engine_rpc", { method: "mcp.connect", params: { id: s.config.id } }).catch(() => null);
      if (r && r.server.status === "connected") flash(`Connected ${s.config.name} — ${r.server.tools.length} tools`);
      else if (r) flash(`Connection failed: ${r.server.error ?? r.server.status}`);
    }
    load();
  }

  async function removeServer(id: string) {
    await invoke("engine_rpc", { method: "mcp.remove", params: { id } }).catch(() => {});
    load();
  }

  async function addManual() {
    if (!addForm.id.trim() || !addForm.name.trim()) { flash("ID and name required"); return; }
    const cfg = addForm.type === "stdio"
      ? { id: addForm.id.trim(), name: addForm.name.trim(), type: "stdio" as const, command: addForm.command.trim() || "npx", args: addForm.args.trim() ? addForm.args.split(/\s+/) : [] }
      : { id: addForm.id.trim(), name: addForm.name.trim(), type: "http" as const, url: addForm.url.trim() };
    await invoke("engine_rpc", { method: "mcp.add", params: cfg }).catch((e) => flash(`Add failed: ${e}`));
    setShowAdd(false); setAddForm({ id: "", name: "", type: "stdio", command: "npx", args: "", url: "" });
    load();
  }

  async function toggleSkill(id: string, enabled: boolean) {
    await invoke("engine_rpc", { method: "skills.setEnabled", params: { id, enabled } });
    load();
  }

  const customSkills = skills.filter(s => s.source === "custom");
  const dot = (st: string) => st === "connected" ? "bg-emerald-400" : st === "connecting" ? "bg-amber-400" : st === "error" ? "bg-red-400" : "bg-nexus-muted/40";

  return (
    <div className="flex flex-col gap-5">
      {/* MCP servers */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-nexus-fg">MCP servers ({mcpServers.length})</h3>
          <button onClick={() => setShowAdd(!showAdd)} className="rounded-md border border-nexus-border px-3 py-1 text-xs text-nexus-fg hover:bg-nexus-surface">+ Add manually</button>
        </div>
        {showAdd && (
          <div className="mb-2 rounded-lg border border-nexus-border bg-nexus-surface/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              <input value={addForm.id} onChange={e => setAddForm({ ...addForm, id: e.target.value })} placeholder="id (lowercase)" className="rounded-md border border-nexus-border bg-nexus-surface px-2 py-1.5 text-xs text-nexus-fg outline-none focus:border-nexus-accent" />
              <input value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="name" className="rounded-md border border-nexus-border bg-nexus-surface px-2 py-1.5 text-xs text-nexus-fg outline-none focus:border-nexus-accent" />
              <select value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })} className="rounded-md border border-nexus-border bg-nexus-surface px-2 py-1.5 text-xs text-nexus-fg outline-none focus:border-nexus-accent">
                <option value="stdio">stdio</option>
                <option value="http">http</option>
              </select>
              {addForm.type === "stdio" ? (
                <>
                  <input value={addForm.command} onChange={e => setAddForm({ ...addForm, command: e.target.value })} placeholder="command (npx)" className="rounded-md border border-nexus-border bg-nexus-surface px-2 py-1.5 text-xs text-nexus-fg outline-none focus:border-nexus-accent" />
                  <input value={addForm.args} onChange={e => setAddForm({ ...addForm, args: e.target.value })} placeholder="args (-y @pkg/foo)" className="col-span-2 rounded-md border border-nexus-border bg-nexus-surface px-2 py-1.5 text-xs text-nexus-fg outline-none focus:border-nexus-accent" />
                </>
              ) : (
                <input value={addForm.url} onChange={e => setAddForm({ ...addForm, url: e.target.value })} placeholder="https://server.url/mcp" className="col-span-2 rounded-md border border-nexus-border bg-nexus-surface px-2 py-1.5 text-xs text-nexus-fg outline-none focus:border-nexus-accent" />
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={addManual} className="rounded-md bg-nexus-accent px-3 py-1 text-xs font-medium text-black hover:opacity-90">Add + connect</button>
              <button onClick={() => setShowAdd(false)} className="rounded-md border border-nexus-border px-3 py-1 text-xs text-nexus-muted hover:bg-nexus-surface">Cancel</button>
            </div>
          </div>
        )}
        {mcpServers.length === 0 ? (
          <p className="text-xs text-nexus-muted/60">No MCP servers installed. Browse the “MCP Servers” tab to add one.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mcpServers.map(s => (
              <div key={s.config.id} className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot(s.status)}`} title={s.status} />
                    <span className="text-sm text-nexus-fg">{s.config.name}</span>
                    <span className="rounded-full bg-nexus-border/40 px-1.5 py-0.5 text-[9px] text-nexus-muted">{s.config.type}</span>
                    {s.tools.length > 0 && <span className="text-[10px] text-nexus-muted/60">{s.tools.length} tools</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleConnect(s)} className="rounded-md border border-nexus-border px-2 py-0.5 text-[10px] text-nexus-fg hover:bg-nexus-surface">
                      {s.status === "connected" ? "Disconnect" : "Connect"}
                    </button>
                    <button onClick={() => removeServer(s.config.id)} className="rounded-md px-2 py-0.5 text-[10px] text-red-400/70 hover:bg-nexus-surface hover:text-red-400">Remove</button>
                  </div>
                </div>
                {s.error && <p className="mt-1 text-[10px] text-red-400/70">{s.error}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom skills */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-nexus-fg">Custom skills ({customSkills.length})</h3>
        {customSkills.length === 0 ? (
          <p className="text-xs text-nexus-muted/60">No custom skills. Install some from the “Skills & Plugins” tab.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {customSkills.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-nexus-border/40 bg-nexus-surface/30 px-3 py-1.5">
                <div className="min-w-0"><p className="truncate text-xs text-nexus-fg">{s.name}</p><p className="truncate text-[10px] text-nexus-muted">{s.category}</p></div>
                <button onClick={() => toggleSkill(s.id, !s.enabled)}
                  className={`relative h-5 w-9 flex-shrink-0 rounded-full transition ${s.enabled ? "bg-nexus-accent" : "bg-nexus-border"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${s.enabled ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
