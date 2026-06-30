// Agent tool: delegate a subtask to a sub-agent (v0.9 / Task 41 — sub-agent
// delegation). The sub-agent runs its own focused tool loop (safe tools only)
// and returns the result to the parent. Enables breaking a complex task into
// independent parts. Non-dangerous: the sub-agent cannot run destructive tools
// and cannot delegate again (no recursion).

import { registerTool } from "./registry.ts";
import { runConnectorAgent } from "../connectors/agent.ts";
import { getActiveConfig } from "../agents/runtime.ts";

export function registerDelegateTools(): void {
  registerTool(
    {
      name: "delegate",
      category: "knowledge" as const,
      description: "Delegate a focused subtask to a sub-agent that works on it independently (with web/file/search tools) and returns the result. Use to split a complex task into self-contained parts, or to run a research/lookup subtask without cluttering the main thread.",
      parameters: [
        { name: "task", type: "string", description: "The subtask as a clear, standalone instruction", required: true },
      ],
    },
    async (args) => {
      const cfg = getActiveConfig();
      if (!cfg) return { output: "", error: "No active provider — cannot delegate." };
      const task = String(args.task);
      const result = await runConnectorAgent(cfg, [{ role: "user", content: task }], "a delegated sub-task");
      return { output: result };
    },
  );
}
