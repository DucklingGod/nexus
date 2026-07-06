import { useSettings } from "../SettingsContext";

export default function GeneralTab() {
  const { personality, setPersonality, saving, handleSavePersonality } = useSettings();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Agent Name</label>
        <input type="text" value={personality.name} onChange={e => setPersonality(p => ({ ...p, name: e.target.value }))}
          className="w-full rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg outline-none focus:border-nexus-accent" />
      </div>
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Role</label>
        <input type="text" value={personality.role} onChange={e => setPersonality(p => ({ ...p, role: e.target.value }))}
          placeholder="e.g. customer support, coding assistant"
          className="w-full rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
      </div>
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Custom Instructions</label>
        <textarea value={personality.instructions} onChange={e => setPersonality(p => ({ ...p, instructions: e.target.value }))}
          rows={5} placeholder="Extra system instructions added to every conversation…"
          className="w-full resize-none rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
      </div>
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Tone</label>
        <div className="flex gap-2">
          {["professional", "friendly", "casual", "concise"].map(t => (
            <button key={t} onClick={() => setPersonality(p => ({ ...p, tone: t }))}
              className={`rounded-xl border px-3 py-1.5 text-xs capitalize ${personality.tone === t ? "border-nexus-accent bg-nexus-surface text-nexus-accent" : "border-nexus-border text-nexus-muted"}`}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Language</label>
        <div className="flex gap-2">
          {[{ id: "en", label: "English" }, { id: "th", label: "Thai" }, { id: "zh", label: "Chinese" }, { id: "ja", label: "Japanese" }].map(l => (
            <button key={l.id} onClick={() => setPersonality(p => ({ ...p, language: l.id }))}
              className={`rounded-xl border px-3 py-1.5 text-xs ${personality.language === l.id ? "border-nexus-accent bg-nexus-surface text-nexus-accent" : "border-nexus-border text-nexus-muted"}`}>{l.label}</button>
          ))}
        </div>
      </div>
      <button onClick={handleSavePersonality} disabled={saving}
        className="mt-2 self-start rounded-xl bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
        {saving ? "Saving..." : "Save Agent Settings"}
      </button>
    </div>
  );
}
