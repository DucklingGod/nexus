// Mixture-of-Agents (MoA) — Task 59. Fans the same query out to several models
// in parallel, then has one "aggregator" model critique + synthesize the
// candidate answers into a single response. Closes the Hermes MoA gap.
//
// Unlike delegate_task/delegate_batch (independent sub-agents each running
// their own tool loop on a DIFFERENT goal), MoA candidates answer the SAME
// question with no tools — the value is diverse model perspectives on one
// prompt, combined by a synthesis pass (the standard MoA technique).
//
// All candidates share one provider's apiKey/baseUrl (config) and differ only
// in `model` — a natural fit for a multi-model hub like OpenRouter, where many
// vendors' models are reachable through a single key.

import type { ProviderConfig } from "../providers/types.ts";
import { chat } from "../providers/client.ts";
import { estimateTokens } from "../tokens/budget.ts";

export type ActiveConfig = ProviderConfig & { model: string };

export interface MoACandidate {
  model: string;
  content: string;
  error?: string;
  usage: { input: number; output: number };
}

export interface MoAResult {
  query: string;
  candidates: MoACandidate[];
  aggregatorModel: string;
  synthesized: string;
  usage: { input: number; output: number };
}

const MAX_MODELS = 5;
const CANDIDATE_MAX_TOKENS = 1024;
const AGGREGATOR_MAX_TOKENS = 2048;

async function runCandidate(config: ProviderConfig, model: string, query: string, context?: string): Promise<MoACandidate> {
  const content = context ? `${context}\n\n${query}` : query;
  try {
    const res = await chat(config, { messages: [{ role: "user", content }], model, maxTokens: CANDIDATE_MAX_TOKENS });
    return {
      model,
      content: res.content || "(empty response)",
      usage: { input: res.usage?.input ?? estimateTokens(content), output: res.usage?.output ?? estimateTokens(res.content || "") },
    };
  } catch (e) {
    return { model, content: "", error: e instanceof Error ? e.message : String(e), usage: { input: 0, output: 0 } };
  }
}

function aggregatorPrompt(query: string, candidates: MoACandidate[]): string {
  const answers = candidates
    .map((c, i) => (c.error ? `--- Candidate ${i + 1} (${c.model}) — FAILED: ${c.error} ---` : `--- Candidate ${i + 1} (${c.model}) ---\n${c.content}`))
    .join("\n\n");
  return (
    `You are synthesizing multiple AI models' answers to the same question into one best answer.\n\n` +
    `Original question:\n${query}\n\n` +
    `Candidate answers:\n${answers}\n\n` +
    `Critically compare the candidates — note where they agree, where they conflict, and which reasoning is strongest. ` +
    `Then write ONE final answer that combines their best insights and corrects any errors you spot. ` +
    `Do not just pick one candidate verbatim; synthesize. Reply with the final answer only, no meta-commentary about the process.`
  );
}

/**
 * Query `models` in parallel with the same prompt, then synthesize the
 * candidates into one answer using `aggregatorModel` (defaults to the first
 * model in the list). `models` is capped at 5 and deduplicated.
 */
export async function runMoA(
  config: ActiveConfig,
  options: { query: string; models: string[]; aggregatorModel?: string; context?: string },
): Promise<MoAResult> {
  const models = [...new Set(options.models)].filter(Boolean).slice(0, MAX_MODELS);
  if (models.length === 0) throw new Error("mixture_of_agents needs at least one model");

  const candidates = await Promise.all(models.map((m) => runCandidate(config, m, options.query, options.context)));
  const aggregatorModel = options.aggregatorModel || models[0];

  const succeeded = candidates.filter((c) => !c.error);
  let synthesized: string;
  let aggUsage = { input: 0, output: 0 };
  if (succeeded.length === 0) {
    synthesized = "All candidate models failed — see per-model errors below.";
  } else if (succeeded.length === 1) {
    // Nothing to synthesize — a single aggregator call would just restate it.
    synthesized = succeeded[0].content;
  } else {
    const prompt = aggregatorPrompt(options.query, candidates);
    const res = await chat(config, { messages: [{ role: "user", content: prompt }], model: aggregatorModel, maxTokens: AGGREGATOR_MAX_TOKENS });
    synthesized = res.content || "(aggregator returned no content)";
    aggUsage = { input: res.usage?.input ?? estimateTokens(prompt), output: res.usage?.output ?? estimateTokens(synthesized) };
  }

  const usage = candidates.reduce(
    (sum, c) => ({ input: sum.input + c.usage.input, output: sum.output + c.usage.output }),
    aggUsage,
  );

  return { query: options.query, candidates, aggregatorModel, synthesized, usage };
}

/** Render an MoAResult as tool output text — candidates + the synthesized answer. */
export function formatMoAResult(result: MoAResult): string {
  const perModel = result.candidates
    .map((c) => (c.error ? `[${c.model}] FAILED: ${c.error}` : `[${c.model}]\n${c.content}`))
    .join("\n\n---\n\n");
  const tokens = result.usage.input + result.usage.output;
  return (
    `Mixture-of-Agents (${result.candidates.length} model${result.candidates.length === 1 ? "" : "s"}, ` +
    `aggregator: ${result.aggregatorModel}, ~${tokens} tokens)\n\n` +
    `=== Synthesized answer ===\n${result.synthesized}\n\n` +
    `=== Per-model candidates ===\n${perModel}`
  );
}
