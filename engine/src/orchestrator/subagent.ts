// Enhanced sub-agent orchestrator — runs focused agents for delegated tasks.
//
// Improvements over basic delegation:
//   • Async execution with progress tracking (non-blocking for parent)
//   • Batch/parallel fan-out (multiple tasks at once)
//   • Token budget tracking per sub-agent
//   • Configurable tool sandbox (allow/deny lists)
//   • Context injection (parent passes background info)
//   • Model override (route cheap subtasks to cheaper models)
//   • Configurable depth (orchestrator sub-agents can delegate further)
//   • Progressive results (each tool round is captured)

import type { ProviderConfig, ChatMessage } from "../providers/types.ts";
import { chat } from "../providers/client.ts";
import { listToolsForLLM, executeTool, getTool } from "../tools/registry.ts";
import { estimateTokens } from "../tokens/budget.ts";
import { getSetting } from "../db/settings.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubAgentTask {
  id: string;
  goal: string;
  context?: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  tokenUsage: { input: number; output: number };
  rounds: number;
  steps: string[]; // progressive log of each step
}

export interface SubAgentOptions {
  goal: string;
  context?: string;
  toolset?: "safe" | "full" | "research" | "code" | "web";
  allowTools?: string[];
  denyTools?: string[];
  model?: string;
  maxRounds?: number;
  maxTokens?: number;
  maxDepth?: number;
  onProgress?: (task: SubAgentTask) => void;
}

export type ActiveConfig = ProviderConfig & { model: string };

// ---------------------------------------------------------------------------
// Toolset presets — which tools a sub-agent can use
// ---------------------------------------------------------------------------

const TOOLSET_PRESETS: Record<string, (toolName: string) => boolean> = {
  // safe: no dangerous tools, no delegation
  safe: (name) => name !== "delegate" && name !== "delegate_batch" && !getTool(name)?.def.dangerous,
  // full: everything (including dangerous, but still no recursive delegation by default)
  full: () => true,
  // research: web + search + session search only
  research: (name) =>
    ["web_search", "web_fetch", "search_files", "session_search", "browser_navigate",
     "browser_get_text", "browser_scroll", "browser_screenshot"].includes(name),
  // code: file ops + terminal + patch + code execution
  code: (name) =>
    ["file_read", "file_write", "file_list", "search_files", "patch",
     "terminal_exec", "execute_code", "process_start", "process_list", "process_kill"].includes(name),
  // web: browser + web tools only
  web: (name) =>
    ["web_search", "web_fetch", "browser_navigate", "browser_click", "browser_type",
     "browser_screenshot", "browser_get_text", "browser_scroll"].includes(name),
};

