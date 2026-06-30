// Export / import an agent config (Task 39, v0.8). Bundles personality, behavior
// settings, custom skills, and context files into a portable JSON file.
// Excludes the provider selection (user infrastructure) and never includes API
// keys (those live in the OS keychain, not in settings) — so a shared agent is safe.

import { writeFileSync, readFileSync } from "node:fs";
import { getAllSettings, setSetting, getAgentPersonality, setAgentPersonality } from "../db/settings.ts";
import { listSkillsWithState, addCustomSkill } from "../skills/skills.ts";
import { listContextFiles, setContextFile } from "../context/files.ts";

// Provider selection is the user's own infrastructure — don't carry it across.
const EXCLUDE = new Set(["provider", "model", "provider.baseUrl"]);

interface AgentBundle {
  version: number;
  exportedAt: number;
  personality: { name: string; role: string; tone: string; language: string; instructions: string };
  settings: Record<string, string>;
  skills: { name: string; category: string; description: string; triggers: string[]; instructions: string }[];
  context: { name: string; content: string }[];
}

export function exportAgent(path: string): { ok: boolean; path: string } {
  const settings = Object.fromEntries(Object.entries(getAllSettings()).filter(([k]) => !EXCLUDE.has(k)));
  const skills = listSkillsWithState()
    .filter((s) => s.source === "custom")
    .map((s) => ({ name: s.name, category: s.category, description: s.description, triggers: s.triggers, instructions: s.instructions }));
  const context = listContextFiles().map((f) => ({ name: f.name, content: f.content }));
  const bundle: AgentBundle = { version: 1, exportedAt: Date.now(), personality: getAgentPersonality(), settings, skills, context };
  writeFileSync(path, JSON.stringify(bundle, null, 2), "utf8");
  return { ok: true, path };
}

export function importAgent(path: string): { ok: boolean; skills: number } {
  const data = JSON.parse(readFileSync(path, "utf8")) as Partial<AgentBundle>;
  if (data.personality) setAgentPersonality(data.personality);
  if (data.settings) {
    for (const [k, v] of Object.entries(data.settings)) {
      if (!EXCLUDE.has(k) && typeof v === "string") setSetting(k, v);
    }
  }
  let skills = 0;
  if (Array.isArray(data.skills)) {
    const existing = new Set(listSkillsWithState().map((s) => s.name.toLowerCase()));
    for (const s of data.skills) {
      if (s?.name && !existing.has(s.name.toLowerCase())) {
        addCustomSkill({ name: s.name, category: s.category, description: s.description, triggers: s.triggers ?? [], instructions: s.instructions });
        skills++;
      }
    }
  }
  if (Array.isArray(data.context)) {
    for (const c of data.context) {
      if (c?.name) setContextFile(c.name, c.content ?? "");
    }
  }
  return { ok: true, skills };
}
