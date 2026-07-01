// Kanban board storage — SQLite-backed boards with columns and cards.
// Stored in the same nexus.db as everything else.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS kanban_boards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kanban_columns (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    color       TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kanban_cards (
    id          TEXT PRIMARY KEY,
    column_id   TEXT NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    labels      TEXT DEFAULT '[]',
    assignee    TEXT,
    priority    TEXT DEFAULT 'normal',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    due_date    INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_kanban_columns_board ON kanban_columns(board_id, position);
  CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards(column_id, position);
`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KanbanCard {
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

export interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string | null;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
  columns: KanbanColumn[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function parseCard(row: Record<string, unknown>): KanbanCard {
  return {
    id: row.id as string,
    column_id: row.column_id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    position: row.position as number,
    labels: JSON.parse((row.labels as string) || "[]") as string[],
    assignee: (row.assignee as string) ?? null,
    priority: ((row.priority as string) || "normal") as KanbanCard["priority"],
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    due_date: (row.due_date as number) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Board operations
// ---------------------------------------------------------------------------

export function createBoard(name: string, description?: string): KanbanBoard {
  const id = genId("board");
  const now = Date.now();
  db.prepare(
    "INSERT INTO kanban_boards (id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)",
  ).run(id, name, description ?? null, now, now);

  // Create default columns: To Do, In Progress, Done
  const defaultCols = [
    { name: "To Do", color: "#6b7280" },
    { name: "In Progress", color: "#f59e0b" },
    { name: "Done", color: "#10b981" },
  ];
  for (let i = 0; i < defaultCols.length; i++) {
    const colId = genId("col");
    db.prepare(
      "INSERT INTO kanban_columns (id, board_id, name, position, color, created_at) VALUES (?,?,?,?,?,?)",
    ).run(colId, id, defaultCols[i].name, i, defaultCols[i].color, now);
  }

  return getBoard(id)!;
}

export function getBoard(id: string): KanbanBoard | null {
  const board = db.prepare("SELECT * FROM kanban_boards WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!board) return null;

  const columns = db
    .prepare("SELECT * FROM kanban_columns WHERE board_id = ? ORDER BY position ASC")
    .all(id) as Record<string, unknown>[];

  const cols: KanbanColumn[] = columns.map((col) => {
    const cards = (db
      .prepare("SELECT * FROM kanban_cards WHERE column_id = ? ORDER BY position ASC")
      .all(col.id as string) as Record<string, unknown>[]).map(parseCard);

    return {
      id: col.id as string,
      board_id: col.board_id as string,
      name: col.name as string,
      position: col.position as number,
      color: (col.color as string) ?? null,
      cards,
    };
  });

  return {
    id: board.id as string,
    name: board.name as string,
    description: (board.description as string) ?? null,
    created_at: board.created_at as number,
    updated_at: board.updated_at as number,
    columns: cols,
  };
}

export function listBoards(): { id: string; name: string; description: string | null; cardCount: number }[] {
  const boards = db.prepare("SELECT * FROM kanban_boards ORDER BY updated_at DESC").all() as Record<string, unknown>[];
  return boards.map((b) => {
    const cardCount = (db
      .prepare(
        `SELECT COUNT(*) as count FROM kanban_cards c
         JOIN kanban_columns col ON c.column_id = col.id
         WHERE col.board_id = ?`,
      )
      .get(b.id as string) as { count: number }).count;
    return {
      id: b.id as string,
      name: b.name as string,
      description: (b.description as string) ?? null,
      cardCount,
    };
  });
}

export function deleteBoard(id: string): void {
  db.prepare("DELETE FROM kanban_boards WHERE id = ?").run(id);
}

export function renameBoard(id: string, name: string): void {
  db.prepare("UPDATE kanban_boards SET name = ?, updated_at = ? WHERE id = ?").run(name, Date.now(), id);
}

// ---------------------------------------------------------------------------
// Column operations
// ---------------------------------------------------------------------------

export function addColumn(boardId: string, name: string, color?: string): string {
  const maxPos = (db
    .prepare("SELECT MAX(position) as max FROM kanban_columns WHERE board_id = ?")
    .get(boardId) as { max: number | null }).max ?? -1;

  const id = genId("col");
  db.prepare(
    "INSERT INTO kanban_columns (id, board_id, name, position, color, created_at) VALUES (?,?,?,?,?,?)",
  ).run(id, boardId, name, maxPos + 1, color ?? null, Date.now());

  return id;
}

export function deleteColumn(columnId: string): void {
  db.prepare("DELETE FROM kanban_columns WHERE id = ?").run(columnId);
}

export function renameColumn(columnId: string, name: string): void {
  db.prepare("UPDATE kanban_columns SET name = ? WHERE id = ?").run(name, columnId);
}

// ---------------------------------------------------------------------------
// Card operations
// ---------------------------------------------------------------------------

export function addCard(
  columnId: string,
  title: string,
  description?: string,
  opts?: { priority?: KanbanCard["priority"]; labels?: string[]; due_date?: number; assignee?: string },
): string {
  const maxPos = (db
    .prepare("SELECT MAX(position) as max FROM kanban_cards WHERE column_id = ?")
    .get(columnId) as { max: number | null }).max ?? -1;

  const id = genId("card");
  const now = Date.now();
  db.prepare(
    `INSERT INTO kanban_cards (id, column_id, title, description, position, labels, assignee, priority, created_at, updated_at, due_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, columnId, title, description ?? null, maxPos + 1,
    JSON.stringify(opts?.labels ?? []), opts?.assignee ?? null, opts?.priority ?? "normal",
    now, now, opts?.due_date ?? null,
  );
  return id;
}

export function moveCard(cardId: string, targetColumnId: string): void {
  const maxPos = (db
    .prepare("SELECT MAX(position) as max FROM kanban_cards WHERE column_id = ?")
    .get(targetColumnId) as { max: number | null }).max ?? -1;

  db.prepare("UPDATE kanban_cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?").run(
    targetColumnId, maxPos + 1, Date.now(), cardId,
  );
}

export function updateCard(cardId: string, updates: Partial<Pick<KanbanCard, "title" | "description" | "priority" | "labels" | "assignee" | "due_date">>): boolean {
  const card = db.prepare("SELECT * FROM kanban_cards WHERE id = ?").get(cardId) as Record<string, unknown> | undefined;
  if (!card) return false;

  const now = Date.now();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) { fields.push("title = ?"); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
  if (updates.priority !== undefined) { fields.push("priority = ?"); values.push(updates.priority); }
  if (updates.labels !== undefined) { fields.push("labels = ?"); values.push(JSON.stringify(updates.labels)); }
  if (updates.assignee !== undefined) { fields.push("assignee = ?"); values.push(updates.assignee); }
  if (updates.due_date !== undefined) { fields.push("due_date = ?"); values.push(updates.due_date); }

  if (fields.length === 0) return true;
  fields.push("updated_at = ?");
  values.push(now);
  values.push(cardId);

  db.prepare(`UPDATE kanban_cards SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return true;
}

export function deleteCard(cardId: string): void {
  db.prepare("DELETE FROM kanban_cards WHERE id = ?").run(cardId);
}

export function getCard(cardId: string): KanbanCard | null {
  const row = db.prepare("SELECT * FROM kanban_cards WHERE id = ?").get(cardId) as Record<string, unknown> | undefined;
  return row ? parseCard(row) : null;
}
