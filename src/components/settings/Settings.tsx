import { useState, lazy, Suspense } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SettingsProvider, useSettings } from "./SettingsContext";
import { IconKey, IconBot, IconGear, IconGlobe, IconPalette, IconStar, IconArrowLeft } from "../icons";

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

// Phase 2: 14 flat tabs → 6 grouped categories with plain-language labels
type TabId = "provider" | "agent" | "capabilities" | "advanced" | "knowledge" | "connectors" | "ssh" | "learning" | "context" | "theme" | "logs" | "usage" | "audit" | "about";

interface GroupItem {
  id: TabId;
  label: string;
  desc: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

interface SettingsGroup {
  id: string;
  label: string;
  icon: React.FC<{ size?: number }>;
  items: GroupItem[];
}

const GROUPS: SettingsGroup[] = [
  {
    id: "model",
    label: "AI Model",
    icon: IconKey,
    items: [
      { id: "provider", label: "Provider & model", desc: "Choose your AI provider and set up API keys", component: ProviderTab },
      { id: "usage", label: "Costs & usage", desc: "Track how much you've spent on AI", component: TokenDashboard },
    ],
  },
  {
    id: "agent",
    label: "My Agent",
    icon: IconBot,
    items: [
      { id: "agent", label: "Personality", desc: "Name, avatar, and behavior of your AI assistant", component: GeneralTab },
      { id: "learning", label: "Learning", desc: "Rules your agent picks up from your feedback", component: LearningTab },
      { id: "context", label: "Memory", desc: "What your agent remembers between conversations", component: ContextTab },
      { id: "knowledge", label: "Knowledge", desc: "Facts, documents, and notes your agent can search", component: KnowledgeTab },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    icon: IconGlobe,
    items: [
      { id: "connectors", label: "Apps & bots", desc: "Telegram, Discord, and other integrations", component: ConnectorsTab },
      { id: "ssh", label: "Remote devices", desc: "SSH connections to other computers", component: SshTab },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: IconPalette,
    items: [
      { id: "theme", label: "Theme", desc: "Colors, stars, and visual effects", component: ThemeSettings },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: IconGear,
    items: [
      { id: "capabilities", label: "Abilities", desc: "File editing, web browsing, and other powers", component: CapabilitiesTab },
      { id: "advanced", label: "Engine settings", desc: "Low-level configuration for the AI engine", component: AdvancedTab },
      { id: "logs", label: "Engine logs", desc: "Raw output from the AI engine (for debugging)", component: LogsTab },
      { id: "audit", label: "Action history", desc: "Everything your agent has done, in order", component: AuditLog },
    ],
  },
  {
    id: "about",
    label: "About",
    icon: IconStar,
    items: [
      { id: "about", label: "About", desc: "Version, credits, and links", component: About },
    ],
  },
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
  const [groupId, setGroupId] = useState("model");
  const [itemId, setItemId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const { changingProvider, selectedProvider, changingModel } = useSettings();

  async function handleMaximize() {
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setIsMaximized(await win.isMaximized());
  }

  const group = GROUPS.find(g => g.id === groupId) ?? GROUPS[0];
  const activeItemId = (itemId && group.items.find(i => i.id === itemId)) ? itemId : group.items[0].id;
  const activeItem = group.items.find(i => i.id === activeItemId) ?? group.items[0];

  // Determine the title bar based on change-provider flow state
  let title = "Settings";
  if (changingModel && selectedProvider) title = `Select Model — ${selectedProvider.name}`;
  else if (changingProvider && selectedProvider) title = `API Key — ${selectedProvider.name}`;
  else if (changingProvider && !selectedProvider) title = "Change Provider";

  const showNav = !changingProvider && !changingModel;

  return (
    <div className="flex h-screen w-full flex-col bg-nexus-bg">
      <SettingsTopBar title={title} onClose={showNav ? onClose : undefined} onBack={!showNav ? () => {} : undefined} isMaximized={isMaximized} onMaximize={handleMaximize} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav panel — hidden during change-provider flow */}
        {showNav && (
          <div className="w-52 flex-shrink-0 border-r border-nexus-border/40 bg-nexus-surface/20 py-2">
            {GROUPS.map(g => (
              <button
                key={g.id}
                onClick={() => { setGroupId(g.id); setItemId(null); }}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition ${
                  groupId === g.id
                    ? "bg-nexus-surface text-nexus-accent"
                    : "text-nexus-muted hover:bg-nexus-surface/50 hover:text-nexus-fg"
                }`}
              >
                <g.icon size={14} />
                {g.label}
              </button>
            ))}
          </div>
        )}

        {/* Right content panel */}
        <div className="flex-1 overflow-y-auto p-6 transition-smooth min-w-0">
          {/* Group header — plain-language context */}
          {showNav && (
            <div className="mb-4">
              <h2 className="font-display text-base font-semibold text-nexus-fg">{activeItem.label}</h2>
              <p className="mt-0.5 text-xs text-nexus-muted/60">{activeItem.desc}</p>
            </div>
          )}

          {/* Pill sub-nav when group has >1 item */}
          {showNav && group.items.length > 1 && (
            <div className="mb-4 flex gap-1">
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setItemId(item.id)}
                  className={`rounded-md px-3 py-1.5 text-xs transition ${
                    activeItemId === item.id
                      ? "bg-nexus-surface text-nexus-gold"
                      : "text-nexus-muted hover:bg-nexus-surface hover:text-nexus-fg"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <Suspense fallback={
            <div className="flex items-center gap-2 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
              <span className="text-sm text-nexus-muted">Loading…</span>
            </div>
          }>
            {/* During change-provider flow, always render ProviderTab regardless of active item */}
            {(changingProvider || changingModel) ? (
              <ProviderTab />
            ) : (
              <activeItem.component />
            )}
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
