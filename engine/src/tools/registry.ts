// ponytail: flat tool registry — register, list, execute. No plugin system.

import type { ToolDef, ToolFn, ToolResult } from "./types.ts";
import { getSetting } from "../db/settings.ts";

interface RegisteredTool {
  def: ToolDef;
  fn: ToolFn;
}

const tools = new Map<string, RegisteredTool>();

export function registerTool(def: ToolDef, fn: ToolFn): void {
  tools.set(def.name, { def, fn });
}

export function getTool(name: string): RegisteredTool | undefined {
  return tools.get(name);
}

export function listTools(): ToolDef[] {
  return Array.from(tools.values()).map(t => t.def);
}

/** Human-readable tool inventory for the system prompt. Uses a compact format
 *  to minimize token cost while keeping the agent aware of all capabilities.
 *  Cached internally — returns the same string until the tool set changes. */
let _toolsCache: { hash: string; text: string } = { hash: "", text: "" };

export function listToolsText(): string {
  const disabledRaw = getSetting("tools.disabled");
  const disabled: string[] = disabledRaw ? JSON.parse(disabledRaw) : [];
  const active = listTools().filter(t => !disabled.includes(t.category));
  if (active.length === 0) return "";

  // Cache key: sorted tool names + disabled list
  const hash = active.map(t => t.name).sort().join(",") + "|" + disabled.sort().join(",");
  if (hash === _toolsCache.hash) return _toolsCache.text;

  // Compact format: group by category, list names with one-line descriptions
  // Skip parameter details — the tools array (function-calling) carries those.
  const grouped = new Map<string, typeof active>();
  for (const t of active) {
    const arr = grouped.get(t.category) ?? [];
    arr.push(t);
    grouped.set(t.category, arr);
  }

  const lines: string[] = ["# Available tools (use proactively — do not ask permission)", ""];
  for (const [cat, tools] of grouped) {
    lines.push(`${cat}: ${tools.map(t => t.name).join(", ")}`);
  }
  lines.push("", "Each tool is also available via function-calling. Use them directly — never tell the user you lack access.");

  const text = lines.join("\n");
  _toolsCache = { hash, text };
  return text;
}

export function listToolsForLLM(): object[] {
  // Filter out disabled categories
  const disabledRaw = getSetting("tools.disabled");
  const disabled: string[] = disabledRaw ? JSON.parse(disabledRaw) : [];

  return listTools()
    .filter(t => !disabled.includes(t.category))
    .map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            t.parameters.map(p => {
              const schema: Record<string, unknown> = { type: p.type, description: p.description };
              if (p.items) schema.items = p.items;
              if (p.properties) schema.properties = p.properties;
              return [p.name, schema];
            })
          ),
          required: t.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) return { output: "", error: `Tool not found: ${name}`, elapsed_ms: 0 };

  const start = Date.now();
  try {
    const result = await tool.fn(args);
    result.elapsed_ms = Date.now() - start;
    process.stderr.write(`[tool] ${name} completed in ${result.elapsed_ms}ms\n`);
    return result;
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[tool] ${name} failed in ${elapsed}ms: ${msg}\n`);
    return { output: "", error: msg, elapsed_ms: elapsed };
  }
}

// Auto-register all built-in tools on import
export async function initTools(): Promise<void> {
  const { registerWebTools } = await import("./web.ts");
  const { registerFileTools } = await import("./file.ts");
  const { registerTerminalTools } = await import("./terminal.ts");
  const { registerSearchTools } = await import("./search.ts");
  const { registerPatchTools } = await import("./patch.ts");
  const { registerCodeTools } = await import("./code.ts");
  const { registerProcessTools } = await import("./process.ts");
  const { registerTodoTools } = await import("./todo.ts");
  const { registerKnowledgeTools } = await import("./knowledge.ts");
  const { registerInstallTools } = await import("./install.ts");
  const { registerMemoryTools } = await import("./memory.ts");
  const { registerDelegateTools } = await import("./delegate.ts");
  const { registerMoATools } = await import("./moa.ts");
  const { registerMediaTools } = await import("./media.ts");
  const { registerBrowserTools } = await import("./browser.ts");
  const { registerSchedulerTools } = await import("./scheduler.ts");
  const { registerSessionSearchTool } = await import("./session.ts");
  const { registerMcpTools } = await import("./mcp.ts");
  const { registerPluginTools } = await import("./plugins.ts");
  const { registerKanbanTools } = await import("./kanban.ts");
  const { registerSshTools } = await import("./ssh.ts");
  const { registerAskUserTool } = await import("./askUser.ts");
  const { registerSkillManageTools } = await import("./skillManage.ts");
  const { registerVisionAnalyzeTool } = await import("./vision.ts");

  registerWebTools();
  registerFileTools();
  registerTerminalTools();
  registerSearchTools();
  registerPatchTools();
  registerCodeTools();
  registerProcessTools();
  registerTodoTools();
  registerKnowledgeTools(registerTool);
  registerInstallTools();
  registerMemoryTools();
  registerDelegateTools();
  registerMoATools();
  registerMediaTools();
  registerBrowserTools();
  registerSchedulerTools();
  registerSessionSearchTool();
  registerMcpTools();
  registerPluginTools();
  registerKanbanTools();
  registerSshTools();
  registerAskUserTool();
  registerSkillManageTools();
  registerVisionAnalyzeTool();

  process.stderr.write(`[tools] registered ${tools.size} tools: ${listTools().map(t => t.name).join(", ")}\n`);
}
