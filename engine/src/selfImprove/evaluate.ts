// Self-improvement — Self-Evaluation (Task 49b). After a task, one LLM call
// scores the turn on completion / satisfaction / efficiency. The last score is
// surfaced in the UI and (minimally) noted in the system prompt so the agent
// is aware of how it's doing — per YAGNI, not a full planning loop.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ProviderConfig } from "../providers/types.ts";
import { getSetting } from "../db/settings.ts";
import { chat } from "../providers/client.ts";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS evaluations (
    id          TEXT PRIMARY KEY,
    completion  INTEGER NOT NULL,   -- 0-100
    satisfaction INTEGER NOT NULL,  -- 0-100
    efficiency  INTEGER NOT NULL,   -- 0-100
    note        TEXT,
    created_at  INTEGER NOT NULL
  );
`);

export interface Evaluation {
  id: string;
  completion: number;
  satisfaction: number;
  efficiency: number;
  note: string | null;
  created_at: number;
}

interface EvalRow {
  id: string; completion: number; satisfaction: number;
  efficiency: number; note: string | null; created_at: number;
}

function parseEvalJson(text: string): { completion: number; satisfaction: number; efficiency: number; note?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1));
    const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    return {
      completion: clamp(o.completion),
      satisfaction: clamp(o.satisfaction),
      efficiency: clamp(o.efficiency),
      note: o.note ? String(o.note).slice(0, 300) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Score the just-finished turn. Fire-and-forget; callers `void` the promise.
 * Returns null if disabled or nothing to evaluate.
 */
export async function evaluateSession(
  config: ProviderConfig,
  messages: ChatMessage[],
  model: string,
): Promise<Evaluation | null> {
  if (getSetting("evaluation.enabled") !== "true") return null;
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 5000);
  if (transcript.length < 100) return null;

  const prompt =
    "You are an evaluation system. Score the assistant's performance in the conversation below " +
    "on three axes (0-100): completion (did it finish the user's task?), satisfaction (likely user " +
    "satisfaction with the reply quality), efficiency (did it avoid wasted steps?). Reply JSON only:\n" +
    '{"completion": 0-100, "satisfaction": 0-100, "efficiency": 0-100, "note": "one short sentence"}\n\nConversation:\n' +
    transcript;

  const res = await chat(config, { messages: [{ role: "user", content: prompt }], model, maxTokens: 200 });
  const parsed = parseEvalJson(res.content);
  if (!parsed) return null;

  const id = `eval-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO evaluations (id, completion, satisfaction, efficiency, note, created_at) VALUES (?,?,?,?,?,?)",
  ).run(id, parsed.completion, parsed.satisfaction, parsed.efficiency, parsed.note ?? null, Date.now());
  return {
    id, completion: parsed.completion, satisfaction: parsed.satisfaction,
    efficiency: parsed.efficiency, note: parsed.note ?? null, created_at: Date.now(),
  };
}

export function getLatestEvaluation(): Evaluation | null {
  const row = db
    .prepare("SELECT id, completion, satisfaction, efficiency, note, created_at FROM evaluations ORDER BY created_at DESC LIMIT 1")
    .get() as EvalRow | undefined;
  return row ?? null;
}

export function listEvaluations(limit = 20): Evaluation[] {
  const rows = db
    .prepare("SELECT id, completion, satisfaction, efficiency, note, created_at FROM evaluations ORDER BY created_at DESC LIMIT ?")
    .all(limit) as EvalRow[];
  return rows;
}
