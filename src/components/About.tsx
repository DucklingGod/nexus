import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function About() {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleReset() {
    setResetting(true);
    setResetError(null);
    try {
      await invoke("engine_rpc", { method: "system.reset", params: {} });
      // The reset cleared the `onboarded` flag. Reload the app window so the
      // gate re-evaluates and shows the welcome/onboarding screen again.
      setTimeout(() => { try { getCurrentWindow().emit("nexus-reset-done"); } catch { /* ignore */ } location.reload(); }, 400);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : String(e));
      setResetting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Logo + Name */}
      <div className="flex flex-col items-center gap-4 pt-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-nexus-surface border border-nexus-border shadow-lg">
          <span className="text-gold-foil font-display text-5xl font-bold leading-none select-none">
            N
          </span>
        </div>
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold text-nexus-fg">Nexus</h1>
          <p className="mt-1 text-sm text-nexus-muted">Version 0.5.0</p>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-lg border border-nexus-border bg-nexus-surface p-5">
        <p className="text-sm text-nexus-fg/80 leading-relaxed">
          Nexus is a premium desktop AI agent that runs locally on your machine.
          It connects to your preferred LLM provider, executes tools, and helps you
          get things done — all with full control over your data.
        </p>
        <p className="mt-3 text-xs text-nexus-muted">
          Built with Tauri 2.x + React + TypeScript
        </p>
      </div>

      {/* Links */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-nexus-muted/60 mb-1">Links</h3>
        <a
          href="https://github.com/nexus-ai/nexus"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-nexus-fg hover:border-nexus-accent hover:text-nexus-accent transition"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub Repository
        </a>
        <a
          href="https://nexus-ai.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-nexus-fg hover:border-nexus-accent hover:text-nexus-accent transition"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6M8 2c-2 2-3 4-3 6s1 4 3 6" />
          </svg>
          Landing Page
        </a>
        <a
          href="https://nexus-ai.dev/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-nexus-fg hover:border-nexus-accent hover:text-nexus-accent transition"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.5v13M2.5 1.5h3A2.5 2.5 0 018 4v10.5A2.5 2.5 0 005.5 12h-3V1.5zM13.5 1.5h-3A2.5 2.5 0 008 4v10.5a2.5 2.5 0 012.5-2.5h3V1.5z" />
          </svg>
          Documentation
        </a>
      </div>

      {/* License */}
      <div className="rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-center">
        <p className="text-xs text-nexus-muted">
          Licensed under the{' '}
          <span className="text-nexus-fg/80 font-medium">MIT License</span>
        </p>
        <p className="mt-1 text-[10px] text-nexus-muted/50">
          © 2024–2026 Nexus Contributors
        </p>
      </div>

      {/* Danger Zone — Factory Reset */}
      <div className="rounded-lg border border-red-900/40 bg-red-950/10 p-5">
        <h3 className="text-sm font-medium text-red-300/90">Danger Zone</h3>
        <p className="mt-1 text-xs text-nexus-muted">
          Reset Nexus to a fresh state. This <span className="text-red-300/80">erases all conversations, knowledge, skills, memory, corrections, kanban, workflows, and agent settings</span> —
          but <span className="text-nexus-fg/80">keeps your saved API keys and your current provider choice</span>. The app will restart to onboarding.
        </p>
        {resetError && <p className="mt-2 text-xs text-red-400">Reset failed: {resetError}</p>}
        {!confirming ? (
          <button onClick={() => setConfirming(true)} disabled={resetting}
            className="mt-3 rounded-lg border border-red-900/50 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-950/40 disabled:opacity-50">
            Reset Nexus to fresh…
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-red-300/80">Are you sure? This cannot be undone.</span>
            <button onClick={() => setConfirming(false)} disabled={resetting}
              className="rounded-lg border border-nexus-border px-3 py-1.5 text-xs text-nexus-muted hover:bg-nexus-surface disabled:opacity-50">Cancel</button>
            <button onClick={handleReset} disabled={resetting}
              className="rounded-lg bg-red-600/90 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50">
              {resetting ? "Resetting…" : "Yes, reset everything"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
