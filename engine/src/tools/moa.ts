// Mixture-of-Agents tool — Task 59. See orchestrator/moa.ts for the mechanics.

import { registerTool } from "./registry.ts";
import { getActiveConfig } from "../agents/runtime.ts";
import { runMoA, formatMoAResult } from "../orchestrator/moa.ts";

export function registerMoATools(): void {
  registerTool(
    {
      name: "mixture_of_agents",
      category: "knowledge" as const,
      description:
        "Ask multiple models the SAME question in parallel, then synthesize their answers into one best response " +
        "(Mixture-of-Agents). Use for high-stakes or ambiguous questions where cross-checking several models' " +
        "perspectives beats asking just one — e.g. a hard reasoning problem, a judgment call, or when you want a " +
        "second/third opinion before committing to an answer. Not for simple factual lookups (use a single call instead). " +
        "Models must be reachable through the current provider's key (e.g. multiple model IDs via an OpenRouter key).",
      parameters: [
        { name: "query", type: "string", description: "The question to ask every model", required: true },
        { name: "models", type: "array", description: "Model IDs to query (2-5 recommended; a single model just returns its own answer)", required: true, items: { type: "string" } },
        { name: "aggregator_model", type: "string", description: "Model that synthesizes the candidates (default: first model in the list)" },
        { name: "context", type: "string", description: "Optional background context prepended to the query for every candidate" },
      ],
    },
    async (args) => {
      const cfg = getActiveConfig();
      if (!cfg) return { output: "", error: "No active provider — cannot run mixture_of_agents." };

      const models = (args.models as unknown[] | undefined)?.map(String) ?? [];
      if (models.length === 0) return { output: "No models provided." };

      const result = await runMoA(cfg, {
        query: String(args.query),
        models,
        aggregatorModel: args.aggregator_model ? String(args.aggregator_model) : undefined,
        context: args.context ? String(args.context) : undefined,
      });
      return { output: formatMoAResult(result) };
    },
  );
}
