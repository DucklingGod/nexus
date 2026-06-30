import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Conversation {
  id: string;
  title: string;
  updated_at: number;
  provider: string | null;
  model: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (convId: string) => void;
  currentId: string | null;
  onNewChat: () => void;
}

export function ConversationSidebar({ isOpen, onClose, onSelect, currentId, onNewChat }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const method = search.trim() ? "conversation.search" : "conversation.list";
      const params = search.trim() ? { query: search } : { limit: 50 };
      const result = await invoke<{ conversations: Conversation[] }>("engine_rpc", { method, params });
      setConversations(result.conversations ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (isOpen) loadConversations();
  }, [isOpen, loadConversations]);

  // Debounce search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(loadConversations, 300);
    return () => clearTimeout(timer);
  }, [search, isOpen, loadConversations]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await invoke("engine_rpc", { method: "conversation.delete", params: { id } });
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  }

  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-nexus-border bg-nexus-elevated shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-nexus-border px-3 py-3">
        <h2 className="text-sm font-medium text-nexus-fg">Conversations</h2>
        <button onClick={onClose} className="rounded p-1 text-nexus-muted hover:bg-nexus-surface hover:text-nexus-fg">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 6L6 10M6 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search conversations…"
          className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-3 py-1.5 text-xs text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent"
        />
      </div>

      {/* New chat */}
      <div className="px-3 pb-2">
        <button
          onClick={() => { onNewChat(); onClose(); }}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-nexus-border px-3 py-2 text-xs text-nexus-muted transition hover:border-nexus-accent hover:text-nexus-accent"
        >
          <span>+</span> New Chat
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <p className="py-4 text-center text-xs text-nexus-muted">
            {search ? "No matching conversations" : "No conversations yet"}
          </p>
        )}
        {conversations.map(conv => (
          <button
            key={conv.id}
            onClick={() => { onSelect(conv.id); onClose(); }}
            className={`group flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition hover:bg-nexus-surface ${
              conv.id === currentId ? "bg-nexus-surface border border-nexus-accent/30" : "border border-transparent"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-xs font-medium text-nexus-fg">{conv.title || "New Chat"}</span>
              <button
                onClick={(e) => handleDelete(conv.id, e)}
                className="hidden rounded p-0.5 text-nexus-muted hover:text-red-400 group-hover:block"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <span className="text-[10px] text-nexus-muted">{formatTime(conv.updated_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
