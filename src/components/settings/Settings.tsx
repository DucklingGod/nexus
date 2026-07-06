import { useState, lazy, Suspense } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SettingsProvider, useSettings } from "./SettingsContext";
import { IconKey, IconBot, IconZap, IconGear, IconBook, IconChart, IconGlobe, IconTerminal, IconClipboard, IconBrain, IconStar, IconPalette, IconShield, IconWifi, IconArrowLeft } from "../icons";

// Lazy-load heavy tabs
const ProviderTab = lazy(() => import("./tabs/ProviderTab"));
const GeneralTab = lazy(() => import("./tabs/GeneralTab"));
const CapabilitiesTab = lazy(() => import("./tabs/CapabilitiesTab"));
const AdvancedTab = lazy(() => import("./tabs/AdvancedTab"));
const KnowledgeTab = lazy(() => import("./tabs/KnowledgeTab"));
const ConnectorsTab = lazy(() => import("./tabs/ConnectorsTab"));
const SshTab = lazy(() => import("./tabs/SshTab"));
const LearningTab = lazy(() => import("./tabs/LearningTab"));
const ContextTab = lazy(() => import("./tabs/ContextTab"));
const LogsTab = lazy(() => import("./tabs/LogsTab"));

// Already-lazy (separate components, lightweight wrappers)
const ThemeSettings = lazy(() => import("./ThemeSettings").then(m => ({ default: m.ThemeSettings })));
const TokenDashboard = lazy(() => import("./TokenDashboard").then(m => ({ default: m.TokenDashboard })));
const AuditLog = lazy(() => import("./AuditLog").then(m => ({ default: m.AuditLog })));
const About = lazy(() => import("../About").then(m => ({ default: m.About })));

type TabId = "provider" | "agent" | "capabilities" | "advanced" | "knowledge" | "connectors" | "ssh" | "learning" | "context" | "theme" | "logs" | "usage" | "audit" | "about";

const TABS: { id: TabId; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "provider", label: "Provider", icon: IconKey },
  { id: "agent", label: "Agent", icon: IconBot },
  { id: "capabilities", label: "Capabilities", icon: IconZap },
  { id: "advanced", label: "Advanced", icon: IconGear },
  { id: "knowledge", label: "Knowledge", icon: IconBook },
  { id: "connectors", label: "Connectors", icon: IconGlobe },
  { id: "ssh", label: "SSH Hosts", icon: IconWifi },
  { id: "learning", label: "Learning", icon: IconBrain },
  { id: "context", label: "Context", icon: IconClipboard },
  { id: "theme", label: "Theme", icon: IconPalette },
  { id: "usage", label: "Usage", icon: IconChart },
  { id: "audit", label: "Audit", icon: IconShield },
  { id: "logs", label: "Logs", icon: IconTerminal },
  { id: "about", label: "About", icon: IconStar },
];

interface Props {
  onClose: () => void;
}

export function Settings({ onClose }: Props) {
  return (
    <SettingsProvider>
      <SettingsInner onClose={onClose} />
    </SettingsProvider>
  );
}

function SettingsInner({ onClose }: Props) {
  const [tab, setTab] = useState<TabId>("provider");
  const [isMaximized, setIsMaximized] = useState(false);

  const { changingProvider, selectedProvider, changingModel } = useSettings();

  async function handleMaximize() {
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setIsMaximized(await win.isMaximized());
  }

  // Determine the title bar based on change-provider flow state
  let title = "Settings";
  if (changingModel && selectedProvider) title = `Select Model — ${selectedProvider.name}`;
  else if (changingProvider && selectedProvider) title = `API Key — ${selectedProvider.name}`;
  else if (changingProvider && !selectedProvider) title = "Change Provider";

  const showNav = !changingProvider && !changingModel;

  return (
    <div className="flex h-screen flex-col bg-nexus-bg">
      <SettingsTopBar title={title} onClose={showNav ? onClose : undefined} onBack={!showNav ? () => {} : undefined} isMaximized={isMaximized} onMaximize={handleMaximize} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav panel — hidden during change-provider flow */}
        {showNav && (
          <div className="w-52 flex-shrink-0 border-r border-nexus-border/40 bg-nexus-surface/20 py-2">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition ${
                  tab === t.id
                    ? "bg-nexus-surface text-nexus-accent"
                    : "text-nexus-muted hover:bg-nexus-surface/50 hover:text-nexus-fg"
                }`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Right content panel */}
        <div className="flex-1 overflow-y-auto p-6 transition-smooth">
          <Suspense fallback={
            <div className="flex items-center gap-2 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
              <span className="text-sm text-nexus-muted">Loading…</span>
            </div>
          }>
            {/* Provider (includes change-provider flow overlays) */}
            {tab === "provider" && <ProviderTab />}

            {/* Agent */}
            {tab === "agent" && <GeneralTab />}

            {/* Capabilities */}
            {tab === "capabilities" && <CapabilitiesTab />}

            {/* Advanced */}
            {tab === "advanced" && <AdvancedTab />}

            {/* Knowledge */}
            {tab === "knowledge" && <KnowledgeTab />}

            {/* Connectors */}
            {tab === "connectors" && <ConnectorsTab />}

            {/* SSH */}
            {tab === "ssh" && <SshTab />}

            {/* Learning */}
            {tab === "learning" && <LearningTab />}

            {/* Context */}
            {tab === "context" && <ContextTab />}

            {/* Theme */}
            {tab === "theme" && <ThemeSettings />}

            {/* Usage */}
            {tab === "usage" && <TokenDashboard />}

            {/* Audit */}
            {tab === "audit" && <AuditLog />}

            {/* Logs */}
            {tab === "logs" && <LogsTab />}

            {/* About */}
            {tab === "about" && <About />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/** Shared title bar matching TopBar style */
function SettingsTopBar({ title, onClose, onBack, isMaximized, onMaximize }: {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
  isMaximized: boolean;
  onMaximize: () => void;
}) {
  return (
    <div data-tauri-drag-region className="flex h-10 items-center gap-2 border-b border-nexus-border/40 px-3">
      <div className="flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="rounded p-1 text-nexus-muted/60 transition hover:bg-nexus-surface hover:text-nexus-fg">
            <IconArrowLeft size={14} />
          </button>
        )}
        {!onBack && onClose && (
          <button onClick={onClose} className="rounded p-1 text-nexus-muted/60 transition hover:bg-nexus-surface hover:text-nexus-fg">
            <IconArrowLeft size={14} />
          </button>
        )}
        <span className="text-[13px] font-medium text-nexus-fg" data-tauri-drag-region>{title}</span>
      </div>
      <div className="flex-1" data-tauri-drag-region />
      <div className="flex items-center gap-1">
        <div className="mx-1 h-4 w-px bg-nexus-border/50" />
        <button
          onClick={() => getCurrentWindow().minimize()}
          className="flex h-6 w-6 items-center justify-center rounded text-nexus-muted/50 transition hover:bg-nexus-surface hover:text-nexus-muted"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          onClick={onMaximize}
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
