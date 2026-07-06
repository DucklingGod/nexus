// Self-improvement — Adaptive Strategy Engine (Task 67). Analyzes accumulated
// feedback (corrections, experiences, evaluations) to build a strategy profile
// that captures behavioral preferences (verbosity, format, proactivity, tool
// preference). Strategy hints are injected into the system prompt so the agent
// adapts to the user's style over time.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../providers/types.ts";
import { getSetting } from "../db/settings.ts";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS strategy_profiles (
    id         TEXT PRIMARY KEY,
    category   TEXT NOT NULL,
    value      TEXT NOT NULL,
    confidence REAL NOT NULL,
    pinned     INTEGER NOT NULL DEFAULT 0,
    source     TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_strategy_category ON strategy_profiles(category);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_strategy_category_unique ON strategy_profiles(category);
`);

export interface StrategyProfile {
  id: string;
  category: string;
  value: string;
  confidence: number;
  pinned: boolean;
  source: string | null;
  created_at: number;
  updated_at: number;
}

interface StrategyRow {
  id: string; category: string; value: string; confidence: number;
  pinned: number; source: string | null; created_at: number; updated_at: number;
}

function rowToProfile(r: StrategyRow): StrategyProfile {
  return {
    id: r.id, category: r.category, value: r.value, confidence: r.confidence,
    pinned: r.pinned === 1, source: r.source, created_at: r.created_at, updated_at: r.updated_at,
  };
}

/** Get all current strategy profiles. */
export function getStrategyProfile(): StrategyProfile[] {
  const rows = db
    .prepare("SELECT id, category, value, confidence, pinned, source, created_at, updated_at FROM strategy_profiles ORDER BY confidence DESC")
    .all() as StrategyRow[];
  return rows.map(rowToProfile);
}

/** Pin a user override for a strategy category. */
export function setPinnedStrategy(category: string, value: string): void {
  const now = Date.now();
  const existing = db.prepare("SELECT id FROM strategy_profiles WHERE category = ? AND pinned = 1").get(category) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE strategy_profiles SET value = ?, updated_at = ? WHERE id = ?").run(value, now, existing.id);
  } else {
    const id = `strat-${randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO strategy_profiles (id, category, value, confidence, pinned, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(category) DO UPDATE SET value=excluded.value, confidence=1.0, pinned=1, source='user_pinned', updated_at=excluded.updated_at`,
    ).run(id, category, value, 1.0, 1, "user_pinned", now, now);
  }
}

/** Remove a user override for a strategy category. */
export function clearPinnedStrategy(category: string): boolean {
  const r = db.prepare("DELETE FROM strategy_profiles WHERE category = ? AND pinned = 1").run(category);
  return r.changes > 0;
}

// ---------------------------------------------------------------------------
// Analysis: scan corrections + experiences + evaluations to detect preferences
// ---------------------------------------------------------------------------

/** Scan correction rules for verbosity hints. */
function analyzeVerbosity(): { value: string; confidence: number } | null {
  const rows = db.prepare("SELECT rule FROM corrections").all() as { rule: string }[];
  if (rows.length === 0) return null;
  const concise = ["short", "brief", "concise", "fewer words", "less verbose", "keep it short", "too long", "shorter"];
  const detailed = ["more detail", "explain more", "elaborate", "be thorough", "expand", "more context", "too brief", "in depth"];
  let conciseScore = 0;
  let detailedScore = 0;
  for (const r of rows) {
    const lower = r.rule.toLowerCase();
    for (const kw of concise) { if (lower.includes(kw)) conciseScore++; }
    for (const kw of detailed) { if (lower.includes(kw)) detailedScore++; }
  }
  const total = conciseScore + detailedScore;
  if (total === 0) return null;
  const confidence = Math.min(1.0, total / 3); // 3+ mentions → max confidence
  if (conciseScore > detailedScore) return { value: "concise", confidence };
  if (detailedScore > conciseScore) return { value: "detailed", confidence };
  return null; // ambiguous
}

/** Analyze tool usage in experiences to determine format preference. */
function analyzeFormat(): { value: string; confidence: number } | null {
  const rows = db.prepare("SELECT tool_steps FROM experiences").all() as { tool_steps: string }[];
  if (rows.length === 0) return null;
  let totalSteps = 0;
  let codeSteps = 0; // terminal_execute + execute_code
  for (const r of rows) {
    let steps: { name: string }[] = [];
    try { steps = JSON.parse(r.tool_steps); } catch { continue; }
    for (const s of steps) {
      totalSteps++;
      if (s.name === "terminal_execute" || s.name === "execute_code") codeSteps++;
    }
  }
  if (totalSteps === 0) return null;
  const ratio = codeSteps / totalSteps;
  const confidence = Math.min(1.0, rows.length / 5); // 5+ experiences → max
  if (ratio > 0.7) return { value: "code", confidence };
  if (ratio < 0.3) return { value: "prose", confidence };
  return { value: "mixed", confidence };
}

/** Scan correction rules for proactivity hints. */
function analyzeProactivity(): { value: string; confidence: number } | null {
  const rows = db.prepare("SELECT rule FROM corrections").all() as { rule: string }[];
  if (rows.length === 0) return null;
  const askFirst = ["ask before", "ask first", "don't just", "confirm before", "permission", "don't act", "wait for"];
  const actFirst = ["just do it", "don't ask", "take action", "no need to ask", "go ahead", "do it directly", "be proactive"];
  let askScore = 0;
  let actScore = 0;
  for (const r of rows) {
    const lower = r.rule.toLowerCase();
    for (const kw of askFirst) { if (lower.includes(kw)) askScore++; }
    for (const kw of actFirst) { if (lower.includes(kw)) actScore++; }
  }
  const total = askScore + actScore;
  if (total === 0) return null;
  const confidence = Math.min(1.0, total / 3);
  if (askScore > actScore) return { value: "ask_first", confidence };
  if (actScore > askScore) return { value: "act_first", confidence };
  return null;
}

/** Analyze tool usage patterns for tool preference. */
function analyzeToolPreference(): { value: string; confidence: number } | null {
  const rows = db.prepare("SELECT tool_steps FROM experiences").all() as { tool_steps: string }[];
  if (rows.length === 0) return null;
  let terminal = 0;
  let file = 0;
  for (const r of rows) {
    let steps: { name: string }[] = [];
    try { steps = JSON.parse(r.tool_steps); } catch { continue; }
    for (const s of steps) {
      if (["terminal_execute", "execute_code"].includes(s.name)) terminal++;
      else if (["file_read", "file_write", "file_edit", "file_list", "file_delete"].includes(s.name)) file++;
    }
  }
  const total = terminal + file;
  if (total === 0) return null;
  const ratio = terminal / total;
  const confidence = Math.min(1.0, rows.length / 5);
  if (ratio > 0.65) return { value: "terminal_heavy", confidence };
  if (ratio < 0.35) return { value: "file_heavy", confidence };
  return { value: "balanced", confidence };
}

/** Run all analyzers and persist the results. Returns the updated profiles. */
export function analyzeStrategy(): StrategyProfile[] {
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO strategy_profiles (id, category, value, confidence, pinned, source, created_at, updated_at)
    VALUES (?,?,?,?,0,?,?,?)
    ON CONFLICT(category) DO UPDATE SET value=excluded.value, confidence=excluded.confidence, source=excluded.source, updated_at=excluded.updated_at
    WHERE strategy_profiles.pinned = 0
  `);
  const tx = db.transaction(() => {
    const analyzers = [
      { category: "verbosity", fn: analyzeVerbosity },
      { category: "format", fn: analyzeFormat },
      { category: "proactivity", fn: analyzeProactivity },
      { category: "tool_preference", fn: analyzeToolPreference },
    ];
    for (const { category, fn } of analyzers) {
      const result = fn();
      if (result) {
        upsert.run(`strat-${category}`, category, result.value, result.confidence, "auto", now, now);
      }
    }
  });
  tx();
  return getStrategyProfile();
}

// ---------------------------------------------------------------------------
// System prompt injection
// ---------------------------------------------------------------------------

/** Convert a strategy category + value into a human-readable hint. */
function formatHint(profile: StrategyProfile): string {
  const hints: Record<string, Record<string, string>> = {
    verbosity: {
      concise: "Keep responses concise — the user prefers brief, to-the-point answers.",
      detailed: "Provide thorough, detailed explanations — the user values depth over brevity.",
    },
    format: {
      code: "Prefer code-heavy solutions — use terminal/code tools liberally rather than explaining in prose.",
      prose: "Prefer prose explanations — the user values clear textual guidance over raw code.",
      mixed: "Balance code and prose — provide working code with explanatory context.",
    },
    proactivity: {
      ask_first: "Ask before taking action — the user prefers to approve changes before you make them.",
      act_first: "Be proactive — go ahead and take action directly rather than asking permission.",
    },
    tool_preference: {
      terminal_heavy: "Lean on terminal/shell tools — the user is comfortable with command-line workflows.",
      file_heavy: "Use file-based tools — the user prefers structured file operations.",
      balanced: "Mix tools as appropriate — no strong preference for terminal vs file tools.",
    },
  };
  return hints[profile.category]?.[profile.value] ?? `${profile.category}: ${profile.value}`;
}

/** Return top strategy hints as a formatted string block for system prompt injection. */
export function getStrategyHints(maxHints = 3): string {
  const profiles = getStrategyProfile();
  if (profiles.length === 0) return "";
  // Pinned strategies always come first, then by confidence
  const sorted = [...profiles].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.confidence - a.confidence;
  });
  const top = sorted.filter((p) => p.confidence >= 0.3 || p.pinned).slice(0, maxHints);
  if (top.length === 0) return "";
  return top.map((p) => `- ${formatHint(p)}`).join("\n");
}

/** Append strategy hints to the system message (pure, like injectCorrections). */
export function injectStrategy(messages: ChatMessage[]): ChatMessage[] {
  if (getSetting("strategy.enabled") === "false") return messages;
  try {
    const block = getStrategyHints();
    if (!block) return messages;
    const hint = "\n\n# Adaptive strategy (learned from feedback)\n" + block;
    const out = [...messages];
    const sysIdx = out.findIndex((m) => m.role === "system");
    if (sysIdx >= 0) out[sysIdx] = { ...out[sysIdx], content: out[sysIdx].content + hint };
    else out.unshift({ role: "system", content: hint.trimStart() });
    return out;
  } catch {
    return messages;
  }
}
