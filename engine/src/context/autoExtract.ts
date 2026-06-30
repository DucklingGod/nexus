// Auto-extract (Hermes-style): after each chat, a lightweight background LLM
// call distills durable facts from the conversation into the persistent .md
// context files. Opt-in via settings key "memory.autoExtract" = "true".
// Runs fire-and-forget — never blocks the user's response.

import { chat } from "../providers/client.ts";
import type { ChatMessage, ProviderConfig } from "../providers/types.ts";
import { appendContextFile } from "./files.ts";
import { getSetting } from "../db/settings.ts";

const EXTRACT_PROMPT = `You are a memory extraction system. Analyze the conversation and extract durable facts worth saving. Return ONLY a JSON array of objects, nothing else.

Each object has:
- "file": one of "rules", "soul", "user", "memory", "context"
- "note": one concise sentence

What belongs in each file:
- rules: standing instructions the agent should always follow (e.g. "Always reply in Thai")
- soul: agent persona details (name, style, values) — only if user explicitly set them
- user: facts about the user (name, role, preferences, goals, tech stack, timezone)
- memory: project context, decisions, technical facts, important URLs
- context: current task state, blockers, next steps

RULES:
- Extract ONLY facts explicitly stated or clearly implied in the conversation
- Do NOT extract transient chat details, greetings, or one-off questions
- Each note must be one concise sentence
- If nothing worth saving, return an empty array: []
- Never duplicate information already obvious from context
- Prefer "user" for user facts, "memory" for project/decision facts
- Use "rules" only for explicit instructions the user wants always followed

Return ONLY the JSON array. No explanation, no markdown fences.`;

/** Check if auto-extraction is enabled. */
export function isAutoExtractEnabled(): boolean {
  return getSetting("memory.autoExtract") !== "false";
}

/**
 * Background extraction: send the last N messages to a cheap model, parse
 * out durable facts, and append them to the appropriate .md files.
 * Fire-and-forget — callers should `void` the returned promise.
 */
export async function autoExtract(
  config: ProviderConfig,
  messages: ChatMessage[],
  model: string,
): Promise<void> {
  // Only look at the last 10 messages to keep the extraction cheap
  const recent = messages.slice(-10);
  if (recent.length < 2) return; // need at least a user+assistant pair

  try {
    const extractMessages: ChatMessage[] = [
      { role: "system", content: EXTRACT_PROMPT },
      ...recent,
    ];

    // Use a small/fast model for extraction to save tokens
    const extractModel = pickExtractModel(model);
    const res = await chat(config, { messages: extractMessages, model: extractModel, maxTokens: 1024 });
    const text = res.content?.trim() ?? "";
    if (!text || text === "[]") return;

    // Parse the JSON array — handle markdown fences if the model wraps them
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const entries = JSON.parse(cleaned);
    if (!Array.isArray(entries) || entries.length === 0) return;

    let saved = 0;
    for (const entry of entries) {
      const file = String(entry.file || "");
      const note = String(entry.note || "").trim();
      if (!note || !["rules", "soul", "user", "memory", "context"].includes(file)) continue;
      if (appendContextFile(file, note)) saved++;
    }

    if (saved > 0) {
      console.log(`[auto-extract] Saved ${saved} notes to context files`);
    }
  } catch (e) {
    // Extraction failures are silent — never bother the user
    console.warn("[auto-extract] Failed:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Pick a cheaper model for extraction. Falls back to the chat model if no
 * cheaper alternative is available. This is a heuristic — we prefer small
 * models for the extraction task to save tokens.
 */
function pickExtractModel(chatModel: string): string {
  const m = chatModel.toLowerCase();
  // If using a large model, try to use a smaller one from the same provider
  if (m.includes("opus") || m.includes("sonnet") || m.includes("gpt-4") || m.includes("o1") || m.includes("o3")) {
    // Anthropic: sonnet → haiku; OpenAI: gpt-4 → gpt-4o-mini
    if (m.includes("claude")) return "claude-haiku-3.5";
    if (m.includes("gpt-4")) return "gpt-4o-mini";
  }
  return chatModel; // already small, use as-is
}
