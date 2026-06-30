// ponytail: persistent token usage tracking in SQLite
// Records per-message usage with model/provider for cost analysis.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

// Create usage_records table
db.exec(`
  CREATE TABLE IF NOT EXISTS usage_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    message_id      TEXT,
    model           TEXT NOT NULL,
    provider        TEXT,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        REAL NOT NULL DEFAULT 0,
    cached_tokens   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_records(created_at);
  CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model);
`);

// Approximate pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Anthropic
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-sonnet": { input: 3, output: 15 },
  // DeepSeek
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-coder": { input: 0.14, output: 0.28 },
  // Google
  "gemini-1.5-pro": { input: 3.5, output: 10.5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  // xAI
  "grok-3": { input: 3, output: 15 },
  "grok-3-mini": { input: 0.3, output: 0.5 },
  // Xiaomi
  "mimo-v2.5-pro": { input: 0.5, output: 1.5 },
  // LM Studio / Local
  "lm-studio": { input: 0, output: 0 },
  "ollama": { input: 0, output: 0 },
};

function findPricing(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key.toLowerCase())) return pricing;
  }
  // Default fallback
  return { input: 1, output: 3 };
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = findPricing(model);
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export interface UsageRecord {
  conversation_id?: string;
  message_id?: string;
  model: string;
  provider?: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens?: number;
}

const insertStmt = db.prepare(`
  INSERT INTO usage_records (conversation_id, message_id, model, provider, input_tokens, output_tokens, cost_usd, cached_tokens)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function recordTokenUsage(record: UsageRecord): void {
  const cost = calculateCost(record.model, record.input_tokens, record.output_tokens);
  insertStmt.run(
    record.conversation_id ?? null,
    record.message_id ?? null,
    record.model,
    record.provider ?? null,
    record.input_tokens,
    record.output_tokens,
    cost,
    record.cached_tokens ?? 0,
  );
}

export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCostUsd: number;
  totalMessages: number;
  byDay: { date: string; input: number; output: number; cost: number; messages: number }[];
  byModel: { model: string; input: number; output: number; cost: number; messages: number }[];
}

export function getUsageStats(days: number = 30): UsageStats {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  // Totals
  const total = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as totalInput,
      COALESCE(SUM(output_tokens), 0) as totalOutput,
      COALESCE(SUM(cached_tokens), 0) as totalCached,
      COALESCE(SUM(cost_usd), 0) as totalCost,
      COUNT(*) as totalMessages
    FROM usage_records
    WHERE created_at >= ?
  `).get(sinceStr) as { totalInput: number; totalOutput: number; totalCached: number; totalCost: number; totalMessages: number };

  // By day
  const byDay = db.prepare(`
    SELECT
      date(created_at) as date,
      SUM(input_tokens) as input,
      SUM(output_tokens) as output,
      SUM(cost_usd) as cost,
      COUNT(*) as messages
    FROM usage_records
    WHERE created_at >= ?
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(sinceStr) as { date: string; input: number; output: number; cost: number; messages: number }[];

  // By model
  const byModel = db.prepare(`
    SELECT
      model,
      SUM(input_tokens) as input,
      SUM(output_tokens) as output,
      SUM(cost_usd) as cost,
      COUNT(*) as messages
    FROM usage_records
    WHERE created_at >= ?
    GROUP BY model
    ORDER BY cost DESC
  `).all(sinceStr) as { model: string; input: number; output: number; cost: number; messages: number }[];

  return {
    totalInputTokens: total.totalInput,
    totalOutputTokens: total.totalOutput,
    totalCachedTokens: total.totalCached,
    totalCostUsd: total.totalCost,
    totalMessages: total.totalMessages,
    byDay,
    byModel,
  };
}
