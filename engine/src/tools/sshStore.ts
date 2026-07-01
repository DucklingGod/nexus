// SSH host store (Task — remote device control). Connection info for remote
// hosts the agent can reach over SSH (e.g. machines on a Tailscale mesh).
//
// Auth model: SSH key FILE path. The private key itself never enters the app —
// `ssh -i <path>` reads it directly from disk (OS-protected). The stored
// key_path is just a filesystem location, not a secret, so it lives in SQLite
// like the rest of the non-secret config (provider/model/kanban/etc.).
// If key_path is empty, ssh falls back to the default ssh config / agent.

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
  CREATE TABLE IF NOT EXISTS ssh_hosts (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    host       TEXT NOT NULL,
    user       TEXT NOT NULL,
    port       INTEGER NOT NULL DEFAULT 22,
    key_path   TEXT,
    created_at INTEGER NOT NULL
  );
`);

export interface SshHost {
  id: string;
  name: string;
  host: string;
  user: string;
  port: number;
  key_path: string | null;
  created_at: number;
}

export interface SshHostInput {
  name: string;
  host: string;
  user: string;
  port?: number;
  key_path?: string;
}

interface SshHostRow {
  id: string; name: string; host: string; user: string;
  port: number; key_path: string | null; created_at: number;
}

function rowToHost(r: SshHostRow): SshHost {
  return {
    id: r.id, name: r.name, host: r.host, user: r.user,
    port: r.port, key_path: r.key_path, created_at: r.created_at,
  };
}

export function addHost(input: SshHostInput): SshHost {
  const id = `ssh-${randomUUID().slice(0, 8)}`;
  const host: SshHost = {
    id,
    name: input.name.trim(),
    host: input.host.trim(),
    user: input.user.trim(),
    port: input.port ?? 22,
    key_path: input.key_path?.trim() || null,
    created_at: Date.now(),
  };
  db.prepare(
    "INSERT INTO ssh_hosts (id, name, host, user, port, key_path, created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(host.id, host.name, host.host, host.user, host.port, host.key_path, host.created_at);
  return host;
}

export function listHosts(): SshHost[] {
  const rows = db
    .prepare("SELECT id, name, host, user, port, key_path, created_at FROM ssh_hosts ORDER BY created_at DESC")
    .all() as SshHostRow[];
  return rows.map(rowToHost);
}

export function getHost(id: string): SshHost | null {
  const row = db
    .prepare("SELECT id, name, host, user, port, key_path, created_at FROM ssh_hosts WHERE id = ?")
    .get(id) as SshHostRow | undefined;
  return row ? rowToHost(row) : null;
}

/** Resolve a host by id OR by name (case-insensitive) — handy for the agent. */
export function findHost(ref: string): SshHost | null {
  const byId = getHost(ref);
  if (byId) return byId;
  const row = db
    .prepare("SELECT id, name, host, user, port, key_path, created_at FROM ssh_hosts WHERE lower(name) = lower(?)")
    .get(ref.trim()) as SshHostRow | undefined;
  return row ? rowToHost(row) : null;
}

export function updateHost(id: string, input: Partial<SshHostInput>): boolean {
  const existing = getHost(id);
  if (!existing) return false;
  const merged = {
    name: input.name?.trim() ?? existing.name,
    host: input.host?.trim() ?? existing.host,
    user: input.user?.trim() ?? existing.user,
    port: input.port ?? existing.port,
    key_path: input.key_path !== undefined ? (input.key_path.trim() || null) : existing.key_path,
  };
  db.prepare(
    "UPDATE ssh_hosts SET name = ?, host = ?, user = ?, port = ?, key_path = ? WHERE id = ?",
  ).run(merged.name, merged.host, merged.user, merged.port, merged.key_path, id);
  return true;
}

export function deleteHost(id: string): void {
  db.prepare("DELETE FROM ssh_hosts WHERE id = ?").run(id);
}
