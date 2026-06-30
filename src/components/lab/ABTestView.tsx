import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Result { content: string; ms: number }

export function ABTestView() {
  const [prompt, setPrompt] = useState("");
  const [system, setSystem] = useState("");
  const [prov, setProv] = useState<{ provider: string; model: string; baseUrl: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelA, setModelA] = useState("");
  const [modelB, setModelB] = useState("");
  const [running, setRunning] = useState(false);
  const [a, setA] = useState<Result | null>(null);
  const [b, setB] = useState<Result | null>(null);
  const [winner, setWinner] = useState<"a" | "b" | null>(null);

  useEffect(() => {
    invoke<{ provider: string; model: string; baseUrl: string } | null>("provider_get").then((c) => {
      if (c) { setProv(c); setModelA(c.model); setModelB(c.model); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!prov) return;
    invoke<{ models: { id: string }[] }>("provider_list_models", { provider: prov.provider, baseUrl: prov.baseUrl })
      .then((r) => setModels((r.models ?? []).map((m) => m.id))).catch(() => {});
  }, [prov]);

  const options = [...new Set([prov?.model, ...models].filter(Boolean) as string[])];

  async function runVariant(model: string): Promise<Result> {
    const t0 = Date.now();
    const r = await invoke<{ content: string }>("complete_once", { text: prompt, system: system.trim() || undefined, provider: prov!.provider, model, baseUrl: prov!.baseUrl });
    return { content: r.content || "(no output)", ms: Date.now() - t0 };
  }

  async function run() {
    if (!prov || !prompt.trim() || running) return;
    setRunning(true); setA(null); setB(null); setWinner(null);
    try {
      const [ra, rb] = await Promise.all([
        runVariant(modelA).catch((e) => ({ content: `Error: ${e}`, ms: 0 })),
        runVariant(modelB).catch((e) => ({ content: `Error: ${e}`, ms: 0 })),
      ]);
      setA(ra); setB(rb);
    } finally { setRunning(false); }
  }

  const sel = "w-full rounded-md border border-nexus-border bg-nexus-surface px-2 py-1.5 text-xs text-nexus-fg outline-none focus:border-nexus-accent";

  const column = (label: string, model: string, setModel: (m: string) => void, res: Result | null, key: "a" | "b") => (
    <div className={`flex min-w-0 flex-1 flex-col rounded-lg border-2 bg-nexus-surface/30 p-3 transition ${winner === key ? "border-nexus-accent" : "border-nexus-border/50"}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-nexus-muted">{label}</span>
        <select value={model} onChange={(e) => setModel(e.target.value)} className={sel}>
          {options.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="min-h-[120px] flex-1 overflow-y-auto whitespace-pre-wrap rounded bg-nexus-bg/40 p-2 text-[12px] text-nexus-fg/90">
        {res ? res.content : <span className="text-nexus-muted/40">—</span>}
      </div>
      {res && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-nexus-muted/60">{res.ms} ms</span>
          <button onClick={() => setWinner(key)} className={`rounded px-2 py-0.5 text-[10px] ${winner === key ? "bg-nexus-accent text-black" : "border border-nexus-border text-nexus-fg hover:bg-nexus-surface"}`}>
            {winner === key ? "✓ Winner" : "Pick winner"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-2xl font-semibold text-gold-foil">A/B Test</h1>
        <p className="mt-1 mb-4 text-xs text-nexus-muted">Run one prompt through two models and compare side by side. Uses your current provider; pick a winner.</p>

        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="The prompt to test…"
          className="mb-2 w-full resize-none rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={2} placeholder="Optional system prompt (applied to both)…"
          className="mb-3 w-full resize-none rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-xs text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />

        <button onClick={run} disabled={running || !prompt.trim() || !prov}
          className="mb-4 rounded-lg bg-nexus-accent px-5 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">{running ? "Running both…" : "▶ Run A/B"}</button>

        <div className="flex gap-3">
          {column("Variant A", modelA, setModelA, a, "a")}
          {column("Variant B", modelB, setModelB, b, "b")}
        </div>
      </div>
    </div>
  );
}
