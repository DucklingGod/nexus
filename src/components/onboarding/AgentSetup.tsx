import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

const TONES = ["professional", "friendly", "casual", "concise"];
const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "th", label: "Thai" },
  { id: "zh", label: "Chinese" },
  { id: "ja", label: "Japanese" },
];

export function AgentSetup({ onComplete, onBack }: Props) {
  const [name, setName] = useState("Nexus Agent");
  const [tone, setTone] = useState("professional");
  const [language, setLanguage] = useState("en");
  const [saving, setSaving] = useState(false);

  async function handleComplete() {
    setSaving(true);
    try {
      const result = await invoke("agent_personality_set", { name, tone, language });
      console.log("[AgentSetup] personality saved:", result);
      onComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[AgentSetup] Failed to save personality:", msg);
      alert("Failed to save: " + msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-2 block text-sm text-neutral-400">Agent Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-nexus-accent"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm text-neutral-400">Tone</label>
        <div className="flex gap-2">
          {TONES.map(t => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize transition-all ${
                tone === t
                  ? "border-nexus-accent bg-nexus-surface text-nexus-accent"
                  : "border-nexus-border text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm text-neutral-400">Language</label>
        <div className="flex gap-2">
          {LANGUAGES.map(l => (
            <button
              key={l.id}
              onClick={() => setLanguage(l.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                language === l.id
                  ? "border-nexus-accent bg-nexus-surface text-nexus-accent"
                  : "border-nexus-border text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-neutral-400 hover:bg-nexus-surface">
          Back
        </button>
        <button
          onClick={handleComplete}
          disabled={saving || !name.trim()}
          className="rounded-lg bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Start Using Nexus"}
        </button>
      </div>
    </div>
  );
}
