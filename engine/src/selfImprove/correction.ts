// Self-improvement — Correction Memory (Task 49a). Learns rules from user
// corrections ("don't do X, do Y instead") and injects the relevant rule into
// the system prompt on similar future situations, so the agent doesn't repeat
// a mistake. Mirrors skills.ts: own table, lazy embeddings, one-LLM-call
// extraction, and an inject function called from the agent loop.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ProviderConfig } from "../providers/types.ts";
import { getSetting } from "../db/settings.ts";
import { chat } from "../providers/client.ts";
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
  CREATE TABLE IF NOT EXISTS corrections (
    id              TEXT PRIMARY KEY,
    trigger_context TEXT NOT NULL,   -- when this rule applies (the situation)
    rule            TEXT NOT NULL,   -- "don't do X, do Y instead"
    embedding       TEXT,            -- JSON number[] of trigger_context (lazy)
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_corrections_created ON corrections(created_at DESC);
`);

export interface Correction {
  id: string;
  trigger_context: string;
  rule: string;
  created_at: number;
}

interface CorrRow {
  id: string; trigger_context: string; rule: string; created_at: number;
}

/** Manually add a correction rule (from the UI thumbs-down / "correct this"). */
export function addCorrection(triggerContext: string, rule: string): string {
  const id = `corr-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO corrections (id, trigger_context, rule, embedding, created_at) VALUES (?,?,?,?,?)",
  ).run(id, triggerContext.trim().slice(0, 1000), rule.trim().slice(0, 1000), null, Date.now());
  return id;
}

export function listCorrections(limit = 50): Correction[] {
  const rows = db
    .prepare("SELECT id, trigger_context, rule, created_at FROM corrections ORDER BY created_at DESC LIMIT ?")
    .all(limit) as CorrRow[];
  return rows;
}

export function deleteCorrection(id: string): void {
  db.prepare("DELETE FROM corrections WHERE id = ?").run(id);
}

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function ensureEmbeddings(config: EmbedConfig): Promise<void> {
  const rows = db
    .prepare("SELECT id, trigger_context FROM corrections WHERE embedding IS NULL LIMIT 128")
    .all() as { id: string; trigger_context: string }[];
  if (rows.length === 0) return;
  const vecs = await embed(config, rows.map((r) => r.trigger_context.slice(0, 1000)));
  const upd = db.prepare("UPDATE corrections SET embedding = ? WHERE id = ?");
  const tx = db.transaction((items: { id: string; vec: number[] }[]) => {
    for (const it of items) upd.run(JSON.stringify(it.vec), it.id);
  });
  tx(rows.map((r, i) => ({ id: r.id, vec: vecs[i] })).filter((x) => Array.isArray(x.vec)));
}

/** Find correction rules whose trigger context matches the current situation. */
async function matchCorrections(query: string, config: EmbedConfig, limit = 3): Promise<Correction[]> {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM corrections").get() as { n: number }).n;
  if (count === 0) return [];
  await ensureEmbeddings(config);
  const [qv] = await embed(config, [query]);
  if (!qv) return [];
  const rows = db
    .prepare("SELECT id, trigger_context, rule, created_at, embedding FROM corrections WHERE embedding IS NOT NULL")
    .all() as (CorrRow & { embedding: string })[];
  return rows
    .map((r) => ({ c: { id: r.id, trigger_context: r.trigger_context, rule: r.rule, created_at: r.created_at }, score: cosine(qv, JSON.parse(r.embedding) as number[]) }))
    .filter((x) => x.score >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Append matching correction rules to the system message (pure, like injectSkills). */
export async function injectCorrections(messages: ChatMessage[], config: EmbedConfig): Promise<ChatMessage[]> {
  if (getSetting("correction.enabled") === "false") return messages;
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!lastUser.trim()) return messages;
  try {
    const matched = await matchCorrections(lastUser.slice(0, 1000), config);
    if (matched.length === 0) return messages;
    const block =
      "\n\n# Corrections from past feedback\nThe user previously corrected you in similar situations — follow these rules:\n" +
      matched.map((c) => `- When ${c.trigger_context}: ${c.rule}`).join("\n");
    const out = [...messages];
    const sysIdx = out.findIndex((m) => m.role === "system");
    if (sysIdx >= 0) out[sysIdx] = { ...out[sysIdx], content: out[sysIdx].content + block };
    else out.unshift({ role: "system", content: block.trimStart() });
    return out;
  } catch {
    return messages; // never break a chat over corrections
  }
}

function parseCorrectionJson(text: string): { trigger_context: string; rule: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1));
    if (o.skip === true) return null;
    if (!o.trigger_context || !o.rule) return null;
    return {
      trigger_context: String(o.trigger_context).slice(0, 300),
      rule: String(o.rule).slice(0, 400),
    };
  } catch {
    return null;
  }
}

/**
 * Ask the model to distill ONE correction rule from a conversation where the
 * user gave negative feedback. Mirrors synthesizeSkill. Returns the saved id,
 * or null if nothing generalizable. Callers gate behind a setting / feedback.
 */
export async function extractCorrection(
  config: ProviderConfig,
  messages: ChatMessage[],
  model: string,
): Promise<{ id: string; rule: string } | null> {
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 6000);
  if (transcript.length < 80) return null;

  const prompt =
    "The user gave negative feedback (thumbs-down) on the assistant's reply below. " +
    "Extract ONE generalizable correction rule the assistant should follow in similar FUTURE " +
    "situations — what it should do differently. Only extract a genuine, reusable rule " +
    "(not a one-off preference). Reply with JSON only, no prose:\n" +
    '{"trigger_context": "the situation it applies to", "rule": "what to do instead"}\n' +
    'If nothing generalizable, reply exactly {"skip": true}.\n\nConversation:\n' +
    transcript;

  const res = await chat(config, { messages: [{ role: "user", content: prompt }], model, maxTokens: 300 });
  const draft = parseCorrectionJson(res.content);
  if (!draft) return null;
  const id = addCorrection(draft.trigger_context, draft.rule);
  return { id, rule: draft.rule };
}
