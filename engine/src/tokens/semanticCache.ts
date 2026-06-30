// Semantic response cache (Task 30 / v0.4). For repeated *standalone* questions,
// serve a previous answer instead of calling the LLM — saving both tokens and
// latency. Provider-agnostic: embeds via the OpenAI-compatible /embeddings
// endpoint (no-op on providers without one, same as RAG).
//
// Safe by design: only consulted/written for a fresh single-turn question (one
// user message, no prior assistant turn) and never for tool-using answers — so a
// cached reply can't contradict conversation context or stale tool output.
// Opt-in via the `cache.enabled` setting.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../providers/types.ts";
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
  CREATE TABLE IF NOT EXISTS semantic_cache (
    id         TEXT PRIMARY KEY,
    query      TEXT NOT NULL,
    response   TEXT NOT NULL,
    embedding  TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const SIMILARITY_THRESHOLD = 0.95;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // entries older than 7 days are ignored

/** Cosine similarity between two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** A fresh standalone question — the only case it's safe to cache. */
export function isCacheable(messages: ChatMessage[]): boolean {
  const users = messages.filter((m) => m.role === "user").length;
  const hasAssistant = messages.some((m) => m.role === "assistant");
  return users === 1 && !hasAssistant;
}

/** Return a cached answer for a semantically-similar prior query, or null. */
export async function getCachedResponse(query: string, config: EmbedConfig): Promise<string | null> {
  const rows = db.prepare("SELECT response, embedding, created_at FROM semantic_cache").all() as {
    response: string; embedding: string; created_at: number;
  }[];
  if (rows.length === 0) return null;
  const [queryVec] = await embed(config, [query]);
  if (!queryVec) return null;
  const now = Date.now();
  let best: { response: string; score: number } | null = null;
  for (const row of rows) {
    if (now - row.created_at > TTL_MS) continue;
    const score = cosine(queryVec, JSON.parse(row.embedding) as number[]);
    if (!best || score > best.score) best = { response: row.response, score };
  }
  return best && best.score >= SIMILARITY_THRESHOLD ? best.response : null;
}

/** Embed + store a query/response pair for future reuse. */
export async function saveCachedResponse(query: string, response: string, config: EmbedConfig): Promise<void> {
  if (!response.trim()) return;
  const [vec] = await embed(config, [query]);
  if (!vec) return;
  db.prepare(
    "INSERT INTO semantic_cache (id, query, response, embedding, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), query, response, JSON.stringify(vec), Date.now());
}
