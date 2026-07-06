import { useSettings } from "../SettingsContext";
import { invoke } from "@tauri-apps/api/core";
import type { Correction } from "./types";

export default function LearningTab() {
  const {
    expEnabled, setExpEnabled, correctionEnabled, setCorrectionEnabled,
    evalEnabled, setEvalEnabled, experiences,
    corrections, setCorrections, lastEval,
    corrForm, setCorrForm, promptVersions,
    optimizing, optimizeSkipReason, config, showMsg,
    runOptimize, acceptProposal, rejectProposal,
  } = useSettings();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-nexus-muted">The agent learns from experience: it logs every task, learns correction rules from your thumbs-down feedback, and (optionally) scores itself after each turn.</p>

      {/* Toggles */}
      <div className="flex flex-col gap-2">
        {([
          { key: "experience", label: "Experience logging", desc: "Record every task (input, steps, output) so patterns can be detected and the agent improves over time.", val: expEnabled, set: setExpEnabled },
          { key: "correction", label: "Correction memory", desc: "Learn rules from your 👎 feedback and apply them in similar future situations.", val: correctionEnabled, set: setCorrectionEnabled },
          { key: "evaluation", label: "Self-evaluation", desc: "After each turn, a background call scores completion / satisfaction / efficiency.", val: evalEnabled, set: setEvalEnabled },
        ] as const).map(t => (
          <div key={t.key} className="flex items-center justify-between rounded-xl border border-nexus-border bg-nexus-surface p-3">
            <div>
              <p className="text-sm text-nexus-fg">{t.label}</p>
              <p className="text-xs text-nexus-muted">{t.desc}</p>
            </div>
            <button onClick={async () => { const v = !t.val; t.set(v); await invoke("engine_rpc", { method: "settings.set", params: { key: `${t.key}.enabled`, value: v ? "true" : "false" } }).catch(() => {}); }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${t.val ? "bg-nexus-accent" : "bg-nexus-border"}`}>
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${t.val ? "translate-x-5" : ""}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Last self-evaluation */}
      {lastEval && (
        <div className="rounded-xl border border-nexus-border bg-nexus-surface/40 p-3">
          <p className="mb-2 text-sm font-medium text-nexus-fg">Last self-evaluation</p>
          <div className="flex gap-4 text-xs">
            {(["completion", "satisfaction", "efficiency"] as const).map(k => (
              <div key={k} className="flex flex-col items-center gap-1">
                <span className="text-lg font-semibold text-nexus-gold">{lastEval[k]}</span>
                <span className="capitalize text-nexus-muted">{k}</span>
              </div>
            ))}
          </div>
          {lastEval.note && <p className="mt-2 text-[11px] italic text-nexus-muted/70">"{lastEval.note}"</p>}
        </div>
      )}

      {/* Correction rules */}
      <div>
        <p className="mb-2 text-sm font-medium text-nexus-fg">Correction rules ({corrections.length})</p>
        <div className="mb-2 rounded-xl border border-nexus-border bg-nexus-surface/40 p-3">
          <p className="mb-2 text-[11px] text-nexus-muted">Add a rule — the agent injects matching rules into future replies so it doesn't repeat a mistake.</p>
          <div className="flex flex-col gap-2">
            <input value={corrForm.trigger_context} onChange={e => setCorrForm({ ...corrForm, trigger_context: e.target.value })} placeholder="When… (the situation, e.g. 'writing git commits')"
              className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <input value={corrForm.rule} onChange={e => setCorrForm({ ...corrForm, rule: e.target.value })} placeholder="Do this instead… (e.g. 'use conventional commit format')"
              className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <button onClick={async () => {
              if (!corrForm.trigger_context.trim() || !corrForm.rule.trim()) { showMsg("Both fields are required"); return; }
              await invoke("engine_rpc", { method: "correction.add", params: { ...corrForm } });
              const c = await invoke<{ corrections: Correction[] }>("engine_rpc", { method: "correction.list", params: {} });
              setCorrections(c.corrections ?? []);
              setCorrForm({ trigger_context: "", rule: "" });
              showMsg("Correction rule added");
            }} className="self-start rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90">Add rule</button>
          </div>
        </div>
        {corrections.length === 0 ? (
          <p className="text-xs text-nexus-muted/60">No rules yet — add one above.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {corrections.map(c => (
              <div key={c.id} className="rounded-xl border border-nexus-border bg-nexus-surface/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-nexus-muted">When {c.trigger_context}</p>
                    <p className="text-sm text-nexus-fg">{c.rule}</p>
                  </div>
                  <button onClick={() => { invoke("engine_rpc", { method: "correction.delete", params: { id: c.id } }).then(() => setCorrections(prev => prev.filter(x => x.id !== c.id))); }}
                    className="shrink-0 rounded-md px-2 py-0.5 text-[11px] text-red-400/70 hover:bg-nexus-surface hover:text-red-400">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prompt optimizer */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-nexus-fg">Prompt optimizer</p>
          <button onClick={runOptimize} disabled={optimizing || !config}
            className="rounded-xl bg-nexus-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50">
            {optimizing ? "Analyzing…" : "✨ Optimize instructions"}
          </button>
        </div>
        <p className="mb-2 text-[11px] text-nexus-muted">
          Reflects on recent 👎 feedback and failed tasks, proposes an improved version of your Custom Instructions, and judges it against the current one — never applied automatically.
        </p>
        {optimizeSkipReason && (
          <p className="mb-2 rounded-xl border border-nexus-border/60 bg-nexus-surface/30 p-3 text-[11px] text-nexus-muted">{optimizeSkipReason}</p>
        )}
        {promptVersions.filter(v => !v.applied).length === 0 ? (
          <p className="text-xs text-nexus-muted/60">No pending proposals.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {promptVersions.filter(v => !v.applied).map(v => (
              <div key={v.id} className="rounded-xl border border-nexus-accent/40 bg-nexus-surface/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-[11px] text-nexus-muted">
                  <span>Score: <span className="text-nexus-gold">{v.score}</span> vs current <span className="text-nexus-muted">{v.baseline_score}</span></span>
                  {v.reason && <span className="italic">— {v.reason}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-nexus-muted/60">Current</p>
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-nexus-bg/40 p-2 text-[11px] text-nexus-fg/70">{v.previous_text || "(none set)"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-nexus-accent/80">Proposed</p>
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-nexus-bg/40 p-2 text-[11px] text-nexus-fg">{v.new_text}</p>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => acceptProposal(v.id)} className="rounded-xl bg-nexus-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90">Accept</button>
                  <button onClick={() => rejectProposal(v.id)} className="rounded-xl border border-nexus-border px-3 py-1.5 text-xs text-nexus-muted hover:bg-nexus-surface">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent experiences */}
      <div>
        <p className="mb-2 text-sm font-medium text-nexus-fg">Recent experiences ({experiences.length})</p>
        {experiences.length === 0 ? (
          <p className="text-xs text-nexus-muted/60">Enable experience logging above and chat with the agent — tasks will appear here.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {experiences.slice(0, 15).map(x => (
              <div key={x.id} className="flex items-center gap-2 rounded-md border border-nexus-border/50 bg-nexus-surface/30 px-3 py-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.success ? "bg-green-400" : "bg-red-400"}`} title={x.success ? "succeeded" : "had a failed step"} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-nexus-fg/70">{x.input}</span>
                {x.tool_steps.length > 0 && <span className="shrink-0 text-[10px] text-nexus-muted/50">{x.tool_steps.length} tools</span>}
                {x.feedback && <span className={`shrink-0 text-[10px] ${x.feedback === "up" ? "text-green-400" : "text-red-400"}`}>{x.feedback === "up" ? "👍" : "👎"}</span>}
                <span className="shrink-0 text-[10px] text-nexus-muted/40">{new Date(x.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
