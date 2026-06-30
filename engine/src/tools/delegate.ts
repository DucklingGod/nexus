// Sub-agent delegation tools — enhanced orchestrator with parallel batch execution,
// toolset sandboxing, model override, context injection, and token tracking.
//
// Tools: delegate_task, delegate_batch, delegate_status
//
// These tools supersede the original basic `delegate` tool by using the
// orchestrator/subagent.ts engine.

import { registerTool } from "./registry.ts";
import { getActiveConfig } from "../agents/runtime.ts";
import {
  type SubAgentTask,
  runSubAgent,
  runSubAgentBatch,
  formatTaskResult,
  formatBatchResult,
} from "../orchestrator/subagent.ts";

// Track async background tasks so delegate_status can query them.
const backgroundTasks = new Map<string, SubAgentTask>();

export function registerDelegateTools(): void {
  registerTool(
    {
      name: "delegate_task",
      category: "knowledge" as const,
      description:
        "Delegate a focused subtask to an autonomous sub-agent that works independently using the available tools, " +
        "then returns the result. The sub-agent gets its own LLM context and tool loop. " +
        "Use to break complex tasks into parts, run research in parallel, or isolate risky operations.\n\n" +
        "Toolset presets:\n" +
        "  • safe (default) — all non-dangerous tools except delegation\n" +
        "  • research — web, search, browser-read only\n" +
        "  • code — file ops, terminal, patch, code execution\n" +
        "  • web — browser + web tools only\n" +
        "  • full — everything including dangerous tools",
      parameters: [
        { name: "goal", type: "string", description: "Clear, self-contained instruction for the sub-agent", required: true },
        { name: "context", type: "string", description: "Background information the sub-agent needs (file paths, error messages, constraints)" },
        {
          name: "toolset",
          type: "string",
          description: 'Tool sandbox: "safe", "research", "code", "web", or "full" (default: safe)',
        },
        { name: "model", type: "string", description: "Override model (e.g., route to a cheaper model for simple tasks)" },
        { name: "max_rounds", type: "number", description: "Max tool rounds (default: 5)" },
      ],
    },
    async (args) => {
      const cfg = getActiveConfig();
      if (!cfg) return { output: "", error: "No active provider — cannot delegate." };

      const goal = String(args.goal);
      const result = await runSubAgent(cfg, {
        goal,
        context: args.context ? String(args.context) : undefined,
        toolset: args.toolset ? String(args.toolset) as "safe" | "research" | "code" | "web" | "full" : "safe",
        model: args.model ? String(args.model) : undefined,
        maxRounds: args.max_rounds ? Number(args.max_rounds) : 5,
      });

      // Track for status queries
      backgroundTasks.set(result.id, result);

      return { output: formatTaskResult(result) };
    },
  );

  registerTool(
    {
      name: "delegate_batch",
      category: "knowledge" as const,
      description:
        "Run multiple sub-agent tasks IN PARALLEL (fan-out). Each task runs independently and concurrently. " +
        "Use for independent workstreams that can proceed simultaneously — e.g., 'research A' + 'research B' + 'write code C'. " +
        "Returns all results when all tasks finish. Tasks array supports the same options as delegate_task.",
      parameters: [
        {
          name: "tasks",
          type: "array",
          description: "Array of task objects, each with: goal (required), context, toolset, model, max_rounds",
          required: true,
          items: {
            type: "object",
            properties: {
              goal: { type: "string", description: "The subtask instruction" },
              context: { type: "string", description: "Background context" },
              toolset: { type: "string", description: "Tool preset: safe/research/code/web/full" },
              model: { type: "string", description: "Model override" },
            },
          },
        },
        {
          name: "concurrency",
          type: "number",
          description: "Max parallel sub-agents (default: 3, max: 5)",
        },
      ],
    },
    async (args) => {
      const cfg = getActiveConfig();
      if (!cfg) return { output: "", error: "No active provider — cannot delegate." };

      const rawTasks = args.tasks as Array<Record<string, unknown>>;
      if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        return { output: "No tasks provided for batch delegation." };
      }

      const concurrency = Math.min(Number(args.concurrency) || 3, 5);
      const tasks = rawTasks.map((t) => ({
        goal: String(t.goal),
        context: t.context ? String(t.context) : undefined,
        toolset: (t.toolset as string | undefined) as "safe" | "research" | "code" | "web" | "full" | undefined,
        model: t.model ? String(t.model) : undefined,
        maxRounds: t.max_rounds ? Number(t.max_rounds) : 5,
      }));

      const results = await runSubAgentBatch(cfg, tasks, concurrency);

      // Track all for status queries
      for (const r of results) backgroundTasks.set(r.id, r);

      return { output: formatBatchResult(results) };
    },
  );

  registerTool(
    {
      name: "delegate_status",
      category: "knowledge" as const,
      description:
        "Check the status of previously dispatched sub-agent tasks. " +
        "Returns all tracked tasks with their current status, token usage, and results.",
      parameters: [],
    },
    async () => {
      if (backgroundTasks.size === 0) {
        return { output: "No delegated tasks tracked in this session." };
      }
      const tasks = Array.from(backgroundTasks.values());
      const lines = tasks.map((t, i) => {
        const status = t.status === "completed" ? "✅" : t.status === "failed" ? "❌" : t.status === "running" ? "🔄" : "⏳";
        const tokens = t.tokenUsage.input + t.tokenUsage.output;
        return `${i + 1}. ${status} ${t.id} — ${t.goal.slice(0, 80)} | Rounds: ${t.rounds} | ~${tokens} tokens`;
      });
      return { output: `Delegated Tasks (${tasks.length}):\n\n${lines.join("\n")}` };
    },
  );
}
