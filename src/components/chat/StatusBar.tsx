import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  onOpenSettings: () => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
}

export function StatusBar({ onOpenSettings, onNewChat, onToggleSidebar }: Props) {
  const [provider, setProvider] = useState<{ provider: string; model: string } | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    invoke<{ provider: string; model: string } | null>("provider_get")
      .then(setProvider)
      .catch(() => {});
  }, []);

  const win = getCurrentWindow();

  async function handleMaximize() {
    await win.toggleMaximize();
    setIsMaximized(await win.isMaximized());
  }

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between border-b border-nexus-border/80 px-5 py-3"
    >
      {/* Left: Logo + provider badge */}
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <h1 className="font-display text-lg font-semibold tracking-tight text-gold-foil" data-tauri-drag-region>
          Nexus
        </h1>
        {provider && (
          <span className="rounded-full border border-gold-faint bg-nexus-surface px-2.5 py-0.5 text-[11px] tracking-wide text-nexus-muted">
            {provider.provider} · {provider.model}
          </span>
        )}
      </div>

      {/* Center: drag region spacer */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Right: Actions + window controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className="rounded-md px-2 py-1.5 text-nexus-muted transition hover:bg-nexus-surface hover:text-nexus-fg"
          title="Conversations"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5 2v12" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          onClick={onNewChat}
          className="rounded-md px-3 py-1.5 text-xs text-nexus-muted transition hover:bg-nexus-surface hover:text-nexus-fg"
        >
          New Chat
        </button>
        <button
          onClick={onOpenSettings}
          className="rounded-md px-3 py-1.5 text-xs text-nexus-muted transition hover:bg-nexus-surface hover:text-nexus-gold"
        >
          Settings
        </button>

        {/* Divider */}
        <div className="mx-1.5 h-4 w-px bg-nexus-border/50" />

        {/* Window controls */}
        <button
          onClick={() => win.minimize()}
          className="flex h-8 w-8 items-center justify-center rounded text-nexus-muted transition hover:bg-nexus-surface hover:text-nexus-fg"
          title="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-8 w-8 items-center justify-center rounded text-nexus-muted transition hover:bg-nexus-surface hover:text-nexus-fg"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2" y="0" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" />
              <rect x="0" y="2" width="8" height="8" rx="1" fill="var(--color-nexus-bg, #0a0a0a)" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          onClick={() => win.close()}
          className="flex h-8 w-8 items-center justify-center rounded text-nexus-muted transition hover:bg-red-600/80 hover:text-white"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
