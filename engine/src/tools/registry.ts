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
  const { registerMediaTools } = await import("./media.ts");

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
  registerMediaTools();

  process.stderr.write(`[tools] registered ${tools.size} tools: ${listTools().map(t => t.name).join(", ")}\n`);
}
