// Trend Detector + Alert System (Task 66).
// After each evaluation, compute rolling averages of satisfaction scores
// to detect declining quality trends and consecutive-low alerts.

import { default as Database } from "better-sqlite3";
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
  CREATE TABLE IF NOT EXISTS evaluation_trends (
    id              TEXT PRIMARY KEY,
    direction       TEXT NOT NULL,       -- 'improving' | 'stable' | 'declining'
    delta_5v20      REAL NOT NULL,       -- rolling-5 avg minus rolling-20 avg
    consecutive_low INTEGER NOT NULL,    -- count of consecutive evaluations with satisfaction < 40
    alerted         INTEGER DEFAULT 0,   -- 1 if this trend was flagged as an alert
    created_at      INTEGER NOT NULL
  );
`);

export interface EvaluationTrend {
  id: string;
  direction: "improving" | "stable" | "declining";
  delta_5v20: number;
  consecutive_low: number;
  alerted: boolean;
  created_at: number;
}

interface TrendRow {
  id: string;
  direction: string;
  delta_5v20: number;
  consecutive_low: number;
  alerted: number;
  created_at: number;
}

function rowToTrend(row: TrendRow): EvaluationTrend {
  return {
    id: row.id,
    direction: row.direction as EvaluationTrend["direction"],
    delta_5v20: row.delta_5v20,
    consecutive_low: row.consecutive_low,
    alerted: row.alerted === 1,
    created_at: row.created_at,
  };
}

/**
 * Analyze recent evaluations to determine the quality trend.
 * Compares rolling-5 average vs rolling-20 average of satisfaction scores.
 * Also detects consecutive evaluations with satisfaction < 40.
 *
 * Returns the stored trend record, or null if fewer than 2 evaluations exist.
 */
export function checkTrend(): EvaluationTrend | null {
  // Fetch up to 20 most recent satisfaction scores (oldest first for rolling calc)
  const rows = db
    .prepare("SELECT satisfaction FROM evaluations ORDER BY created_at DESC LIMIT 20")
    .all() as { satisfaction: number }[];

  if (rows.length < 2) return null;

  // Reverse so index 0 is oldest
  const scores = rows.map((r) => r.satisfaction).reverse();

  // Rolling-5 average (most recent 5)
  const recent5 = scores.slice(-5);
  const avg5 = recent5.reduce((a, b) => a + b, 0) / recent5.length;

  // Rolling-20 average (all available, up to 20)
  const avg20 = scores.reduce((a, b) => a + b, 0) / scores.length;

  const delta = avg5 - avg20;

  // Direction thresholds
  let direction: EvaluationTrend["direction"];
  if (delta > 5) direction = "improving";
  else if (delta < -15) direction = "declining";
  else direction = "stable";

  // Consecutive low: count from most recent backwards where satisfaction < 40
  const recentScores = rows.map((r) => r.satisfaction); // most recent first
  let consecutiveLow = 0;
  for (const s of recentScores) {
    if (s < 40) consecutiveLow++;
    else break;
  }

  const alerted = direction === "declining" || consecutiveLow >= 3 ? 1 : 0;

  const id = `trend-${randomUUID().slice(0, 8)}`;
  const trend: EvaluationTrend = {
    id,
    direction,
    delta_5v20: Math.round(delta * 100) / 100,
    consecutive_low: consecutiveLow,
    alerted: alerted === 1,
    created_at: Date.now(),
  };

  db.prepare(
    "INSERT INTO evaluation_trends (id, direction, delta_5v20, consecutive_low, alerted, created_at) VALUES (?,?,?,?,?,?)",
  ).run(id, trend.direction, trend.delta_5v20, trend.consecutive_low, alerted, trend.created_at);

  return trend;
}

/** Get the most recent trend record. */
export function getLatestTrend(): EvaluationTrend | null {
  const row = db
    .prepare("SELECT id, direction, delta_5v20, consecutive_low, alerted, created_at FROM evaluation_trends ORDER BY created_at DESC LIMIT 1")
    .get() as TrendRow | undefined;
  return row ? rowToTrend(row) : null;
}

/** List trend history, most recent first. */
export function listTrends(limit = 20): EvaluationTrend[] {
  const rows = db
    .prepare("SELECT id, direction, delta_5v20, consecutive_low, alerted, created_at FROM evaluation_trends ORDER BY created_at DESC LIMIT ?")
    .all(limit) as TrendRow[];
  return rows.map(rowToTrend);
}
