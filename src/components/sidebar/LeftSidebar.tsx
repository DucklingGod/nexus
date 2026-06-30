import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Conversation {
  id: string;
  title: string;
  updated_at: number;
  source?: string;
}

interface Props {
  currentId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onOpenSkills: () => void;
  onOpenWorkflows: () => void;
  onOpenAB: () => void;
  onOpenSettings: () => void;
  skillsActive?: boolean;
  workflowsActive?: boolean;
  abActive?: boolean;
}

export function LeftSidebar({ currentId, onSelect, onNewChat, onOpenSkills, onOpenWorkflows, onOpenAB, onOpenSettings, skillsActive, workflowsActive, abActive }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeTab, setActiveTab] = useState<"group" | "project">("project");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await invoke<{ conversations: Conversation[] }>("engine_rpc", { method: "conversation.list", params: { limit: 50 } });
      setConversations(result.conversations ?? []);
    } catch { setConversations([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live refresh when a connector (Telegram/Discord) receives a message.
  useEffect(() => {
    const un = listen<{ method?: string }>("engine-event", (e) => {
      if (e.payload?.method === "conversation.updated") load();
    });
    return () => { un.then((f) => f()).catch(() => {}); };
  }, [load]);

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await invoke("engine_rpc", { method: "conversation.delete", params: { id } });
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  }

  async function runSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const r = await invoke<{ conversations: Conversation[] }>("engine_rpc", { method: "conversation.search", params: { query: q } });
      setSearchResults(r.conversations ?? []);
    } catch { setSearchResults([]); }
  }

  const local = conversations.filter(c => !c.source || c.source === "local");
  const telegram = conversations.filter(c => c.source === "telegram");
  const discord = conversations.filter(c => c.source === "discord");

  const convButton = (conv: Conversation) => (
    <button
      key={conv.id}
      onClick={() => onSelect(conv.id)}
      className={`group flex w-full items-center justify-between rounded-md px-2 py-1.5 pl-6 text-left transition hover:bg-nexus-surface ${conv.id === currentId ? "bg-nexus-surface" : ""}`}
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        {conv.id === currentId && <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-nexus-accent" />}
        <span className="truncate text-[11px] text-nexus-fg">{conv.title || "New Task"}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-nexus-muted/50">{formatTime(conv.updated_at)}</span>
        <button onClick={(e) => handleDelete(conv.id, e)} className="hidden rounded p-0.5 text-nexus-muted/40 hover:text-red-400 group-hover:block">
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
    </button>
  );

  const groupHeader = (label: string, icon: React.ReactNode, count: number) => (
    <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5">
      {icon}
      <span className="text-[11px] uppercase tracking-wide text-nexus-muted">{label}</span>
      {count > 0 && <span className="ml-auto text-[9px] text-nexus-muted/40">{count}</span>}
    </div>
  );

  return (
    <div className="flex h-full w-60 flex-col border-r border-nexus-border/50 bg-nexus-surface/30">
      {/* Logo + nav arrows */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="font-display text-base font-semibold tracking-tight text-gold-foil">Nexus</span>
        <div className="flex items-center gap-0.5">
          <button className="rounded p-0.5 text-nexus-muted/50 hover:text-nexus-muted">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button className="rounded p-0.5 text-nexus-muted/50 hover:text-nexus-muted">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* Core actions */}
      <div className="flex flex-col px-2 pb-2">
        <button
          onClick={onNewChat}
          className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs text-nexus-fg transition hover:bg-nexus-surface"
        >
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            New task
          </div>
          <span className="text-[10px] text-nexus-muted/40">⌘N</span>
        </button>
        <button onClick={() => { setSearchOpen(o => !o); if (searchOpen) runSearch(""); }} className={`flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition hover:bg-nexus-surface ${searchOpen ? "bg-nexus-surface text-nexus-gold" : "text-nexus-fg"}`}>
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Search
          </div>
          <span className="text-[10px] text-nexus-muted/40">⌘K</span>
        </button>
        {searchOpen && (
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search conversations…"
            className="mx-1 mt-1 rounded-md border border-nexus-border bg-nexus-surface px-2.5 py-1.5 text-[11px] text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent"
          />
        )}
        <button onClick={onOpenSkills} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition hover:bg-nexus-surface ${skillsActive ? "bg-nexus-surface text-nexus-gold" : "text-nexus-fg"}`}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l2 4 4.5 1-3.2 3 .8 4.5L8 11.5 3.9 13.5l.8-4.5-3.2-3L6 5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          Skills
        </button>
        <button onClick={onOpenWorkflows} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition hover:bg-nexus-surface ${workflowsActive ? "bg-nexus-surface text-nexus-gold" : "text-nexus-fg"}`}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 4.2h2.8a1 1 0 011 1v4.3" stroke="currentColor" strokeWidth="1.2"/></svg>
          Workflows
        </button>
        <button onClick={onOpenAB} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition hover:bg-nexus-surface ${abActive ? "bg-nexus-surface text-nexus-gold" : "text-nexus-fg"}`}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 12V4M2 4l3 8M5 4l-3 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M9 12V4h2.5a2 2 0 010 4H9m0 0h2.8a2 2 0 010 4H9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          A/B Test
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-nexus-border/30 px-3 pb-1">
        <button
          onClick={() => setActiveTab("group")}
          className={`rounded px-2 py-1 text-[10px] ${activeTab === "group" ? "bg-nexus-surface text-nexus-fg" : "text-nexus-muted"}`}
        >
          # Group
        </button>
        <button
          onClick={() => setActiveTab("project")}
          className={`rounded px-2 py-1 text-[10px] ${activeTab === "project" ? "bg-nexus-surface text-nexus-fg" : "text-nexus-muted"}`}
        >
          Project
        </button>
        <div className="flex-1" />
        <button className="rounded p-0.5 text-nexus-muted/40 hover:text-nexus-muted">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Conversation list — search results or grouped by source */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {searchQuery.trim() ? (
          searchResults.length === 0
            ? <p className="px-2 py-2 text-[10px] text-nexus-muted/50">No matches</p>
            : searchResults.map(convButton)
        ) : (
          <>
        {conversations.length === 0 && (
          <p className="px-2 py-2 text-[10px] text-nexus-muted/50">No tasks yet</p>
        )}

        {groupHeader("local", <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h5l2 2h5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2"/></svg>, local.length)}
        {local.map(convButton)}

        {telegram.length > 0 && (
          <div className="mt-1">
            {groupHeader("Telegram", <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M14.5 2L1.5 7l3.5 1.3L12 4 6.8 9.2l-.2 3.3 2-2 3 2.2L14.5 2z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/></svg>, telegram.length)}
            {telegram.map(convButton)}
          </div>
        )}

        {discord.length > 0 && (
          <div className="mt-1">
            {groupHeader("Discord", <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10v6a1 1 0 01-1 1H7l-3 2.5V11H4a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>, discord.length)}
            {discord.map(convButton)}
          </div>
        )}
          </>
        )}
      </div>

      {/* User profile at bottom */}
      <div className="flex items-center justify-between border-t border-nexus-border/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-nexus-accent/20 text-[9px] font-medium text-nexus-accent">U</div>
          <span className="text-[11px] text-nexus-fg">User</span>
        </div>
        <button onClick={onOpenSettings} title="Settings" className="rounded p-1 text-nexus-muted/40 hover:text-nexus-gold">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2"/><path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}
