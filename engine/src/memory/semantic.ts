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

// Schema: knowledge base for user facts, preferences, context
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT NOT NULL DEFAULT 'fact',
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    source     TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_knowledge_cat ON knowledge(category);
  CREATE INDEX IF NOT EXISTS idx_knowledge_key ON knowledge(key);
`);

export interface KnowledgeRow {
  id: number;
  category: string;
  key: string;
  value: string;
  source: string | null;
  created_at: number;
  updated_at: number;
}

// --- CRUD ---

export function saveKnowledge(
  category: string,
  key: string,
  value: string,
  source?: string,
): number {
  const now = Date.now();
  // Upsert: if same category+key exists, update
  const existing = db
    .prepare("SELECT id FROM knowledge WHERE category = ? AND key = ?")
    .get(category, key) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE knowledge SET value = ?, source = ?, updated_at = ? WHERE id = ?",
    ).run(value, source ?? null, now, existing.id);
    return existing.id;
  }

  const result = db
    .prepare(
      "INSERT INTO knowledge (category, key, value, source, created_at, updated_at) VALUES (?,?,?,?,?,?)",
    )
    .run(category, key, value, source ?? null, now, now);
  return Number(result.lastInsertRowid);
}

export function searchKnowledge(query: string, category?: string): KnowledgeRow[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  // Simple keyword search across key + value
  const conditions = terms.map(() => "(LOWER(key) LIKE ? OR LOWER(value) LIKE ?)").join(" AND ");
  const params = terms.flatMap((t) => [`%${t}%`, `%${t}%`]);

  let sql = `SELECT * FROM knowledge WHERE ${conditions}`;
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  sql += ` ORDER BY updated_at DESC LIMIT 20`;

  return db.prepare(sql).all(...params) as KnowledgeRow[];
}

export function getByCategory(category: string, limit = 50): KnowledgeRow[] {
  return db
    .prepare("SELECT * FROM knowledge WHERE category = ? ORDER BY updated_at DESC LIMIT ?")
    .all(category, limit) as KnowledgeRow[];
}

export function getAllKnowledge(limit = 100): KnowledgeRow[] {
  return db
    .prepare("SELECT * FROM knowledge ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as KnowledgeRow[];
}

export function deleteKnowledge(id: number): void {
  db.prepare("DELETE FROM knowledge WHERE id = ?").run(id);
}

export function clearCategory(category: string): void {
  db.prepare("DELETE FROM knowledge WHERE category = ?").run(category);
}
