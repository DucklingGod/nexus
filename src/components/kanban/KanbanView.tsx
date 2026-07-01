import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types — mirror the engine KanbanBoard structure
// ---------------------------------------------------------------------------

interface Card {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  labels: string[];
  assignee: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  created_at: number;
  updated_at: number;
  due_date: number | null;
}

interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string | null;
  cards: Card[];
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
  columns: Column[];
}

interface BoardListItem {
  id: string;
  name: string;
  description: string | null;
  cardCount: number;
}

// ---------------------------------------------------------------------------
// Priority badge colors
// ---------------------------------------------------------------------------

const priorityStyles: Record<Card["priority"], { dot: string; text: string; label: string }> = {
  urgent: { dot: "bg-red-500", text: "text-red-400", label: "Urgent" },
  high: { dot: "bg-orange-500", text: "text-orange-400", label: "High" },
  normal: { dot: "bg-nexus-muted", text: "text-nexus-muted", label: "" },
  low: { dot: "bg-nexus-border", text: "text-nexus-muted/60", label: "Low" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KanbanView() {
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [showBoardForm, setShowBoardForm] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [addingCardTo, setAddingCardTo] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [draggedCard, setDraggedCard] = useState<{ cardId: string; fromColumn: string } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // --- Data loading ---

  const loadBoards = useCallback(async () => {
    try {
      const r = await invoke<{ boards: BoardListItem[] }>("engine_rpc", {
        method: "kanban.listBoards",
        params: {},
      });
      setBoards(r.boards ?? []);
    } catch {
      setBoards([]);
    }
  }, []);

  const loadBoard = useCallback(async (id: string) => {
    try {
      const r = await invoke<{ board: Board | null }>("engine_rpc", {
        method: "kanban.getBoard",
        params: { id },
      });
      setActiveBoard(r.board);
    } catch {
      setActiveBoard(null);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  // Auto-select first board
  useEffect(() => {
    if (boards.length > 0 && !activeBoard) {
      loadBoard(boards[0].id);
    }
  }, [boards, activeBoard, loadBoard]);

  // --- Actions ---

  async function createBoard() {
    if (!newBoardName.trim()) return;
    const r = await invoke<{ board: Board }>("engine_rpc", {
      method: "kanban.createBoard",
      params: { name: newBoardName.trim() },
    });
    setNewBoardName("");
    setShowBoardForm(false);
    await loadBoards();
    setActiveBoard(r.board);
  }

  async function deleteBoard(id: string) {
    await invoke("engine_rpc", { method: "kanban.deleteBoard", params: { id } });
    if (activeBoard?.id === id) setActiveBoard(null);
    await loadBoards();
  }

  async function addCard(columnId: string) {
    if (!newCardTitle.trim()) return;
    await invoke("engine_rpc", {
      method: "kanban.addCard",
      params: { columnId, title: newCardTitle.trim() },
    });
    setNewCardTitle("");
    setAddingCardTo(null);
    if (activeBoard) await loadBoard(activeBoard.id);
  }

  async function moveCardBackend(cardId: string, targetColumnId: string) {
    await invoke("engine_rpc", {
      method: "kanban.moveCard",
      params: { cardId, targetColumnId },
    });
    if (activeBoard) await loadBoard(activeBoard.id);
  }

  async function deleteCard(cardId: string) {
    await invoke("engine_rpc", { method: "kanban.deleteCard", params: { cardId } });
    if (activeBoard) await loadBoard(activeBoard.id);
  }

  // --- Drag and drop (native HTML5) ---

  function handleDragStart(e: React.DragEvent, cardId: string, fromColumn: string) {
    setDraggedCard({ cardId, fromColumn });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
  }

  function handleDragOver(e: React.DragEvent, columnId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== columnId) setDragOverColumn(columnId);
  }

  function handleDrop(e: React.DragEvent, targetColumnId: string) {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedCard && draggedCard.fromColumn !== targetColumnId) {
      moveCardBackend(draggedCard.cardId, targetColumnId);
    }
    setDraggedCard(null);
  }

  function handleDragEnd() {
    setDraggedCard(null);
    setDragOverColumn(null);
  }

  // -------------------------------------------------------------------------
  // Render — Board selector list
  // -------------------------------------------------------------------------

  if (!activeBoard) {
    return (
      <div className="h-full overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-start justify-between gap-6">
            <div>
              <h1 className="font-display text-2xl font-semibold text-gold-foil">Kanban</h1>
              <p className="mt-1 text-xs text-nexus-muted">
                Visual task boards. Drag cards between columns. The agent can also manage boards through chat.
              </p>
            </div>
            <button
              onClick={() => setShowBoardForm(v => !v)}
              className="rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-elevated"
            >
              {showBoardForm ? "Cancel" : "+ New board"}
            </button>
          </div>

          {showBoardForm && (
            <div className="mb-5 flex gap-2 rounded-lg border border-gold-faint bg-nexus-surface/40 p-4">
              <input
                autoFocus
                value={newBoardName}
                onChange={e => setNewBoardName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createBoard(); }}
                placeholder="Board name (e.g. Sprint Q3, Bug Triage)"
                className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent"
              />
              <button
                onClick={createBoard}
                disabled={!newBoardName.trim()}
                className="rounded-lg bg-nexus-accent px-5 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          )}

          {boards.length === 0 ? (
            <p className="text-xs text-nexus-muted">
              No boards yet. Create one to get started — each new board comes with To Do, In Progress, and Done columns.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {boards.map(b => (
                <button
                  key={b.id}
                  onClick={() => loadBoard(b.id)}
                  className="group flex flex-col gap-1 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-left transition hover:border-gold-faint hover:bg-nexus-elevated"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-nexus-fg">{b.name}</span>
                    <span className="text-[10px] text-nexus-muted/50">{b.cardCount} cards</span>
                  </div>
                  {b.description && (
                    <span className="text-xs text-nexus-muted">{b.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render — Active board (columns + cards)
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Board header */}
      <div className="flex items-center justify-between border-b border-nexus-border/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveBoard(null)}
            className="text-nexus-muted hover:text-nexus-fg"
            title="Back to boards"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="font-display text-lg font-semibold text-gold-foil">{activeBoard.name}</h1>
          <span className="text-[10px] text-nexus-muted/50">
            {activeBoard.columns.reduce((sum, c) => sum + c.cards.length, 0)} cards
          </span>
        </div>
        <button
          onClick={() => deleteBoard(activeBoard.id)}
          className="rounded p-1 text-nexus-muted/40 hover:text-red-400"
          title="Delete board"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 5h10M6 5V3.5A1.5 1.5 0 017.5 2h1A1.5 1.5 0 0110 3.5V5M5 5l.5 8.5A1 1 0 006.5 14.5h3a1 1 0 001-.95L11 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Columns — horizontal scroll */}
      <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-4">
        {activeBoard.columns.map(col => (
          <div
            key={col.id}
            onDragOver={e => handleDragOver(e, col.id)}
            onDrop={e => handleDrop(e, col.id)}
            onDragLeave={() => { if (dragOverColumn === col.id) setDragOverColumn(null); }}
            className={`flex w-72 flex-shrink-0 flex-col rounded-lg border transition ${
              dragOverColumn === col.id
                ? "border-nexus-accent bg-nexus-elevated/60"
                : "border-nexus-border bg-nexus-surface/30"
            }`}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: col.color ?? "var(--color-nexus-muted)" }}
                />
                <span className="text-xs font-medium text-nexus-fg">{col.name}</span>
                <span className="text-[10px] text-nexus-muted/50">{col.cards.length}</span>
              </div>
              <button
                onClick={() => setAddingCardTo(addingCardTo === col.id ? null : col.id)}
                className="rounded p-0.5 text-nexus-muted/40 hover:text-nexus-gold"
                title="Add card"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Cards */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
              {col.cards.map(card => {
                const ps = priorityStyles[card.priority];
                return (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={e => handleDragStart(e, card.id, col.id)}
                    onDragEnd={handleDragEnd}
                    className={`group cursor-grab rounded-md border border-nexus-border bg-nexus-surface px-3 py-2.5 transition hover:border-nexus-muted/40 active:cursor-grabbing ${
                      draggedCard?.cardId === card.id ? "opacity-40" : ""
                    }`}
                  >
                    {/* Title */}
                    <p className="text-xs text-nexus-fg">{card.title}</p>

                    {/* Labels */}
                    {card.labels.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {card.labels.map((label, i) => (
                          <span key={i} className="rounded-full border border-nexus-border px-1.5 py-px text-[8px] text-nexus-muted">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer: priority + due date */}
                    {(card.priority !== "normal" || card.due_date) && (
                      <div className="mt-1.5 flex items-center gap-2">
                        {card.priority !== "normal" && (
                          <div className="flex items-center gap-1">
                            <div className={`h-1.5 w-1.5 rounded-full ${ps.dot}`} />
                            <span className={`text-[9px] ${ps.text}`}>{ps.label}</span>
                          </div>
                        )}
                        {card.due_date && (
                          <span className="text-[9px] text-nexus-muted/60">
                            {new Date(card.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Delete on hover */}
                    <button
                      onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                      className="absolute right-1 top-1 hidden rounded p-0.5 text-nexus-muted/30 hover:text-red-400 group-hover:block"
                    >
                      <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}

              {/* Add card form */}
              {addingCardTo === col.id && (
                <div className="flex flex-col gap-1.5 rounded-md border border-gold-faint bg-nexus-surface/50 p-2">
                  <textarea
                    autoFocus
                    value={newCardTitle}
                    onChange={e => setNewCardTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCard(col.id); }
                      if (e.key === "Escape") { setAddingCardTo(null); setNewCardTitle(""); }
                    }}
                    placeholder="Card title…"
                    rows={2}
                    className="resize-none rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent"
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => { setAddingCardTo(null); setNewCardTitle(""); }}
                      className="rounded px-2 py-1 text-[10px] text-nexus-muted hover:text-nexus-fg"
                    >Cancel</button>
                    <button
                      onClick={() => addCard(col.id)}
                      disabled={!newCardTitle.trim()}
                      className="rounded bg-nexus-accent px-2.5 py-1 text-[10px] font-medium text-black hover:opacity-90 disabled:opacity-40"
                    >Add</button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {col.cards.length === 0 && addingCardTo !== col.id && (
                <button
                  onClick={() => setAddingCardTo(col.id)}
                  className="rounded-md border border-dashed border-nexus-border/50 py-3 text-[10px] text-nexus-muted/40 hover:border-nexus-muted/60 hover:text-nexus-muted"
                >
                  + Add card
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
