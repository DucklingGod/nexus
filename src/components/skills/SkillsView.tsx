import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface SkillState {
  id: string;
  name: string;
  category: string;
  description: string;
  triggers: string[];
  instructions: string;
  enabled: boolean;
  source: "builtin" | "custom";
  auto: boolean;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`relative h-5 w-9 flex-shrink-0 rounded-full transition ${on ? "bg-nexus-accent" : "bg-nexus-border"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export function SkillsView() {
  const [skills, setSkills] = useState<SkillState[]>([]);
  const [autoApply, setAutoApply] = useState(true);
  const [autoCreate, setAutoCreate] = useState(false);
  const [semantic, setSemantic] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [nName, setNName] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nTriggers, setNTriggers] = useState("");
  const [nInstr, setNInstr] = useState("");

  const load = useCallback(async () => {
    const r = await invoke<{ skills: SkillState[] }>("engine_rpc", { method: "skills.list", params: {} }).catch(() => ({ skills: [] }));
    setSkills(r.skills ?? []);
    const all = await invoke<Record<string, string>>("engine_rpc", { method: "settings.getAll", params: {} }).catch(() => ({} as Record<string, string>));
    setAutoApply(all["skills.enabled"] !== "false");
    setAutoCreate(all["skills.autoCreate"] === "true");
    setSemantic(all["skills.semantic"] === "true");
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setMaster(key: string, val: boolean) {
    await invoke("engine_rpc", { method: "settings.set", params: { key, value: val ? "true" : "false" } }).catch(() => {});
  }
  async function toggleSkill(id: string, enabled: boolean) {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
    await invoke("engine_rpc", { method: "skills.setEnabled", params: { id, enabled } }).catch(() => {});
  }
  async function deleteSkill(id: string) {
    setSkills(prev => prev.filter(s => s.id !== id));
    await invoke("engine_rpc", { method: "skills.delete", params: { id } }).catch(() => {});
  }
  async function createSkill() {
    if (!nName.trim() || !nInstr.trim()) return;
    const triggers = nTriggers.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    await invoke("engine_rpc", { method: "skills.create", params: { name: nName.trim(), description: nDesc.trim(), triggers, instructions: nInstr.trim() } }).catch(() => {});
    setNName(""); setNDesc(""); setNTriggers(""); setNInstr(""); setShowForm(false);
    await load();
  }
  async function importSkills(dir?: string) {
    const r = await invoke<{ imported: number; scanned: number; dir: string }>("engine_rpc", { method: "skills.import", params: dir ? { dir } : {} }).catch(() => null);
    if (r) {
      setNotice(r.scanned === 0 ? `No SKILL.md files found in ${r.dir}` : `Imported ${r.imported} new skill${r.imported === 1 ? "" : "s"} (${r.scanned} scanned)`);
      setTimeout(() => setNotice(null), 6000);
      await load();
    }
  }
  async function importFromFolder() {
    const dir = await open({ directory: true, title: "Pick a skills folder (containing SKILL.md files)" }).catch(() => null);
    if (typeof dir === "string") await importSkills(dir);
  }

  const q = search.trim().toLowerCase();
  const filtered = q ? skills.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)) : skills;
  const cats = [...new Set(filtered.map(s => s.category))];
  const enabledCount = skills.filter(s => s.enabled).length;

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-gold-foil">Skills</h1>
            <p className="mt-1 text-xs text-nexus-muted">
              Procedures the agent auto-applies when your message matches one. {enabledCount}/{skills.length} enabled across {new Set(skills.map(s => s.category)).size} categories.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center justify-end gap-2">
              <span className="text-xs text-nexus-fg">Auto-apply skills</span>
              <Toggle on={autoApply} onClick={() => { const v = !autoApply; setAutoApply(v); setMaster("skills.enabled", v); }} />
            </label>
            <label className="flex cursor-pointer items-center justify-end gap-2" title="After substantial tasks, the agent distills a reusable skill (one extra model call per task).">
              <span className="text-xs text-nexus-fg">Let the agent learn new skills</span>
              <Toggle on={autoCreate} onClick={() => { const v = !autoCreate; setAutoCreate(v); setMaster("skills.autoCreate", v); }} />
            </label>
            <label className="flex cursor-pointer items-center justify-end gap-2" title="Also match skills by meaning (embeddings), not just keywords. Uses your provider's embeddings endpoint.">
              <span className="text-xs text-nexus-fg">Smarter (semantic) matching</span>
              <Toggle on={semantic} onClick={() => { const v = !semantic; setSemantic(v); setMaster("skills.semantic", v); }} />
            </label>
          </div>
        </div>

        {/* Search + new */}
        <div className="mb-4 flex gap-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search skills…"
            className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
          <button onClick={() => importSkills()} title="Scan the local Hermes skills folder for SKILL.md files"
            className="rounded-lg border border-gold-faint px-3 py-2 text-sm text-nexus-gold hover:bg-nexus-surface">Import Hermes</button>
          <button onClick={importFromFolder} title="Pick a folder of SKILL.md files"
            className="rounded-lg border border-nexus-border px-3 py-2 text-sm text-nexus-fg hover:bg-nexus-surface">Folder…</button>
          <button onClick={() => setShowForm(v => !v)}
            className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-surface">{showForm ? "Cancel" : "+ New skill"}</button>
        </div>
        {notice && <p className="-mt-2 mb-2 text-xs text-nexus-gold">{notice}</p>}

        {/* Create form */}
        {showForm && (
          <div className="mb-5 flex flex-col gap-2 rounded-lg border border-gold-faint bg-nexus-surface/40 p-4">
            <input value={nName} onChange={e => setNName(e.target.value)} placeholder="Skill name"
              className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <input value={nDesc} onChange={e => setNDesc(e.target.value)} placeholder="One-line description"
              className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <input value={nTriggers} onChange={e => setNTriggers(e.target.value)} placeholder="Triggers (comma-separated keywords)"
              className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <textarea value={nInstr} onChange={e => setNInstr(e.target.value)} rows={3} placeholder="Instructions — the procedure to follow…"
              className="resize-none rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <button onClick={createSkill} disabled={!nName.trim() || !nInstr.trim()}
              className="self-start rounded-lg bg-nexus-accent px-5 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Create skill</button>
          </div>
        )}

        {/* Skill cards by category */}
        {filtered.length === 0 ? (
          <p className="text-xs text-nexus-muted">No skills match “{search}”.</p>
        ) : cats.map(cat => (
          <div key={cat} className="mb-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-nexus-muted">{cat}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.filter(s => s.category === cat).map(s => (
                <div key={s.id} title={`Triggers: ${s.triggers.join(", ")}`}
                  className={`flex items-start justify-between gap-3 rounded-lg border bg-nexus-surface px-3 py-2.5 transition ${s.enabled ? "border-nexus-border" : "border-nexus-border/40 opacity-60"}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-nexus-fg">{s.name}</p>
                      {s.auto && <span className="rounded-full border border-gold-faint px-1.5 py-px text-[8px] uppercase tracking-wide text-nexus-gold/90">learned</span>}
                      {s.source === "custom" && !s.auto && <span className="rounded-full border border-nexus-border px-1.5 py-px text-[8px] uppercase tracking-wide text-nexus-muted">custom</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-nexus-muted">{s.description}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Toggle on={s.enabled} onClick={() => toggleSkill(s.id, !s.enabled)} />
                    {s.source === "custom" && (
                      <button onClick={() => deleteSkill(s.id)} title="Delete skill" className="text-nexus-muted/50 hover:text-red-400">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
