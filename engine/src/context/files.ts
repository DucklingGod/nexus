// Persistent context files (Task 37C). A transparent .md memory layer injected
// into the system prompt every turn — and the agent now maintains it itself (the
// `remember` tool + automatic extraction). Most users only chat, so the agent
// grows these files; the user can still view/edit them in Settings → Context.
//
// Priority (most authoritative first): rules > soul > user > memory > context.

import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import type { ChatMessage } from "../providers/types.ts";

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
const CTX_DIR = join(DATA_DIR, "context");
mkdirSync(CTX_DIR, { recursive: true });

const FILES = ["rules", "soul", "user", "memory", "context"] as const;
type CtxName = (typeof FILES)[number];

const TITLES: Record<CtxName, string> = {
  rules: "Rules",
  soul: "Soul (persona)",
  user: "About the user",
  memory: "Memory",
  context: "Context",
};

// Seed/framework shown when a file is empty — guides both the user and the agent
// on what belongs in each file. Comments (<!-- -->) are stripped before the file
// is injected into a chat, so an untouched seed costs zero tokens.
const SEEDS: Record<CtxName, string> = {
  rules: `# Rules
<!-- Standing instructions the agent must always follow. One rule per line. The agent reads these before every reply.
Good rules:
  - Always reply in Thai.
  - Never use emoji in code comments.
  - Prefer functional programming patterns.
  - Ask before making destructive changes.
Write rules using the 'remember' tool with file='rules'. Remove outdated rules. -->`,
  soul: `# Soul
<!-- The agent's persona: name, personality, voice, and values. This shapes HOW the agent communicates.
Write 2-4 sentences covering:
  - Name and identity (e.g. "I am Alice, a friendly and direct AI assistant.")
  - Communication style (e.g. "I speak casually but get straight to the point.")
  - Values (e.g. "I value honesty — I admit when I don't know something.")
Write soul notes using the 'remember' tool with file='soul'. -->`,
  user: `# About the user
<!-- Durable facts about the user: name, role, preferences, goals, tech stack, timezone, language.
Good entries:
  - Name: Somchai
  - Role: Full-stack developer at a startup
  - Prefers concise responses, dislikes verbose explanations
  - Uses TypeScript + React + Tauri
  - Bangkok timezone (UTC+7)
Write user facts using the 'remember' tool with file='user'. -->`,
  memory: `# Memory
<!-- Durable facts, decisions, and project context worth keeping across conversations.
Good entries:
  - Project "Nexus" is at github.com/DucklingGod/nexus, branch nexus
  - Decided to use Vite instead of Next.js for the landing page
  - Vercel deploys from nexus/ subdirectory
  - Claude handles engine code, Alice handles UI/branding
Write memory notes using the 'remember' tool with file='memory'. -->`,
  context: `# Current context
<!-- What we're working on right now. This is ephemeral — update it as tasks change.
Good entries:
  - Working on v0.7: adding persistent context files and auto-extraction
  - Current blocker: Vercel build failing due to Next.js detection
  - Next step: implement background memory extraction
Write context notes using the 'remember' tool with file='context'. -->`,
};

function read(name: CtxName): string {
  const p = join(CTX_DIR, `${name}.md`);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export function listContextFiles(): { name: string; title: string; content: string }[] {
  return FILES.map((name) => ({ name, title: TITLES[name], content: read(name) || SEEDS[name] }));
}

export function setContextFile(name: string, content: string): void {
  if (!(FILES as readonly string[]).includes(name)) return;
  writeFileSync(join(CTX_DIR, `${name}.md`), content, "utf8");
}

/** Append a note (deduped) to any context file, starting from its seed if empty. */
export function appendContextFile(name: string, text: string): boolean {
  if (!(FILES as readonly string[]).includes(name)) return false;
  const note = text.trim();
  if (!note) return false;
  const existing = read(name as CtxName) || SEEDS[name as CtxName];
  if (existing.includes(note)) return true; // already remembered
  writeFileSync(join(CTX_DIR, `${name}.md`), `${existing.trimEnd()}\n- ${note}\n`, "utf8");
  return true;
}

/** Replace oldText with newText in a context file (fuzzy match). */
export function replaceContextFile(name: string, oldText: string, newText: string): boolean {
  if (!(FILES as readonly string[]).includes(name)) return false;
  const existing = read(name as CtxName);
  if (!existing) return false;
  const old = oldText.trim();
  if (!old || !existing.includes(old)) return false;
  const updated = existing.replace(old, newText.trim());
  writeFileSync(join(CTX_DIR, `${name}.md`), updated, "utf8");
  return true;
}

/** Remove oldText from a context file. */
export function removeFromContextFile(name: string, oldText: string): boolean {
  if (!(FILES as readonly string[]).includes(name)) return false;
  const existing = read(name as CtxName);
  if (!existing) return false;
  const old = oldText.trim();
  if (!old || !existing.includes(old)) return false;
  // Remove the line containing oldText (including the "- " prefix and newline)
  const updated = existing.replace(new RegExp(`(?:^|\\n)- ${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?`, "g"), "\n");
  writeFileSync(join(CTX_DIR, `${name}.md`), updated.trimEnd() + "\n", "utf8");
  return true;
}

/** Get current char count for a file (used by agent to check space). */
export function getContextFileStats(): { name: string; chars: number; limit: number }[] {
  return FILES.map(name => ({ name, chars: read(name).length, limit: 8000 }));
}

/** Strip guidance comments → substantive text (empty if the file is just a seed). */
function meaningful(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** Check if the user has been onboarded (user.md has real content beyond the seed). */
export function isUserOnboarded(): boolean {
  return !!meaningful(read("user"));
}

function buildContextPrompt(): string {
  const parts: string[] = [];
  for (const name of FILES) {
    const m = meaningful(read(name));
    const body = m.replace(/^#.*$/gm, "").trim(); // anything beyond the heading?
    if (m && body) parts.push(m);
  }
  return parts.length ? `# Your persistent context\n${parts.join("\n\n")}` : "";
}

export function injectContext(messages: ChatMessage[]): ChatMessage[] {
  const ctx = buildContextPrompt();
  if (!ctx) return messages;
  const out = [...messages];
  const i = out.findIndex((m) => m.role === "system");
  if (i >= 0) out[i] = { ...out[i], content: `${ctx}\n\n${out[i].content}` };
  else out.unshift({ role: "system", content: ctx });
  return out;
}
