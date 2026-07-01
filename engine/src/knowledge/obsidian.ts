// Obsidian connector (Task 52). Indexes Obsidian vaults into the RAG store
// with Obsidian-aware parsing: YAML frontmatter is stripped (not embedded),
// inline + frontmatter tags are captured, and [[wikilinks]] are resolved into
// "Linked notes" context appended to each chunk so the embedding captures the
// note's graph neighborhood (the minimal version of "connected notes score
// higher"). Reuses chunkText + addDocument + the lazy-embed pipeline.
//
// Vaults are stored in settings (obsidian.vaults) like the local-file folders
// connector; chunks are tagged source_type = "obsidian" so Unified Search can
// badge them.

import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { getSetting, setSetting } from "../db/settings.ts";
import { addDocument, deleteDocument } from "./documents.ts";

// --- Vault config (mirrors knowledge.folders) ---

function getVaults(): string[] {
  try { return JSON.parse(getSetting("obsidian.vaults") || "[]") as string[]; } catch { return []; }
}
function setVaults(v: string[]): void { setSetting("obsidian.vaults", JSON.stringify(v)); }

type IndexMap = Record<string, { mtime: number; docId: string }>;
function getIndex(): IndexMap {
  try { return JSON.parse(getSetting("obsidian.indexedFiles") || "{}") as IndexMap; } catch { return {}; }
}
function setIndex(i: IndexMap): void { setSetting("obsidian.indexedFiles", JSON.stringify(i)); }

export function listVaults(): string[] { return getVaults(); }

export function addVault(path: string): void {
  const v = getVaults();
  if (path && !v.includes(path)) { v.push(path); setVaults(v); }
}

export function removeVault(path: string): void {
  setVaults(getVaults().filter((p) => p !== path));
}

// --- Markdown parsing (frontmatter, tags, wikilinks) ---

/** Strip a leading YAML frontmatter block; return {body, frontmatter raw}. */
function splitFrontmatter(md: string): { body: string; frontmatter: string } {
  if (!md.startsWith("---")) return { body: md, frontmatter: "" };
  const end = md.indexOf("\n---", 3);
  if (end === -1) return { body: md, frontmatter: "" };
  const frontmatter = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\s*\n/, "");
  return { body, frontmatter };
}

/** Extract tags from YAML frontmatter `tags:` lines + inline #tags in the body. */
function extractTags(frontmatter: string, body: string): string[] {
  const tags = new Set<string>();
  // frontmatter: `tags: [a, b]` or `tags:\n  - a\n  - b`
  const fmMatch = frontmatter.match(/^tags?:\s*(.+)$/m);
  if (fmMatch) {
    const raw = fmMatch[1];
    const list = raw.startsWith("[")
      ? raw.replace(/[\[\]]/g, "").split(",").map(s => s.trim().replace(/^["']|["']$/g, ""))
      : raw.split(/[,\s]+/);
    for (const t of list) if (t && !t.startsWith("#")) tags.add(t.toLowerCase());
  }
  const fmBlock = frontmatter.match(/^tags?:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (fmBlock) for (const line of fmBlock[1].split("\n")) {
    const m = line.match(/^\s+-\s+(.+)/); if (m) tags.add(m[1].trim().toLowerCase().replace(/^["']|["']$/g, ""));
  }
  // inline #tags (word-ish, not part of a URL or heading)
  for (const m of body.matchAll(/(?:^|\s)#([a-z0-9][a-z0-9/_-]*)/gi)) tags.add(m[1].toLowerCase());
  return [...tags];
}

/** Extract [[wikilink]] targets (note names, optional alias). */
function extractWikilinks(body: string): string[] {
  const links = new Set<string>();
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    links.add(m[1].trim());
  }
  return [...links];
}

// --- Walk: collect .md files + build a vault-wide note-name index ---

function walkMd(dir: string, depth = 0): string[] {
  if (depth > 8 || !existsSync(dir)) return [];
  const out: string[] = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if ([".obsidian", "node_modules", ".trash"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p, depth + 1));
    else if (e.name.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

/** Map of lowercase note basename → list of full paths (for wikilink resolution). */
function buildNoteIndex(files: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of files) {
    const name = basename(f, ".md").toLowerCase();
    if (!m.has(name)) m.set(name, []);
    m.get(name)!.push(f);
  }
  return m;
}

// --- Sync ---

/** Index new/changed notes across all vaults. Reuses chunkText + addDocument. */
export function syncVaults(): { indexed: number; total: number } {
  const index = getIndex();
  let indexed = 0, total = 0;
  for (const vault of getVaults()) {
    if (!existsSync(vault)) continue;
    const files = walkMd(vault);
    const noteIndex = buildNoteIndex(files); // for wikilink resolution
    for (const file of files) {
      total++;
      let mtime = 0;
      try { mtime = statSync(file).mtimeMs; } catch { continue; }
      const prev = index[file];
      if (prev && prev.mtime === mtime) continue; // unchanged
      if (prev?.docId) { try { deleteDocument(prev.docId); } catch { /* gone */ } }
      try {
        const raw = readFileSync(file, "utf-8");
        const { body, frontmatter } = splitFrontmatter(raw);
        const tags = extractTags(frontmatter, body);
        const links = extractWikilinks(body);
        const noteName = basename(file, ".md");
        // Resolve wikilinks to notes that actually exist in this vault.
        const resolved = links.filter(l => noteIndex.has(l.toLowerCase()) && l.toLowerCase() !== noteName.toLowerCase());
        const rel = relative(vault, file);
        // Prepend provenance + append graph context so the embedding captures it.
        const header = `# ${noteName}${tags.length ? ` (tags: ${tags.join(", ")})` : ""}\nPath: ${rel}\n\n`;
        const graphCtx = resolved.length ? `\n\nLinked notes: ${resolved.map(l => `[[${l}]]`).join(", ")}` : "";
        const text = header + body + graphCtx;
        const r = addDocument(noteName, `obsidian:${rel}`, text, "obsidian");
        index[file] = { mtime, docId: r.id };
        indexed++;
      } catch { /* skip unreadable */ }
    }
  }
  setIndex(index);
  return { indexed, total };
}
