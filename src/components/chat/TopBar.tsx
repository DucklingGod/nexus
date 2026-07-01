import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconTerminal, IconGlobe, IconSettings } from "../icons";

const ICON_MAP: Record<string, React.FC<{ size?: number }>> = {
  terminal: IconTerminal,
  globe: IconGlobe,
};

function WorkspaceIcon({ name }: { name: string }) {
  const Comp = ICON_MAP[name];
  return Comp ? <Comp size={11} /> : null;
}

interface Props {
  taskTitle?: string | null;
  onOpenSettings?: () => void;
  onPickHost?: (name: string) => void;
}

interface SshHost { id: string; name: string; host: string; user: string; port: number }

export function TopBar({ taskTitle, onOpenSettings, onPickHost }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [workspace, setWorkspace] = useState("local");
  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);

  // Load configured SSH hosts so the "Remote" entry reflects reality.
  useEffect(() => {
    invoke<{ hosts: SshHost[] }>("engine_rpc", { method: "ssh.list", params: {} })
      .then(r => setSshHosts(r.hosts ?? []))
      .catch(() => setSshHosts([]));
  }, [showWsDropdown]);

  async function handleMaximize() {
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setIsMaximized(await win.isMaximized());
  }

  const ws = { id: workspace, label: workspace === "local" ? "Local" : "Remote", icon: workspace === "local" ? "terminal" : "globe" };

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 items-center gap-2 border-b border-nexus-border/40 px-3"
    >
      {/* Left: task title + workspace dropdown */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-nexus-fg">
          {taskTitle || "New task"}
        </span>

        {/* Workspace dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowWsDropdown(!showWsDropdown)}
            className="flex items-center gap-1.5 rounded-full border border-nexus-border bg-nexus-surface px-2.5 py-0.5 text-[11px] text-nexus-muted transition hover:border-gold-faint hover:text-nexus-fg"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h5l2 2h5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {ws.label}
            <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {showWsDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowWsDropdown(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 w-52 origin-top animate-dropdown rounded-lg border border-nexus-border bg-nexus-elevated py-1 shadow-xl">
                <p className="px-3 py-1 text-[9px] font-medium uppercase tracking-wider text-nexus-muted/50">This machine</p>
                <button
                  onClick={() => { setWorkspace("local"); setShowWsDropdown(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition hover:bg-nexus-surface ${workspace === "local" ? "text-nexus-accent" : "text-nexus-fg"}`}
                >
                  <WorkspaceIcon name="terminal" />
                  Local (this Mac)
                  {workspace === "local" && <span className="ml-auto text-[9px]">✓</span>}
                </button>
                <div className="mx-2 my-1 border-t border-nexus-border/30" />
                <p className="px-3 py-1 text-[9px] font-medium uppercase tracking-wider text-nexus-muted/50">Remote (SSH)</p>
                {sshHosts.length === 0 ? (
                  <p className="px-3 py-1.5 text-[10px] leading-relaxed text-nexus-muted/50">No hosts yet. Add one in Settings → SSH Hosts to control another machine.</p>
                ) : (
                  sshHosts.map(h => (
                    <button
                      key={h.id}
                      onClick={() => { setWorkspace(h.id); setShowWsDropdown(false); onPickHost?.(h.name); }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] transition hover:bg-nexus-surface ${workspace === h.id ? "text-nexus-accent" : "text-nexus-fg"}`}
                    >
                      <WorkspaceIcon name="globe" />
                      <span className="truncate">{h.name}</span>
                      <span className="ml-auto truncate text-[9px] text-nexus-muted/50">{h.user}@{h.host}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1" data-tauri-drag-region />

      {/* Right: settings + window controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="flex h-7 w-7 items-center justify-center rounded text-nexus-muted/60 transition hover:bg-nexus-surface hover:text-nexus-gold"
        >
          <IconSettings size={15} />
        </button>
        <div className="mx-1 h-4 w-px bg-nexus-border/50" />
        <button
          onClick={() => getCurrentWindow().minimize()}
          className="flex h-6 w-6 items-center justify-center rounded text-nexus-muted/50 transition hover:bg-nexus-surface hover:text-nexus-muted"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-6 w-6 items-center justify-center rounded text-nexus-muted/50 transition hover:bg-nexus-surface hover:text-nexus-muted"
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
          onClick={() => getCurrentWindow().close()}
          className="flex h-6 w-6 items-center justify-center rounded text-nexus-muted/50 transition hover:bg-red-600/80 hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}