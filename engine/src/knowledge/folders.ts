// Local file connector (v1.0 / Task 50). Watch folders → auto-index their files
// into the existing RAG store. Reuses ingestFile (extract → chunk → lazy-embed).
// "Sync" walks each folder and (re)indexes new/changed files, tracked by mtime.

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { getSetting, setSetting } from "../db/settings.ts";
import { ingestFile, deleteDocument } from "./documents.ts";

const SUPPORTED = new Set([".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md", ".json"]);

function getFolders(): string[] {
  try { return JSON.parse(getSetting("knowledge.folders") || "[]") as string[]; } catch { return []; }
}
function setFolders(f: string[]): void { setSetting("knowledge.folders", JSON.stringify(f)); }

type IndexMap = Record<string, { mtime: number; docId: string }>;
function getIndex(): IndexMap {
  try { return JSON.parse(getSetting("knowledge.indexedFiles") || "{}") as IndexMap; } catch { return {}; }
}
function setIndex(i: IndexMap): void { setSetting("knowledge.indexedFiles", JSON.stringify(i)); }

export function listFolders(): string[] { return getFolders(); }

export function addFolder(path: string): void {
  const f = getFolders();
  if (path && !f.includes(path)) { f.push(path); setFolders(f); }
}

export function removeFolder(path: string): void {
  setFolders(getFolders().filter((p) => p !== path));
}

function walk(dir: string, depth = 0): string[] {
  if (depth > 6 || !existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, depth + 1));
    else if (SUPPORTED.has(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

/** Index new/changed files across all watched folders. */
export async function syncFolders(): Promise<{ indexed: number; total: number }> {
  const index = getIndex();
  let indexed = 0, total = 0;
  for (const folder of getFolders()) {
    for (const file of walk(folder)) {
      total++;
      let mtime = 0;
      try { mtime = statSync(file).mtimeMs; } catch { continue; }
      const prev = index[file];
      if (prev && prev.mtime === mtime) continue; // unchanged
      if (prev?.docId) { try { deleteDocument(prev.docId); } catch { /* gone */ } }
      try {
        const r = await ingestFile(file, basename(file));
        index[file] = { mtime, docId: r.id };
        indexed++;
      } catch { /* skip unreadable / unsupported */ }
    }
  }
  setIndex(index);
  return { indexed, total };
}
