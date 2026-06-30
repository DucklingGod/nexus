// Agent tool: persistent memory layer (Hermes-style). Supports batch
// operations (add/replace/remove) across all five context files. The agent
// writes ALL files — including rules.md and soul.md — because most users
// interact only through chat and never edit .md files manually.

import { registerTool } from "./registry.ts";
import { appendContextFile, replaceContextFile, removeFromContextFile, getContextFileStats } from "../context/files.ts";

type Action = "add" | "replace" | "remove";
const VALID_TARGETS = ["rules", "soul", "user", "memory", "context"];
const MAX_CHARS = 8000;

interface Operation {
  action: Action;
  target?: string;
  content?: string;
  old_text?: string;
}

function validateTarget(t: unknown): string {
  const s = String(t || "memory").toLowerCase();
  return VALID_TARGETS.includes(s) ? s : "memory";
}

function runOp(op: Operation): string {
  const target = validateTarget(op.target);
  switch (op.action) {
    case "add": {
      if (!op.content) return `add: missing content`;
      const ok = appendContextFile(target, op.content);
      return ok ? `add → ${target}.md` : `add → ${target}.md: duplicate or empty`;
    }
    case "replace": {
      if (!op.content) return `replace: missing content`;
      if (!op.old_text) return `replace: missing old_text`;
      const ok = replaceContextFile(target, op.old_text, op.content);
      return ok ? `replace → ${target}.md` : `replace → ${target}.md: old_text not found`;
    }
    case "remove": {
      if (!op.old_text) return `remove: missing old_text`;
      const ok = removeFromContextFile(target, op.old_text);
      return ok ? `remove → ${target}.md` : `remove → ${target}.md: old_text not found`;
    }
    default:
      return `unknown action: ${op.action}`;
  }
}

export function registerMemoryTools(): void {
  registerTool(
    {
      name: "remember",
      category: "knowledge" as const,
      description:
        "Save durable facts to persistent context files that survive across sessions. " +
        "Injected into every future turn — keep entries compact and high-signal.\n\n" +
        "HOW: make ALL your changes in ONE call via 'operations' array (each: {action, target?, content?, old_text?}). " +
        "Batch applies atomically. Use bare action/content/old_text for a single change.\n\n" +
        "ACTIONS: 'add' (append, deduped), 'replace' (find old_text → replace with content), 'remove' (delete old_text).\n\n" +
        "TARGETS (most → least authoritative):\n" +
        "• rules — standing instructions you must always follow\n" +
        "• soul — your persona: name, personality, voice, values\n" +
        "• user — facts about the user: name, role, preferences, goals, tech stack\n" +
        "• memory — durable facts, decisions, project context\n" +
        "• context — current task state (ephemeral, update as tasks change)\n\n" +
        "WHEN: save proactively when the user states a preference, correction, or personal detail. " +
        "Priority: user preferences > environment facts > procedures.\n" +
        "SKIP: trivial info, task progress, completed-work logs, temporary state.",
      parameters: [
        { name: "action", type: "string", description: "'add', 'replace', or 'remove'. Omit when using 'operations'." },
        { name: "target", type: "string", description: "Which file: 'rules', 'soul', 'user' (default), 'memory', or 'context'." },
        { name: "content", type: "string", description: "Entry text for add/replace. Required for those actions." },
        { name: "old_text", type: "string", description: "Text to find for replace/remove. Required for those actions." },
        { name: "operations", type: "array", description: "Batch: array of {action, target?, content?, old_text?}. Overrides the single-action fields above.", items: { type: "object", properties: { action: { type: "string", description: "'add', 'replace', or 'remove'" }, target: { type: "string", description: "'rules','soul','user','memory','context'" }, content: { type: "string", description: "Entry text for add/replace" }, old_text: { type: "string", description: "Text to find for replace/remove" } } } },
      ],
    },
    async (args) => {
      // Batch mode: operations array
      const ops = args.operations as Operation[] | undefined;
      if (Array.isArray(ops) && ops.length > 0) {
        const results: string[] = [];
        for (const op of ops) {
          results.push(runOp(op));
        }
        const stats = getContextFileStats();
        const summary = stats.map(s => `${s.name}: ${s.chars}/${s.limit}`).join(", ");
        return { output: `Applied ${ops.length} operations.\n${results.join("\n")}\n\nFile sizes: ${summary}` };
      }

      // Single mode: bare action/content/old_text
      const action = String(args.action || "add") as Action;
      const result = runOp({
        action,
        target: args.target as string | undefined,
        content: args.content as string | undefined,
        old_text: args.old_text as string | undefined,
      });
      return { output: result };
    },
  );
}