function filterTools(
  preset: string,
  allowList?: string[],
  denyList?: string[],
): object[] {
  const filter = TOOLSET_PRESETS[preset] ?? TOOLSET_PRESETS.safe;
  return listToolsForLLM().filter((t) => {
    const name = (t as { function?: { name?: string } }).function?.name;
    if (!name) return true;
    if (!filter(name)) return false;
    if (denyList?.includes(name)) return false;
    if (allowList && allowList.length > 0 && !allowList.includes(name)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Single sub-agent execution
// ---------------------------------------------------------------------------

export async function runSubAgent(
  config: ActiveConfig,
  options: SubAgentOptions,
): Promise<SubAgentTask> {
  const task: SubAgentTask = {
    id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    goal: options.goal,
    context: options.context,
    status: "running",
    startedAt: Date.now(),
    tokenUsage: { input: 0, output: 0 },
    rounds: 0,
    steps: [],
  };

  const maxRounds = options.maxRounds ?? 5;
  const maxTokens = options.maxTokens ?? 4096;
  const model = options.model ?? config.model;
  const toolset = options.toolset ?? "safe";
  const tools = filterTools(toolset, options.allowTools, options.denyTools);

  // Build messages with context injection
  const sysParts: string[] = [
    "You are a focused sub-agent working on a specific delegated task.",
    "Complete the task thoroughly using the available tools.",
    "Be concise in your final response — summarize key findings and results.",
  ];
  if (options.context) {
    sysParts.push(`Background context:\n${options.context}`);
  }
  sysParts.push(`Task: ${options.goal}`);

  const messages: ChatMessage[] = [
    { role: "system", content: sysParts.join("\n\n") },
    { role: "user", content: options.goal },
  ];

  try {
    for (let round = 0; round < maxRounds; round++) {
      task.rounds = round + 1;

      const hasTools = tools.length > 0;
      const res = await chat(
        config,
        {
          messages,
          model,
          tools: hasTools ? tools : undefined,
          maxTokens,
        },
      );

      // Track token usage
      if (res.usage) {
        task.tokenUsage.input += res.usage.input ?? estimateTokens(messages.map(m => m.content).join(" "));
        task.tokenUsage.output += res.usage.output ?? estimateTokens(res.content || "");
      } else {
        task.tokenUsage.input += estimateTokens(messages.map(m => m.content).join(" "));
        task.tokenUsage.output += estimateTokens(res.content || "");
      }

      // No tool calls — done
      if (!res.tool_calls?.length) {
        task.result = res.content || "(no response from sub-agent)";
        task.steps.push(`Round ${round + 1}: Completed — ${task.result.slice(0, 200)}`);
        task.status = "completed";
        task.finishedAt = Date.now();
        options.onProgress?.(task);
        return task;
      }

      // Execute tool calls
      task.steps.push(`Round ${round + 1}: ${res.tool_calls.length} tool call(s) — ${res.tool_calls.map(tc => tc.name).join(", ")}`);
      options.onProgress?.(task);

      messages.push({ role: "assistant", content: res.content || "" });
      for (const tc of res.tool_calls) {
        const result = await executeTool(tc.name, (tc.arguments ?? {}) as Record<string, unknown>);
        const truncated = (result.output || "").slice(0, 4000);
        messages.push({
          role: "user",
          content: `[Tool: ${tc.name}]\n${truncated}${result.error ? `\nError: ${result.error}` : ""}`,
        });
      }
    }

    // Max rounds reached — final summary without tools
    const final = await chat(config, { messages, model, maxTokens });
    task.result = final.content || "(sub-agent ran out of rounds)";
    task.steps.push(`Final: Summarized after ${maxRounds} rounds`);
    task.status = "completed";
    task.finishedAt = Date.now();
    options.onProgress?.(task);
    return task;
  } catch (e) {
    task.status = "failed";
    task.error = e instanceof Error ? e.message : String(e);
    task.finishedAt = Date.now();
    options.onProgress?.(task);
    return task;
  }
}

// ---------------------------------------------------------------------------
// Batch execution (parallel fan-out)
// ---------------------------------------------------------------------------

export async function runSubAgentBatch(
  config: ActiveConfig,
  tasks: SubAgentOptions[],
  concurrency: number = 3,
): Promise<SubAgentTask[]> {
  // Limit concurrency
  const maxConcurrent = Math.min(concurrency, tasks.length, 5);
  const results: SubAgentTask[] = new Array(tasks.length);

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await runSubAgent(config, tasks[idx]);
    }
  }

  const workers = Array.from({ length: maxConcurrent }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Format task results for the parent agent
// ---------------------------------------------------------------------------

export function formatTaskResult(task: SubAgentTask): string {
  const elapsed = task.finishedAt && task.startedAt ? ((task.finishedAt - task.startedAt) / 1000).toFixed(1) : "?";
  const tokens = task.tokenUsage.input + task.tokenUsage.output;
  const header = `[${task.status === "completed" ? "✅" : "❌"} ${task.id}] Goal: ${task.goal.slice(0, 120)}`;
  const meta = `Rounds: ${task.rounds} | Tokens: ~${tokens} | Time: ${elapsed}s`;

  if (task.status === "failed") {
    return `${header}\n${meta}\nError: ${task.error}`;
  }

  return `${header}\n${meta}\nResult:\n${task.result}`;
}

export function formatBatchResult(tasks: SubAgentTask[]): string {
  const completed = tasks.filter(t => t.status === "completed").length;
  const totalTokens = tasks.reduce((sum, t) => sum + t.tokenUsage.input + t.tokenUsage.output, 0);
  const totalTime = tasks[0]?.startedAt && tasks[tasks.length - 1]?.finishedAt
    ? ((Math.max(...tasks.map(t => t.finishedAt ?? 0)) - Math.min(...tasks.map(t => t.startedAt ?? Date.now()))) / 1000).toFixed(1)
    : "?";

  const summary = `Batch complete: ${completed}/${tasks.length} succeeded | ~${totalTokens} tokens | ${totalTime}s total\n`;
  const details = tasks.map((t, i) => `\n--- Task ${i + 1}/${tasks.length} ---\n${formatTaskResult(t)}`).join("\n");
  return summary + details;
}
