import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WelcomeScreen } from "./components/onboarding/WelcomeScreen";
import { ChatConsole } from "./components/chat/ChatConsole";
import { Settings } from "./components/settings/Settings";
import { LeftSidebar } from "./components/sidebar/LeftSidebar";
import { TopBar } from "./components/chat/TopBar";
import { SkillsView } from "./components/skills/SkillsView";
import { WorkflowsView } from "./components/workflow/WorkflowsView";
import { ABTestView } from "./components/lab/ABTestView";
import { KanbanView } from "./components/kanban/KanbanView";
import { LoadingScreen } from "./components/LoadingScreen";
import { SpaceCanvas } from "./components/SpaceCanvas";

function App() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [showAB, setShowAB] = useState(false);
  const [showKanban, setShowKanban] = useState(false);
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
    invoke<{ provider: string } | null>("provider_get")
      .then((cfg) => setReady(!!cfg?.provider))
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

  if (showSettings) {
    return <Settings onClose={() => setShowSettings(false)} />;
  }

  // ZCode layout: full-height sidebar + main column (its own header + content)
  return (
    <div className="flex h-screen bg-nexus-bg">
      <SpaceCanvas />
      <LeftSidebar
        currentId={conversationId}
        onSelect={(id) => { setConversationId(id); setShowSkills(false); setShowWorkflows(false); setShowAB(false); setShowKanban(false); }}
        onNewChat={() => { setConversationId(null); setShowSkills(false); setShowWorkflows(false); setShowAB(false); setShowKanban(false); }}
        onOpenSkills={() => { setShowSkills(true); setShowWorkflows(false); setShowAB(false); setShowKanban(false); }}
        onOpenWorkflows={() => { setShowWorkflows(true); setShowSkills(false); setShowAB(false); setShowKanban(false); }}
        onOpenKanban={() => { setShowKanban(true); setShowSkills(false); setShowWorkflows(false); setShowAB(false); }}
        onOpenAB={() => { setShowAB(true); setShowSkills(false); setShowWorkflows(false); setShowKanban(false); }}
        onOpenSettings={() => setShowSettings(true)}
        skillsActive={showSkills}
        workflowsActive={showWorkflows}
        abActive={showAB}
        kanbanActive={showKanban}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          taskTitle={showAB ? "A/B Test" : showWorkflows ? "Workflows" : showSkills ? "Skills" : showKanban ? "Kanban" : taskTitle}
          onOpenSettings={() => setShowSettings(true)}
          onPickHost={(name) => setHostPrefill(`Run a command on my ${name} over SSH: `)}
        />
        <div className="flex-1 overflow-hidden">
          {showAB ? (
            <ABTestView />
          ) : showWorkflows ? (
            <WorkflowsView />
          ) : showSkills ? (
            <SkillsView />
          ) : showKanban ? (
            <KanbanView />
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
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border border-gold-faint bg-nexus-elevated px-4 py-2.5 text-sm text-nexus-fg shadow-xl animate-dropdown">
          <span className="text-nexus-gold">✦</span>{learnedToast}
        </div>
      )}
    </div>
  );
}

export default App;
