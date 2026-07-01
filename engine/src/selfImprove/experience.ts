// Self-improvement — Experience Collector (Task 47). Logs every task execution
// with full context for later pattern analysis (Task 48 detects recurring
// patterns; this module is the substrate). Searchable via in-JS cosine over
// lazily-embedded vectors (the sanctioned sqlite-vec fallback).
//
// Mirrors skills.ts / knowledge/documents.ts: own table, lazy embeddings,
// JSON-stored vectors. Opt-in via setting "experience.enabled" = "true".

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { embed } from "../providers/embed.ts";

type EmbedConfig = { baseUrl: string; apiKey: string };

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS experiences (
    id          TEXT PRIMARY KEY,
    input       TEXT NOT NULL,
    output      TEXT NOT NULL,
    tool_steps  TEXT NOT NULL DEFAULT '[]',  -- JSON [{name,args,ok}]
    success     INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    model       TEXT,
    feedback    TEXT,                         -- null | 'up' | 'down'
    embedding   TEXT,                          -- JSON number[] (lazy)
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_experiences_created ON experiences(created_at DESC);
`);

export interface ToolStep {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
}

export interface Experience {
  id: string;
  input: string;
  output: string;
  tool_steps: ToolStep[];
  success: boolean;
  duration_ms: number;
  model: string | null;
  feedback: "up" | "down" | null;
  created_at: number;
}

interface ExpRow {
  id: string; input: string; output: string; tool_steps: string;
  success: number; duration_ms: number; model: string | null;
  feedback: string | null; created_at: number;
}

function rowToExp(r: ExpRow): Experience {
  let steps: ToolStep[] = [];
  try { steps = JSON.parse(r.tool_steps) as ToolStep[]; } catch { /* keep [] */ }
  return {
    id: r.id, input: r.input, output: r.output, tool_steps: steps,
    success: r.success === 1, duration_ms: r.duration_ms, model: r.model,
    feedback: r.feedback as "up" | "down" | null, created_at: r.created_at,
  };
}

export interface LogExperienceInput {
  input: string;
  output: string;
  tool_steps?: ToolStep[];
  success?: boolean;
  duration_ms?: number;
  model?: string;
}

/** Record one task execution. Called fire-and-forget after a finalized reply. */
export function logExperience(e: LogExperienceInput): string {
  const id = `exp-${randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO experiences (id, input, output, tool_steps, success, duration_ms, model, feedback, embedding, created_at)
     VALUES (?,?,?,?,?,?,?,NULL,NULL,?)`,
  ).run(
    id,
    e.input.slice(0, 4000),
    e.output.slice(0, 4000),
    JSON.stringify((e.tool_steps ?? []).slice(0, 20)),
    e.success === false ? 0 : 1,
    e.duration_ms ?? 0,
    e.model ?? null,
    Date.now(),
  );
  return id;
}

export function listExperiences(limit = 50): Experience[] {
  const rows = db
    .prepare("SELECT id, input, output, tool_steps, success, duration_ms, model, feedback, created_at FROM experiences ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ExpRow[];
  return rows.map(rowToExp);
}

export function getExperience(id: string): Experience | null {
  const row = db
    .prepare("SELECT id, input, output, tool_steps, success, duration_ms, model, feedback, created_at FROM experiences WHERE id = ?")
    .get(id) as ExpRow | undefined;
  return row ? rowToExp(row) : null;
}

/** Attach user feedback (thumbs up/down) to a logged experience. */
export function setFeedback(id: string, feedback: "up" | "down" | null): boolean {
  const r = db.prepare("UPDATE experiences SET feedback = ? WHERE id = ?").run(feedback, id);
  return r.changes > 0;
}

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Lazily embed experiences that have no vector yet (batched, like documents.ts).
async function ensureEmbeddings(config: EmbedConfig): Promise<void> {
  const rows = db
    .prepare("SELECT id, input FROM experiences WHERE embedding IS NULL LIMIT 128")
    .all() as { id: string; input: string }[];
  if (rows.length === 0) return;
  const vecs = await embed(config, rows.map((r) => r.input.slice(0, 1000)));
  const upd = db.prepare("UPDATE experiences SET embedding = ? WHERE id = ?");
  const tx = db.transaction((items: { id: string; vec: number[] }[]) => {
    for (const it of items) upd.run(JSON.stringify(it.vec), it.id);
  });
  tx(rows.map((r, i) => ({ id: r.id, vec: vecs[i] })).filter((x) => Array.isArray(x.vec)));
}

/** Semantic search over past experiences by similarity to a query. */
export async function searchExperiences(query: string, config: EmbedConfig, topK = 5): Promise<{ exp: Experience; score: number }[]> {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM experiences").get() as { n: number }).n;
  if (count === 0) return [];
  await ensureEmbeddings(config);
  const [qv] = await embed(config, [query]);
  if (!qv) return [];
  const rows = db
    .prepare("SELECT id, input, output, tool_steps, success, duration_ms, model, feedback, created_at, embedding FROM experiences WHERE embedding IS NOT NULL")
    .all() as (ExpRow & { embedding: string })[];
  return rows
    .map((r) => ({ exp: rowToExp(r), score: cosine(qv, JSON.parse(r.embedding) as number[]) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
