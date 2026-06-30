// Skills engine (procedural memory). Auto-picks the skills most relevant to a
// message via free keyword scoring, then injects their procedures into the
// system prompt — like RAG, but for "how to do the task".
//
// Skills come from two sources: the 60 built-ins (builtin.ts) and custom skills
// stored in SQLite — including ones the agent *synthesizes* from finished tasks
// (auto-skill creation). Per-skill enable/disable is a `skills.disabled` set.

import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ProviderConfig } from "../providers/types.ts";
import { getSetting, setSetting } from "../db/settings.ts";
import { chat } from "../providers/client.ts";
import { embed } from "../providers/embed.ts";

type EmbedConfig = { baseUrl: string; apiKey: string };
import { BUILTIN_SKILLS, type Skill } from "./builtin.ts";

export type { Skill };
export interface SkillState extends Skill {
  enabled: boolean;
  source: "builtin" | "custom";
  auto: boolean;
}

const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "nexus.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_skills (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    description  TEXT NOT NULL,
    triggers     TEXT NOT NULL,   -- JSON string[]
    instructions TEXT NOT NULL,
    auto         INTEGER NOT NULL DEFAULT 0,  -- 1 = agent-synthesized
    created_at   INTEGER NOT NULL
  );
`);

interface CustomRow {
  id: string; name: string; category: string; description: string;
  triggers: string; instructions: string; auto: number;
}

function customSkills(): (Skill & { auto: boolean })[] {
  const rows = db
    .prepare("SELECT id, name, category, description, triggers, instructions, auto FROM custom_skills ORDER BY created_at DESC")
    .all() as CustomRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    triggers: JSON.parse(r.triggers) as string[],
    instructions: r.instructions,
    auto: r.auto === 1,
  }));
}

export function addCustomSkill(s: {
  name: string; category?: string; description: string; triggers: string[]; instructions: string; auto?: boolean;
}): string {
  const id = `custom-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO custom_skills (id, name, category, description, triggers, instructions, auto, created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(id, s.name.trim(), (s.category || "Custom").trim(), s.description.trim(), JSON.stringify(s.triggers), s.instructions.trim(), s.auto ? 1 : 0, Date.now());
  return id;
}

export function deleteCustomSkill(id: string): void {
  db.prepare("DELETE FROM custom_skills WHERE id = ?").run(id);
}

function disabledIds(): Set<string> {
  try {
    return new Set(JSON.parse(getSetting("skills.disabled") || "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function setSkillEnabled(id: string, enabled: boolean): void {
  const d = disabledIds();
  if (enabled) d.delete(id);
  else d.add(id);
  setSetting("skills.disabled", JSON.stringify([...d]));
}

function allSkills(): (Skill & { auto: boolean })[] {
  return [...BUILTIN_SKILLS.map((s) => ({ ...s, auto: false })), ...customSkills()];
}

export function listSkills(): Skill[] {
  return allSkills();
}

/** Every skill plus its enabled/source/auto state — for the management UI. */
export function listSkillsWithState(): SkillState[] {
  const d = disabledIds();
  const customSet = new Set(customSkills().map((s) => s.id));
  return allSkills().map((s) => ({
    ...s,
    enabled: !d.has(s.id),
    source: customSet.has(s.id) ? "custom" : "builtin",
  }));
}

/** Pure keyword scoring over a given skill list (testable, no LLM). */
export function scoreSkills(query: string, skills: Skill[], limit = 2): Skill[] {
  const q = query.toLowerCase();
  if (!q.trim()) return [];
  const scored = skills.map((s) => {
    let score = 0;
    for (const t of s.triggers) if (q.includes(t)) score += 2;
    for (const w of s.name.toLowerCase().split(/\s+/)) {
      if (w.length > 3 && q.includes(w)) score += 1;
    }
    return { skill: s, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.skill);
}

/** Production matcher: enabled skills (built-in + custom) minus disabled. */
export function matchSkills(query: string, limit = 2): Skill[] {
  const d = disabledIds();
  return scoreSkills(query, allSkills().filter((s) => !d.has(s.id)), limit);
}

/** Append the matched skills' instructions to the system message (pure). */
export function injectSkills(messages: ChatMessage[], skills: Skill[]): ChatMessage[] {
  if (skills.length === 0) return messages;
  const block =
    "\n\n# Relevant skills for this task\nApply these procedures where they help:\n" +
    skills.map((s) => `\n## ${s.name}\n${s.instructions}`).join("\n");
  const out = [...messages];
  const sysIdx = out.findIndex((m) => m.role === "system");
  if (sysIdx >= 0) {
    out[sysIdx] = { ...out[sysIdx], content: out[sysIdx].content + block };
  } else {
    out.unshift({ role: "system", content: block.trimStart() });
  }
  return out;
}

// ── Auto-skill creation (Skill Synthesizer) ──────────────────────────────────

interface DraftSkill {
  name: string; category: string; description: string; triggers: string[]; instructions: string;
}

function parseSkillJson(text: string): DraftSkill | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1));
    if (o.skip === true) return null;
    if (!o.name || !o.instructions || !Array.isArray(o.triggers) || o.triggers.length === 0) return null;
    return {
      name: String(o.name).slice(0, 60),
      category: String(o.category || "Learned"),
      description: String(o.description || "").slice(0, 200),
      triggers: o.triggers.slice(0, 8).map((t: unknown) => String(t).toLowerCase()),
      instructions: String(o.instructions).slice(0, 800),
    };
  } catch {
    return null;
  }
}

/**
 * Ask the model to distill a reusable skill from a finished conversation. Saves
 * it as a custom `auto` skill (enabled, so it helps next time) and returns it, or
 * null if nothing generalizable. One LLM call — callers gate this behind a setting.
 */
export async function synthesizeSkill(
  config: ProviderConfig,
  messages: ChatMessage[],
  model: string,
): Promise<{ id: string; name: string } | null> {
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 6000);
  if (transcript.length < 200) return null; // too thin to generalize

  const prompt =
    "From the conversation below, extract ONE reusable skill the assistant could apply to " +
    "similar FUTURE tasks — only if there is a genuinely generalizable procedure worth saving " +
    "(not specific facts from this chat). Reply with JSON only, no prose:\n" +
    '{"name": "...", "category": "...", "description": "one line", "triggers": ["keyword", "phrase"], "instructions": "2-4 sentence procedure"}\n' +
    'If nothing is worth saving, reply exactly {"skip": true}.\n\nConversation:\n' +
    transcript;

  const res = await chat(config, { messages: [{ role: "user", content: prompt }], model, maxTokens: 400 });
  const draft = parseSkillJson(res.content);
  if (!draft) return null;

  if (isDuplicateSkill(draft)) return null;

  const id = addCustomSkill({ ...draft, auto: true });
  return { id, name: draft.name };
}

