import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WelcomeScreen } from "./components/onboarding/WelcomeScreen";
import { ChatConsole } from "./components/chat/ChatConsole";
import { Settings } from "./components/settings/Settings";
import { LeftSidebar } from "./components/sidebar/LeftSidebar";
import { TopBar } from "./components/chat/TopBar";
import { SkillsView } from "./components/skills/SkillsView";
import { MarketplaceView } from "./components/mcp/MarketplaceView";
import { WorkflowsView } from "./components/workflow/WorkflowsView";
import { ABTestView } from "./components/lab/ABTestView";
import { KanbanView } from "./components/kanban/KanbanView";
import { LoadingScreen } from "./components/LoadingScreen";
import { SpaceCanvas } from "./components/SpaceCanvas";

// Phase 1: single union type replaces 5 mutually-exclusive booleans
export type MainView = "chat" | "skills" | "workflows" | "kanban" | "marketplace" | "ab";

const VIEW_TITLES: Record<MainView, string> = {
  chat: "", // falls back to taskTitle
  skills: "Skills",
  workflows: "Workflows",
  kanban: "Task board",
  marketplace: "Add-ons",
  ab: "Compare models",
};

function App() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState<MainView>("chat");
  const [learnedToast, setLearnedToast] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [hostPrefill, setHostPrefill] = useState<string | null>(null);
  const [loadAnimDone, setLoadAnimDone] = useState(false);

  // Minimum 3s so the liquid-gold animation plays fully
  useEffect(() => {
    const timer = setTimeout(() => setLoadAnimDone(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Gate on the dedicated `onboarded` flag (decoupled from provider config),
    // so a factory reset can clear the flag and re-trigger onboarding while
    // keeping the user's saved provider + API key. Fall back to the legacy
    // provider-presence check for users onboarded before the flag existed.
    invoke<{ value: string | null }>("engine_rpc", { method: "settings.get", params: { key: "onboarded" } })
      .then((r) => {
        if (r.value === "true") { setReady(true); return; }
        // Legacy: treat an existing provider config as onboarded, and persist the flag.
        invoke<{ provider: string } | null>("provider_get")
          .then((cfg) => {
            const ok = !!cfg?.provider;
            setReady(ok);
            if (ok) invoke("engine_rpc", { method: "settings.set", params: { key: "onboarded", value: "true" } }).catch(() => {});
          })
          .catch(() => setReady(false));
      })
      .catch(() => setReady(false));
  }, []);

  // Toast when the agent learns a new skill from a task.
  useEffect(() => {
    const un = listen<{ method: string; params: { name: string } }>("engine-event", (e) => {
      if (e.payload.method !== "chat.skill_created") return;
      setLearnedToast(`Learned a new skill: ${e.payload.params.name}`);
      setTimeout(() => setLearnedToast(null), 5000);
    });
    return () => { un.then((f) => f()).catch(() => {}); };
  }, []);

  // Load latest conversation on mount
  useEffect(() => {
    if (!ready) return;
    invoke<{ conversation: { id: string } } | null>("engine_rpc", {
      method: "conversation.latest",
      params: {},
    })
      .then((result) => {
        if (result) setConversationId(result.conversation.id);
      })
      .catch(() => {});
  }, [ready]);

  // Keep the top-bar task title in sync with the active conversation
  useEffect(() => {
    if (!conversationId) {
      setTaskTitle(null);
      return;
    }
    invoke<{ conversation: { title: string } }>("engine_rpc", {
      method: "conversation.get",
      params: { id: conversationId },
    })
      .then((r) => setTaskTitle(r.conversation?.title ?? null))
      .catch(() => setTaskTitle(null));
  }, [conversationId]);

  if (ready === null || !loadAnimDone) {
    return <LoadingScreen />;
  }

  if (!ready) {
    return <WelcomeScreen onComplete={() => setReady(true)} />;
  }

  // Navigate handler: switches view
  function navigate(view: MainView) {
    setActiveView(view);
  }

  // ZCode layout: full-height sidebar + main column (its own header + content)
  return (
    <div className="flex h-screen bg-nexus-bg">
      {showSettings && (
        <div className="fixed inset-0 z-50 flex bg-nexus-bg">
          <Settings onClose={() => setShowSettings(false)} />
        </div>
      )}
      <SpaceCanvas />
      <LeftSidebar
        currentId={conversationId}
        activeView={activeView}
        onSelect={(id) => { setConversationId(id); setActiveView("chat"); }}
        onNewChat={() => { setConversationId(null); setActiveView("chat"); }}
        onNavigate={navigate}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          taskTitle={VIEW_TITLES[activeView] || taskTitle}
          viewOpen={activeView !== "chat" ? activeView : undefined}
          onBackToChat={() => setActiveView("chat")}
          onOpenSettings={() => setShowSettings(true)}
          onPickHost={(name) => setHostPrefill(`Run a command on my ${name} over SSH: `)}
        />
        <div className="flex-1 overflow-hidden">
          {activeView === "ab" ? (
            <ABTestView />
          ) : activeView === "workflows" ? (
            <WorkflowsView />
          ) : activeView === "skills" ? (
            <SkillsView />
          ) : activeView === "kanban" ? (
            <KanbanView />
          ) : activeView === "marketplace" ? (
            <MarketplaceView />
          ) : (
            <ChatConsole
              conversationId={conversationId}
              onConversationCreated={(id) => setConversationId(id)}
              inputPrefill={hostPrefill}
              onConsumedPrefill={() => setHostPrefill(null)}
            />
          )}
        </div>
      </div>

      {learnedToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border border-gold-faint bg-nexus-elevated px-4 py-2.5 text-sm text-nexus-fg shadow-xl animate-toast">
          <span className="text-nexus-gold">✦</span>{learnedToast}
        </div>
      )}
    </div>
  );
}

export default App;
