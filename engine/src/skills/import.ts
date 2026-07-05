// Hermes / agentskills.io skill import (Task 37B + 56). Scans a folder for
// SKILL.md files (the open Agent Skills format: YAML frontmatter with name +
// description, then a markdown body of instructions) and imports them as Nexus
// custom skills. Also discovers + installs skills from GitHub, bundling each
// skill's scripts/ references/ assets/ resources locally so the agent can load
// them on demand (the standard's progressive-disclosure model). GitHub calls use
// an optional token (brokered from the keychain) to raise rate limits.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { addCustomSkill, listSkills } from "./skills.ts";

interface ParsedSkill { name: string; description: string; instructions: string }

function parseSkillMd(text: string): ParsedSkill | null {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const fm = m ? m[1] : "";
  const body = m ? m[2] : text;
  const name = (fm.match(/^name:\s*(.+)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
  const description = (fm.match(/^description:\s*(.+)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
  if (!name) return null;
  return { name, description, instructions: body.trim().slice(0, 4000) };
}

function findSkillFiles(dir: string, depth = 0): string[] {
  if (depth > 4 || !existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSkillFiles(p, depth + 1));
    else if (/^skill\.md$/i.test(entry.name)) out.push(p);
  }
  return out;
}

const STOP = new Set(["this", "that", "with", "when", "your", "from", "into", "skill", "using", "used", "help", "helps", "should", "will", "what", "which", "make", "create", "user", "agent"]);

function triggersFrom(name: string, description: string): string[] {
  const words = `${name} ${description}`.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, 8);
}

/** Scan `dir` (default: local Hermes skills) for SKILL.md and import new ones. */
export function importSkills(dir?: string): { imported: number; scanned: number; dir: string } {
  const base = dir || join(process.env.LOCALAPPDATA ?? process.env.HOME ?? ".", "hermes", "skills");
  const files = findSkillFiles(base);
  const existing = new Set(listSkills().map((s) => s.name.toLowerCase()));
  let imported = 0;
  for (const f of files) {
    try {
      const parsed = parseSkillMd(readFileSync(f, "utf8"));
      if (!parsed || existing.has(parsed.name.toLowerCase())) continue;
      addCustomSkill({
        name: parsed.name,
        category: "Imported",
        description: parsed.description || parsed.name,
        triggers: triggersFrom(parsed.name, parsed.description),
        instructions: parsed.instructions,
      });
      existing.add(parsed.name.toLowerCase());
      imported++;
    } catch {
      /* skip unreadable / malformed file */
    }
  }
  return { imported, scanned: files.length, dir: base };
}

// ── GitHub token brokering ──────────────────────────────────────────────────
// A token (classic, no scopes needed for public search) raises GitHub's rate
// limits (search 10→30/min, core 60→5000/hr). Brokered from the keychain by
// Rust and passed per call/stashed — it never lives in the WebView or settings.

let githubToken = "";
export function setGithubToken(token: string | undefined): void { githubToken = token ?? ""; }

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": "Nexus", Accept: "application/vnd.github+json" };
  const t = token || githubToken;
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

interface GhTreeEntry { type: string; path: string; size?: number }

// Where a skill's bundled resources (scripts/references/assets) are saved.
function skillBundleDir(name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "skill";
  return join(homedir(), ".nexus", "skills", safe);
}

const RESOURCE_RE = /^(scripts|references|assets)\//i;
const MAX_BUNDLE_FILES = 40;
const MAX_BUNDLE_BYTES = 1_000_000;

/**
 * Download a skill's bundled resources (scripts/ references/ assets/ under its
 * directory) into a local folder so the agent can load them on demand via
 * file_read. Returns a note listing them, to append to the skill instructions.
 */
async function bundleSkillResources(
  owner: string, repo: string, branch: string, skillDir: string,
  entries: GhTreeEntry[], skillName: string, token?: string,
): Promise<string> {
  const prefix = skillDir ? `${skillDir}/` : "";
  const files = entries
    .filter((t) => t.type === "blob" && t.path.startsWith(prefix) && RESOURCE_RE.test(t.path.slice(prefix.length)) && (t.size ?? 0) <= MAX_BUNDLE_BYTES)
    .slice(0, MAX_BUNDLE_FILES);
  if (files.length === 0) return "";
  const base = skillBundleDir(skillName);
  const saved: string[] = [];
  for (const f of files) {
    try {
      const rel = f.path.slice(prefix.length);
      const dest = join(base, rel);
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`, { headers: ghHeaders(token) });
      const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      saved.push(rel);
    } catch {
      /* skip a bad resource file */
    }
  }
  if (saved.length === 0) return "";
  return `\n\n---\nBundled resources for this skill are installed locally in:\n${base}\nFiles: ${saved.join(", ")}\nUse the file_read tool to load any of them when the task needs it.`;
}

/** Download + install skills from a public GitHub repo (finds every SKILL.md). */
export async function importSkillsFromGithub(url: string, token?: string): Promise<{ imported: number; scanned: number; repo: string }> {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) throw new Error("Not a GitHub repository URL");
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");

  const info = (await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders(token) }).then((r) => r.json())) as { default_branch?: string };
  if (!info.default_branch) throw new Error(`Repo not found or GitHub rate-limited: ${owner}/${repo}`);
  const branch = info.default_branch;

  const tree = (await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers: ghHeaders(token) }).then((r) => r.json())) as { tree?: GhTreeEntry[] };
  const entries = tree.tree ?? [];
  const paths = entries.filter((t) => t.type === "blob" && /(^|\/)skill\.md$/i.test(t.path)).map((t) => t.path);

  const existing = new Set(listSkills().map((s) => s.name.toLowerCase()));
  let imported = 0;
  for (const p of paths) {
    try {
      const text = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`, { headers: ghHeaders(token) }).then((r) => r.text());
      const parsed = parseSkillMd(text);
      if (!parsed || existing.has(parsed.name.toLowerCase())) continue;
      const skillDir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      const bundleNote = await bundleSkillResources(owner, repo, branch, skillDir, entries, parsed.name, token);
      addCustomSkill({
        name: parsed.name,
        category: "Imported",
        description: parsed.description || parsed.name,
        triggers: triggersFrom(parsed.name, parsed.description),
        instructions: parsed.instructions + bundleNote,
      });
      existing.add(parsed.name.toLowerCase());
      imported++;
    } catch {
      /* skip bad file */
    }
  }
  return { imported, scanned: paths.length, repo: `${owner}/${repo}` };
}

interface SkillRepo { fullName: string; description: string; stars: number; url: string }

/**
 * Discover agent-skill repositories on GitHub for the agentskills.io open
 * standard (the `agent-skills` topic). Returns repos ranked by stars; each can
 * be installed via importSkillsFromGithub, which recursively grabs every
 * SKILL.md — so installing one collection repo can pull in many skills. This is
 * how Nexus absorbs the wider open-standard ecosystem instead of rebuilding it.
 */
export async function searchSkillRepos(query?: string, token?: string): Promise<{ repos: SkillRepo[] }> {
  const q = query && query.trim() ? `${query.trim()} topic:agent-skills` : "topic:agent-skills";
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`;
  const res = (await fetch(url, { headers: ghHeaders(token) }).then((r) => r.json())) as {
    items?: Array<{ full_name: string; description: string | null; stargazers_count: number; html_url: string }>;
    message?: string;
  };
  if (!res.items) throw new Error(res.message || "GitHub search failed or rate-limited");
  return {
    repos: res.items.map((i) => ({
      fullName: i.full_name,
      description: i.description ?? "",
      stars: i.stargazers_count ?? 0,
      url: i.html_url,
    })),
  };
}