/** Skip near-duplicates: same normalized name, or heavy trigger overlap. */
function isDuplicateSkill(draft: DraftSkill): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const dn = norm(draft.name);
  const dt = new Set(draft.triggers.map((t) => t.toLowerCase()));
  for (const s of allSkills()) {
    if (norm(s.name) === dn) return true;
    if (dt.size > 0) {
      const overlap = s.triggers.filter((t) => dt.has(t.toLowerCase())).length;
      if (overlap / dt.size >= 0.6) return true;
    }
  }
  return false;
}

// ── Semantic matching (optional, opt-in via `skills.semantic`) ────────────────
// Complements keyword matching: catches skills the user phrases differently.
// Skill vectors are embedded once per session (batch); only the query is embedded
// per message. No-op on providers without an /embeddings endpoint.

const skillVecs = new Map<string, number[]>();
let vecModel = "";

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function ensureSkillVecs(config: EmbedConfig, skills: Skill[]): Promise<void> {
  const model = getSetting("model.embedding") ?? "text-embedding-3-small";
  if (model !== vecModel) { skillVecs.clear(); vecModel = model; }
  const missing = skills.filter((s) => !skillVecs.has(s.id));
  if (missing.length === 0) return;
  const text = (s: Skill) => `${s.name}. ${s.description}. ${s.triggers.join(", ")}`;
  const vecs = await embed(config, missing.map(text));
  missing.forEach((s, i) => { if (vecs[i]) skillVecs.set(s.id, vecs[i]); });
}

async function semanticMatch(query: string, config: EmbedConfig, candidates: Skill[], limit: number): Promise<Skill[]> {
  await ensureSkillVecs(config, candidates);
  const [qv] = await embed(config, [query]);
  if (!qv) return [];
  return candidates
    .map((s) => ({ s, score: skillVecs.has(s.id) ? cosine(qv, skillVecs.get(s.id)!) : 0 }))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/** Keyword matching, optionally topped up with semantic matches (opt-in). */
export async function matchSkillsAsync(query: string, config: EmbedConfig, limit = 2): Promise<Skill[]> {
  const keyword = matchSkills(query, limit);
  if (keyword.length >= limit || getSetting("skills.semantic") !== "true") return keyword;
  try {
    const d = disabledIds();
    const candidates = allSkills().filter((s) => !d.has(s.id));
    const sem = await semanticMatch(query, config, candidates, limit);
    const merged = [...keyword];
    for (const s of sem) {
      if (merged.length >= limit) break;
      if (!merged.some((m) => m.id === s.id)) merged.push(s);
    }
    return merged;
  } catch {
    return keyword;
  }
}
