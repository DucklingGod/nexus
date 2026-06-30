// Smart model router (Task 31 / v0.4). Classifies a message's complexity and
// routes it to the cheapest capable model for the active provider — so trivial
// messages don't burn premium-model cost. Opt-in via the `router.enabled`
// setting; per-tier model names can be overridden via settings. Safe by design:
// the worst case is a sub-optimal model, never a wrong answer.

import { getSetting } from "../db/settings.ts";

export type Complexity = "simple" | "medium" | "complex";

/** Heuristic complexity classification — no LLM call, so it's free and instant. */
export function classifyComplexity(text: string): Complexity {
  const t = text.toLowerCase();
  const len = text.length;
  if (
    len > 600 ||
    /\b(code|coding|debug|refactor|implement|build|analy|architecture|algorithm|optimi|database|migrat|deploy|why does|explain how|step[ -]by[ -]step|design)\b/.test(t)
  ) {
    return "complex";
  }
  if (len < 80 && /\b(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|cool|nice|great)\b/.test(t)) {
    return "simple";
  }
  if (len < 40) return "simple";
  return "medium";
}

interface Tier {
  match: string;
  simple: string;
  medium: string;
  complex: string;
}

// Built-in tier maps per provider (matched on baseUrl). Defaults — overridable
// via settings (router.simple/medium/complex). Update as model names change.
const TIERS: Tier[] = [
  { match: "openai.com", simple: "gpt-4o-mini", medium: "gpt-4o", complex: "o3" },
  { match: "openrouter.ai", simple: "openai/gpt-4o-mini", medium: "openai/gpt-4o", complex: "anthropic/claude-3.7-sonnet" },
  { match: "anthropic.com", simple: "claude-haiku-4-5", medium: "claude-sonnet-4-6", complex: "claude-opus-4-8" },
  { match: "deepseek.com", simple: "deepseek-chat", medium: "deepseek-chat", complex: "deepseek-reasoner" },
  { match: "googleapis.com", simple: "gemini-2.5-flash", medium: "gemini-2.5-flash", complex: "gemini-2.5-pro" },
];

/** Pure routing decision. Overrides win over the built-in tier map. */
export function routeModel(
  baseUrl: string,
  requestedModel: string,
  query: string,
  overrides: Partial<Record<Complexity, string>> = {},
): { model: string; complexity: Complexity; routed: boolean } {
  const complexity = classifyComplexity(query);
  const override = overrides[complexity];
  if (override) return { model: override, complexity, routed: override !== requestedModel };
  const tier = TIERS.find((t) => baseUrl.includes(t.match));
  if (tier) {
    const m = tier[complexity];
    return { model: m, complexity, routed: m !== requestedModel };
  }
  return { model: requestedModel, complexity, routed: false };
}

/**
 * Apply routing if enabled. Reads settings, emits a `chat.routed` notification
 * when the model changes (so the UI can show the cost-saving decision), and
 * returns the model to actually use.
 */
export function maybeRouteModel(
  baseUrl: string,
  requestedModel: string,
  query: string,
  send: (obj: unknown) => void,
): string {
  if (getSetting("router.enabled") !== "true") return requestedModel;
  const overrides: Partial<Record<Complexity, string>> = {
    simple: getSetting("router.simple") || undefined,
    medium: getSetting("router.medium") || undefined,
    complex: getSetting("router.complex") || undefined,
  };
  const { model, complexity, routed } = routeModel(baseUrl, requestedModel, query, overrides);
  if (routed) {
    send({ jsonrpc: "2.0", method: "chat.routed", params: { model, complexity, from: requestedModel } });
  }
  return model;
}
