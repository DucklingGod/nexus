import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

// ponytail: single DB file in app data dir, create if missing
// NEXUS_DATA_DIR is injected by the Rust core (Tauri app_data_dir); fall back
// for standalone runs / tests.
const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function deleteSetting(key: string): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ponytail: typed helpers for common settings
export function getProviderConfig(): { provider: string; model: string; baseUrl: string } | null {
  const provider = getSetting("provider");
  const model = getSetting("model");
  const baseUrl = getSetting("provider.baseUrl");
  if (!provider) return null;
  return { provider, model: model ?? "default", baseUrl: baseUrl ?? "" };
}

export function setProviderConfig(provider: string, model: string, baseUrl?: string | null): void {
  setSetting("provider", provider);
  setSetting("model", model);
  if (baseUrl) setSetting("provider.baseUrl", baseUrl);
}

export function getAgentPersonality(): { name: string; role: string; tone: string; language: string; instructions: string } {
  return {
    name: getSetting("agent.name") ?? "Nexus Agent",
    role: getSetting("agent.role") ?? "assistant",
    tone: getSetting("agent.tone") ?? "professional",
    language: getSetting("agent.language") ?? "en",
    instructions: getSetting("agent.instructions") ?? "",
  };
}

export function setAgentPersonality(config: { name?: string | null; role?: string | null; tone?: string | null; language?: string | null; instructions?: string | null }): void {
  // Use `!= null` guards so empty strings are valid (clearing a field persists).
  if (config.name != null) setSetting("agent.name", config.name);
  if (config.role != null) setSetting("agent.role", config.role);
  if (config.tone != null) setSetting("agent.tone", config.tone);
  if (config.language != null) setSetting("agent.language", config.language);
  if (config.instructions != null) setSetting("agent.instructions", config.instructions);
}
