// Self-improvement — Prompt Optimizer (Task 61). A lean, DSPy/GEPA-flavored
// loop: reflect on recent negative-feedback experiences, propose improved
// agent-instruction candidates, judge each candidate (including the current
// instructions as a baseline) against those same failures, and surface the
// best candidate as a proposal — never applied automatically. The user
// reviews the diff and explicitly accepts or rejects (mirrors correction.ts's
// human-in-the-loop shape, but for the instructions prompt itself rather than
// a single situational rule).
//
// Optimization target: the agent personality's free-text `instructions` field
// (db/settings.ts) — the one stored, user-editable prompt fragment that
// actually shapes behavior. (The rest of the system prompt is assembled at
// request time in the frontend and mixes in runtime values like the
// personality name/role, which isn't a sensible versioned optimization target.)

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ProviderConfig } from "../providers/types.ts";
import { chat } from "../providers/client.ts";
import { listExperiences, type Experience } from "./experience.ts";
import { getAgentPersonality, setAgentPersonality } from "../db/settings.ts";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS prompt_versions (
    id            TEXT PRIMARY KEY,
    target        TEXT NOT NULL,   -- e.g. "personality.instructions"
    previous_text TEXT NOT NULL,
    new_text      TEXT NOT NULL,
    reason        TEXT,            -- why this candidate won (judge's rationale)
    score         INTEGER,         -- judge score for new_text (0-100)
    baseline_score INTEGER,        -- judge score for previous_text, for comparison
    applied       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_prompt_versions_created ON prompt_versions(created_at DESC);
`);

export interface PromptVersion {
  id: string;
  target: string;
  previous_text: string;
  new_text: string;
  reason: string | null;
  score: number | null;
  baseline_score: number | null;
  applied: boolean;
  created_at: number;
}

interface PVRow {
  id: string; target: string; previous_text: string; new_text: string;
  reason: string | null; score: number | null; baseline_score: number | null;
  applied: number; created_at: number;
}
function rowToPV(r: PVRow): PromptVersion {
  return { ...r, applied: r.applied === 1 };
}

const TARGET = "personality.instructions";
const MIN_FAILURES = 3; // don't bother optimizing from noise

function parseJsonBlock<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { return null; }
}
function parseJsonArrayBlock(text: string): string[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch { return null; }
}

function formatFailures(failures: Experience[]): string {
  return failures
    .map((e, i) => `--- Failure ${i + 1} ---\nUser: ${e.input.slice(0, 400)}\nAgent: ${e.output.slice(0, 400)}`)
    .join("\n\n");
}

/** Pull the negative-signal experiences to reflect on: thumbs-down first, then
 *  logged failures, most recent first. */
function collectFailures(limit = 8): Experience[] {
  const recent = listExperiences(200);
  const downvoted = recent.filter((e) => e.feedback === "down");
  const failed = recent.filter((e) => e.feedback !== "down" && !e.success);
  return [...downvoted, ...failed].slice(0, limit);
}

async function proposeCandidates(config: ProviderConfig, model: string, current: string, failures: Experience[]): Promise<string[]> {
  const prompt =
    "You are improving an AI agent's instruction prompt using its own track record.\n\n" +
    `Current instructions:\n"""\n${current || "(none set)"}\n"""\n\n` +
    `Cases where the user was dissatisfied or the task failed:\n${formatFailures(failures)}\n\n` +
    "Propose 2-3 revised versions of the instructions that would help avoid these failure patterns, " +
    "while preserving anything in the current instructions that isn't implicated. Each candidate should " +
    "be a complete, standalone replacement for the instructions (not a diff or a patch note). " +
    'Reply with a JSON array of strings only, e.g. ["candidate 1 text", "candidate 2 text"].';
  const res = await chat(config, { messages: [{ role: "user", content: prompt }], model, maxTokens: 1200 });
  const candidates = parseJsonArrayBlock(res.content)?.filter((c) => c.trim().length > 0) ?? [];
  return candidates.slice(0, 3);
}

async function judgeCandidate(config: ProviderConfig, model: string, instructions: string, failures: Experience[]): Promise<{ score: number; reason: string }> {
  const prompt =
    "Judge how well the following agent instructions would have prevented the failures below, had the agent " +
    "been given these instructions at the time.\n\n" +
    `Instructions to judge:\n"""\n${instructions || "(none set)"}\n"""\n\n` +
    `Failures:\n${formatFailures(failures)}\n\n` +
    'Reply JSON only: {"score": 0-100, "reason": "one short sentence"}';
  const res = await chat(config, { messages: [{ role: "user", content: prompt }], model, maxTokens: 200 });
  const parsed = parseJsonBlock<{ score?: number; reason?: string }>(res.content);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed?.score) || 0)));
  return { score, reason: parsed?.reason ?? "" };
}

export interface OptimizeResult {
  ranAt: number;
  failureCount: number;
  proposal: PromptVersion | null;
  skippedReason?: string;
}

/**
 * Run one optimization pass: reflect on recent failures, propose candidates,
 * judge each (plus the current instructions as a baseline), and store the
 * best-scoring candidate as an unapplied proposal. Returns null proposal (with
 * a reason) when there isn't enough negative signal or no candidate beats the
 * baseline — optimizing from noise, or replacing a prompt that's already
 * fine, would just add churn.
 */
export async function runOptimization(config: ProviderConfig, model: string): Promise<OptimizeResult> {
  const failures = collectFailures();
  if (failures.length < MIN_FAILURES) {
    return { ranAt: Date.now(), failureCount: failures.length, proposal: null, skippedReason: `Only ${failures.length} negative-feedback example(s) logged — need at least ${MIN_FAILURES} to optimize from real signal.` };
  }

  const current = getAgentPersonality().instructions ?? "";
  const candidates = await proposeCandidates(config, model, current, failures);
  if (candidates.length === 0) {
    return { ranAt: Date.now(), failureCount: failures.length, proposal: null, skippedReason: "The model didn't propose any usable candidates." };
  }

  const baseline = await judgeCandidate(config, model, current, failures);
  const judged = await Promise.all(candidates.map((c) => judgeCandidate(config, model, c, failures)));
  let bestIdx = 0;
  for (let i = 1; i < judged.length; i++) if (judged[i].score > judged[bestIdx].score) bestIdx = i;
  const best = judged[bestIdx];

  if (best.score <= baseline.score) {
    return {
      ranAt: Date.now(), failureCount: failures.length, proposal: null,
      skippedReason: `Best candidate (${best.score}) didn't beat the current instructions (${baseline.score}) — no change proposed.`,
    };
  }

  const id = `pv-${randomUUID().slice(0, 8)}`;
  const row: PVRow = {
    id, target: TARGET, previous_text: current, new_text: candidates[bestIdx],
    reason: best.reason, score: best.score, baseline_score: baseline.score,
    applied: 0, created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO prompt_versions (id, target, previous_text, new_text, reason, score, baseline_score, applied, created_at)
     VALUES (@id, @target, @previous_text, @new_text, @reason, @score, @baseline_score, @applied, @created_at)`,
  ).run(row);

  return { ranAt: Date.now(), failureCount: failures.length, proposal: rowToPV(row) };
}

export function listPromptVersions(limit = 20): PromptVersion[] {
  const rows = db
    .prepare("SELECT * FROM prompt_versions ORDER BY created_at DESC LIMIT ?")
    .all(limit) as PVRow[];
  return rows.map(rowToPV);
}

/** Apply a proposed (or past) version's new_text as the live instructions. Also
 *  usable to revert: pass a version whose new_text is the text you want back. */
export function applyPromptVersion(id: string): PromptVersion | null {
  const row = db.prepare("SELECT * FROM prompt_versions WHERE id = ?").get(id) as PVRow | undefined;
  if (!row) return null;
  setAgentPersonality({ instructions: row.new_text });
  db.prepare("UPDATE prompt_versions SET applied = 1 WHERE id = ?").run(id);
  return rowToPV({ ...row, applied: 1 });
}
