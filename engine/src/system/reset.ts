// Factory reset (Task 1). Wipes ALL agent data — conversations, knowledge,
// skills, memory, self-improvement, kanban, workflows, behavior settings, and
// the persistent .md context files — while PRESERVING:
//   • every api_key_* entry (those live in the OS keychain, which the engine
//     cannot touch and never calls secure_delete for),
//   • the provider / model / provider.baseUrl settings rows (so the user keeps
//     their provider choice and saved key after reset),
// and clears the `onboarded` flag so the app re-runs onboarding next launch.
//
// The engine owns its SQLite connection, so running DELETEs from here is safe
// (no external file deletion while WAL is open). Each table uses
// CREATE TABLE IF NOT EXISTS, so missing tables are simply ignored.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");

const CTX_DIR = join(DATA_DIR, "context");

/** Every agent-data table. CREATE IF NOT EXISTS guards a clean DB. */
const TABLES = [
  "messages",
  "conversations",
  "doc_chunks",
  "documents",
  "knowledge",
  "custom_skills",
  "ssh_hosts",
  "experiences",
  "corrections",
  "evaluations",
  "usage_records",
  "semantic_cache",
  "kanban_cards",
  "kanban_columns",
  "kanban_boards",
  "workflows",
];

/** Names of the 5 persistent context files to delete (they regrow from seeds). */
const CONTEXT_FILES = ["rules", "soul", "user", "memory", "context"];

export interface ResetResult {
  clearedTables: string[];
  wipedContextFiles: string[];
  preserved: string[];
}

/**
 * Wipe all agent data. Provider config + keychain keys are preserved by
 * construction (we never touch them). Returns a summary for the UI.
 */
export function resetAgentData(): ResetResult {
  const clearedTables: string[] = [];
  // Clear every agent-data table. try/catch per table so a missing table (fresh
  // DB) doesn't abort the whole reset. We deliberately do NOT CREATE tables here
  // — each module owns its schema and creates-on-init; reset only empties.
  for (const t of TABLES) {
    try {
      db.exec(`DELETE FROM ${t}`);
      clearedTables.push(t);
    } catch {
      // table doesn't exist yet (e.g. a feature never used) — nothing to clear.
    }
  }

  // Clear all settings EXCEPT the provider config rows (provider/model/baseUrl).
  // The onboarded flag is intentionally cleared → app re-runs onboarding.
  try {
    db.exec(`DELETE FROM settings WHERE key NOT IN ('provider','model','provider.baseUrl')`);
  } catch {
    // settings table may not exist yet — nothing to clear.
  }

  // Wipe the persistent .md context files (they regrow from seeds on next read).
  const wipedContextFiles: string[] = [];
  for (const name of CONTEXT_FILES) {
    try { rmSync(join(CTX_DIR, `${name}.md`)); wipedContextFiles.push(name); } catch { /* already absent */ }
  }

  return {
    clearedTables,
    wipedContextFiles,
    preserved: ["api_key_* (OS keychain)", "provider / model / provider.baseUrl settings"],
  };
}
