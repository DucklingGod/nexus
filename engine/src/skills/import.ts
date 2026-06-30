// Hermes skill import (Task 37B). Scans a folder for SKILL.md files (the
// Hermes/Claude Agent Skill format: YAML frontmatter with name + description,
// then a markdown body of instructions) and imports them as Nexus custom skills.
// Default location is the local Hermes skills dir; any folder can be picked.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
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

interface GhTreeEntry { type: string; path: string }

/** Download + install skills from a public GitHub repo (finds SKILL.md via the API). */
export async function importSkillsFromGithub(url: string): Promise<{ imported: number; scanned: number; repo: string }> {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) throw new Error("Not a GitHub repository URL");
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");
  const headers = { "User-Agent": "Nexus", Accept: "application/vnd.github+json" };

  const info = (await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }).then((r) => r.json())) as { default_branch?: string };
  if (!info.default_branch) throw new Error(`Repo not found or GitHub rate-limited: ${owner}/${repo}`);
  const branch = info.default_branch;

  const tree = (await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers }).then((r) => r.json())) as { tree?: GhTreeEntry[] };
  const paths = (tree.tree ?? []).filter((t) => t.type === "blob" && /(^|\/)skill\.md$/i.test(t.path)).map((t) => t.path);

  const existing = new Set(listSkills().map((s) => s.name.toLowerCase()));
  let imported = 0;
  for (const p of paths) {
    try {
      const text = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`).then((r) => r.text());
      const parsed = parseSkillMd(text);
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
      /* skip bad file */
    }
  }
  return { imported, scanned: paths.length, repo: `${owner}/${repo}` };
}
