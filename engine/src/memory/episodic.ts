import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    provider   TEXT,
    model      TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content         TEXT NOT NULL DEFAULT '',
    tool_events     TEXT,
    timestamp       INTEGER NOT NULL,
    sort_order      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, sort_order);
`);

// Migration: `source` groups conversations by origin (local | telegram | discord).
try {
  db.exec("ALTER TABLE conversations ADD COLUMN source TEXT NOT NULL DEFAULT 'local'");
} catch {
  /* column already exists */
}

// --- Conversation CRUD ---

export interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  provider: string | null;
  model: string | null;
  source: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  tool_events: string | null; // JSON
  timestamp: number;
  sort_order: number;
}

export function createConversation(
  id: string,
  title: string,
  provider?: string,
  model?: string,
  source: string = "local",
): void {
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, title, created_at, updated_at, provider, model, source) VALUES (?,?,?,?,?,?,?)",
  ).run(id, title, now, now, provider ?? null, model ?? null, source);
}

export function updateConversation(id: string, title: string): void {
  db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
}

export function listConversations(limit = 50): ConversationRow[] {
  return db
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as ConversationRow[];
}

export function getConversation(id: string): ConversationRow | null {
  return (
    (db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow) ?? null
  );
}

export function deleteConversation(id: string): void {
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

// --- Message CRUD ---

export function addMessage(
  id: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  toolEvents?: unknown[],
  sortOrder?: number,
): void {
  const ts = Date.now();
  const order = sortOrder ?? ts;
  db.prepare(
    "INSERT OR REPLACE INTO messages (id, conversation_id, role, content, tool_events, timestamp, sort_order) VALUES (?,?,?,?,?,?,?)",
  ).run(
    id,
    conversationId,
    role,
    content,
    toolEvents ? JSON.stringify(toolEvents) : null,
    ts,
    order,
  );
  // Touch conversation
  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(ts, conversationId);
}

export function getMessages(conversationId: string): MessageRow[] {
  return db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC")
    .all(conversationId) as MessageRow[];
}

export function getLatestConversation(): ConversationRow | null {
  return (
    (db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 1").get() as
      | ConversationRow
      | undefined) ?? null
  );
}

// Auto-generate title from first user message
export function autoTitle(conversationId: string): void {
  const first = db
    .prepare(
      "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY sort_order ASC LIMIT 1",
    )
    .get(conversationId) as { content: string } | undefined;
  if (first) {
    const title = first.content.slice(0, 60) + (first.content.length > 60 ? "…" : "");
    updateConversation(conversationId, title);
  }
}
