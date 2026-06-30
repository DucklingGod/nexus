// Visual workflow storage (Task 34). A workflow is a node-graph (nodes + edges)
// authored in the canvas and saved as JSON. Execution comes in Task 36.

import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS workflows (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    graph      TEXT NOT NULL,       -- JSON { nodes, edges }
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export interface WorkflowRow {
  id: string;
  name: string;
  graph: string;
  created_at: number;
  updated_at: number;
}

export function listWorkflows(): { id: string; name: string; updated_at: number }[] {
  return db
    .prepare("SELECT id, name, updated_at FROM workflows ORDER BY updated_at DESC")
    .all() as { id: string; name: string; updated_at: number }[];
}

export function getWorkflow(id: string): WorkflowRow | null {
  return (db.prepare("SELECT * FROM workflows WHERE id = ?").get(id) as WorkflowRow) ?? null;
}

export function saveWorkflow(id: string | undefined, name: string, graph: unknown): string {
  const now = Date.now();
  const wid = id || `wf-${randomUUID().slice(0, 8)}`;
  if (getWorkflow(wid)) {
    db.prepare("UPDATE workflows SET name = ?, graph = ?, updated_at = ? WHERE id = ?").run(
      name, JSON.stringify(graph), now, wid,
    );
  } else {
    db.prepare("INSERT INTO workflows (id, name, graph, created_at, updated_at) VALUES (?,?,?,?,?)").run(
      wid, name, JSON.stringify(graph), now, now,
    );
  }
  return wid;
}

export function deleteWorkflow(id: string): void {
  db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
}
