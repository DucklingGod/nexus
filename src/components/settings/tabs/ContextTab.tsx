import { useSettings } from "../SettingsContext";
import { invoke } from "@tauri-apps/api/core";

export default function ContextTab() {
  const { contextFiles, setContextFiles, autoExtract, setAutoExtract, saving, saveContext } = useSettings();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-nexus-muted">Editable .md files injected into every chat (priority: Rules → Soul → About you → Memory → Context) — a transparent layer over the agent's memory.</p>
      <div className="flex items-center justify-between rounded-xl border border-nexus-border bg-nexus-surface p-3">
        <div>
          <p className="text-sm text-nexus-fg">Auto-extract memory</p>
          <p className="text-xs text-nexus-muted">After each chat, a background LLM call distills durable facts into these files automatically.</p>
        </div>
        <button onClick={async () => { const v = !autoExtract; setAutoExtract(v); await invoke("engine_rpc", { method: "settings.set", params: { key: "memory.autoExtract", value: v ? "true" : "false" } }).catch(() => {}); }}
          className={`relative h-6 w-11 rounded-full transition-colors ${autoExtract ? "bg-nexus-accent" : "bg-nexus-border"}`}>
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoExtract ? "translate-x-5" : ""}`} />
        </button>
      </div>
      {contextFiles.map((f, i) => (
        <div key={f.name}>
          <label className="mb-1 block text-sm text-nexus-fg">{f.title} <span className="text-xs text-nexus-muted">({f.name}.md)</span></label>
          <textarea value={f.content} onChange={e => setContextFiles(prev => prev.map((x, j) => j === i ? { ...x, content: e.target.value } : x))} rows={4}
            className="w-full resize-y rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        </div>
      ))}
      <button onClick={saveContext} disabled={saving} className="self-start rounded-xl bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save context"}</button>
    </div>
  );
}
