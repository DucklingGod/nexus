// Knowledge base + RAG (Task 15). Ported from the old Next.js app
// (document-processor.ts + rag.ts): extract → chunk → (lazy) embed → cosine search.
//
// Design: ingestion stores chunk *text* only (no provider key needed). Embeddings
// are computed lazily the first time RAG runs inside a chat, where the provider
// key is already available — so no key brokering is required for uploads.
// Vector search uses in-JS cosine similarity over stored embeddings (the
// PLAN-sanctioned fallback to sqlite-vec; fine for single-user doc counts).

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    source     TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS doc_chunks (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    ordinal     INTEGER NOT NULL,
    text        TEXT NOT NULL,
    embedding   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON doc_chunks(document_id);
`);

// Migrations: add provenance columns for Unified Search (Task 53). Existing
// rows backfill to source_type 'local'. Both use try/catch (idempotent).
try { db.exec("ALTER TABLE documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE doc_chunks ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local'"); } catch { /* already exists */ }

// ~500-char chunks with 50-char overlap (ported).
export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }
  return chunks.filter((c) => c.trim().length > 0);
}

// Extract text from a file by extension (ported: PDF / DOCX / XLSX / plain).
export async function extractFile(path: string): Promise<string> {
  const lower = path.toLowerCase();
  const buffer = await readFile(path);
  if (lower.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    return (await parser.getText()).text;
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    return wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n");
  }
  return buffer.toString("utf-8"); // txt / md / json / etc.
}

export function addDocument(title: string, source: string, text: string, sourceType: string = "local"): { id: string; chunks: number } {
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare("INSERT INTO documents (id, title, source, source_type, created_at) VALUES (?,?,?,?,?)").run(
    id,
    title,
    source,
    sourceType,
    Date.now(),
  );
  const chunks = chunkText(text);
  const insert = db.prepare(
    "INSERT INTO doc_chunks (id, document_id, ordinal, text, embedding, source_type) VALUES (?,?,?,?,NULL,?)",
  );
  const tx = db.transaction((cs: string[]) => cs.forEach((c, i) => insert.run(`${id}-${i}`, id, i, c, sourceType)));
  tx(chunks);
  return { id, chunks: chunks.length };
}

export async function ingestFile(path: string, title?: string): Promise<{ id: string; chunks: number }> {
  const text = await extractFile(path);
  const name = title || path.split(/[\\/]/).pop() || "Document";
  return addDocument(name, path, text);
}

export function listDocuments(): { id: string; title: string; chunks: number; created_at: number }[] {
  return db
    .prepare(
      `SELECT d.id, d.title, d.created_at, COUNT(c.id) AS chunks
       FROM documents d LEFT JOIN doc_chunks c ON c.document_id = d.id
       GROUP BY d.id ORDER BY d.created_at DESC`,
    )
    .all() as { id: string; title: string; chunks: number; created_at: number }[];
}

export function deleteDocument(id: string): void {
  db.prepare("DELETE FROM doc_chunks WHERE document_id = ?").run(id);
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

function docCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Lazily embed any chunks still missing an embedding (batched).
async function ensureEmbeddings(config: EmbedConfig): Promise<void> {
  const rows = db
    .prepare("SELECT id, text FROM doc_chunks WHERE embedding IS NULL LIMIT 256")
    .all() as { id: string; text: string }[];
  if (rows.length === 0) return;
  const vecs = await embed(config, rows.map((r) => r.text));
  const upd = db.prepare("UPDATE doc_chunks SET embedding = ? WHERE id = ?");
  const tx = db.transaction((items: { id: string; vec: number[] }[]) => {
    for (const it of items) upd.run(JSON.stringify(it.vec), it.id);
  });
  tx(rows.map((r, i) => ({ id: r.id, vec: vecs[i] })).filter((x) => Array.isArray(x.vec)));
}

export async function searchContext(query: string, config: EmbedConfig, topK = 4): Promise<string[]> {
  if (docCount() === 0) return [];
  await ensureEmbeddings(config);
  const [qVec] = await embed(config, [query]);
  if (!qVec) return [];
  const rows = db
    .prepare("SELECT text, embedding FROM doc_chunks WHERE embedding IS NOT NULL")
    .all() as { text: string; embedding: string }[];
  return rows
    .map((r) => ({ text: r.text, score: cosine(qVec, JSON.parse(r.embedding) as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => r.text);
}

export interface DocumentSearchResult {
  docId: string;
  title: string;
  source: string | null;
  sourceType: string;
  text: string;
  score: number;
}

/**
 * Rich document search for Unified Search (Task 53): like searchContext but
 * returns provenance (title, source, sourceType) so results can be badged by
 * origin (Local file / Obsidian / manual). Cosine-ranked, lazy embeddings.
 */
export async function searchDocuments(query: string, config: EmbedConfig, topK = 6): Promise<DocumentSearchResult[]> {
  if (docCount() === 0) return [];
  await ensureEmbeddings(config);
  const [qVec] = await embed(config, [query]);
  if (!qVec) return [];
  const rows = db
    .prepare(`
      SELECT c.text, c.embedding, c.source_type, d.id AS doc_id, d.title, d.source
      FROM doc_chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.embedding IS NOT NULL
    `)
    .all() as { text: string; embedding: string; source_type: string; doc_id: string; title: string; source: string | null }[];
  return rows
    .map((r) => ({
      docId: r.doc_id,
      title: r.title,
      source: r.source,
      sourceType: r.source_type ?? "local",
      text: r.text,
      score: cosine(qVec, JSON.parse(r.embedding) as number[]),
    }))
    .filter((r) => r.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Inject retrieved document context as a system message (after the existing
// system prompt). Returns the original messages unchanged if there are no docs
// or anything fails — RAG must never break a chat.
export async function augmentWithContext(
  messages: ChatMessage[],
  config: EmbedConfig,
): Promise<ChatMessage[]> {
  if (docCount() === 0) return messages;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return messages;
  const chunks = await searchContext(lastUser.content, config);
  if (chunks.length === 0) return messages;
  const contextMsg: ChatMessage = {
    role: "system",
    content:
      "Relevant context from the user's documents (cite if used):\n\n" +
      chunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n"),
  };
  const idx = messages.findIndex((m) => m.role === "system");
  return idx === -1
    ? [contextMsg, ...messages]
    : [...messages.slice(0, idx + 1), contextMsg, ...messages.slice(idx + 1)];
}
