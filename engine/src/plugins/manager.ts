// Plugin manager for Nexus.
// Plugins are JS/TS modules in NEXUS_DATA_DIR/nexus/plugins/ that export tools.
// A plugin file exports: { name, version?, tools: [{ name, description, parameters, execute }] }
// On load, each tool is registered in the Nexus tool registry with a "plugin_" prefix.
//
// Plugin manifest format (plugin.js or plugin.ts):
//   export default {
//     name: "my-plugin",
//     version: "1.0.0",
//     tools: [{
//       name: "do_thing",
//       description: "Does a thing",
//       category: "utility", // optional, default: "utility"
//       dangerous: false,   // optional, default: false
//       parameters: [{ name: "input", type: "string", description: "...", required: true }],
//       execute: async (args) => ({ output: "result" })
//     }]
//   }

import { join } from "node:path";
import { readdirSync, existsSync, readFileSync, watch } from "node:fs";
import { getSetting, setSetting } from "../db/settings.ts";
import { registerTool } from "../tools/registry.ts";
import type { ToolParam, ToolResult, ToolDef, ToolFn } from "../tools/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginTool {
  name: string;
  description: string;
  category?: string;
  dangerous?: boolean;
  parameters: ToolParam[];
  execute: (args: Record<string, unknown>) => Promise<ToolResult | string>;
}

interface PluginManifest {
  name: string;
  version?: string;
  tools: PluginTool[];
}

interface PluginState {
  id: string;
  name: string;
  version?: string;
  enabled: boolean;
  toolCount: number;
  loaded: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

function getPluginsDir(): string {
  return join(
    process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
    "nexus",
    "plugins",
  );
}

// ---------------------------------------------------------------------------
// Plugin discovery & loading
// ---------------------------------------------------------------------------

function findPluginFiles(): string[] {
  const dir = getPluginsDir();
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(js|ts|mjs)$/i.test(entry.name)) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

// Track loaded plugins
const loadedPlugins = new Map<string, PluginState>();

function getDisabledPlugins(): Set<string> {
  try {
    return new Set(JSON.parse(getSetting("plugins.disabled") || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function setDisabledPlugins(ids: Set<string>): void {
  setSetting("plugins.disabled", JSON.stringify([...ids]));
}

/** Load a single plugin file and register its tools. */
async function loadPlugin(filePath: string): Promise<PluginState> {
  const fileId = filePath.split(/[\\/]/).pop()!.replace(/\.(js|ts|mjs)$/i, "");

  try {
    // Dynamic import — Node.js handles both .js and .ts (with tsx/loader)
    const mod = await import(`file://${filePath.replace(/\\/g, "/")}`);
    const manifest: PluginManifest = mod.default ?? mod;

    if (!manifest || !manifest.name || !Array.isArray(manifest.tools)) {
      throw new Error("Invalid plugin: must export { name, tools[] }");
    }

    const disabled = getDisabledPlugins();
    const enabled = !disabled.has(manifest.name);

    // Register each tool
    for (const tool of manifest.tools) {
      if (!tool.name || !tool.execute) continue;
      const fullName = `plugin_${tool.name}`;
      const def: ToolDef = {
        name: fullName,
        description: `[${manifest.name}] ${tool.description}`,
        category: (tool.category as ToolDef["category"]) ?? "utility",
        parameters: tool.parameters ?? [],
        dangerous: tool.dangerous ?? false,
      };
      const fn: ToolFn = async (args) => {
        const result = await tool.execute(args);
        if (typeof result === "string") return { output: result };
        return result;
      };
      registerTool(def, fn);
    }

    const state: PluginState = {
      id: manifest.name,
      name: manifest.name,
      version: manifest.version,
      enabled,
      toolCount: manifest.tools.length,
      loaded: true,
    };
    loadedPlugins.set(manifest.name, state);
    process.stderr.write(`[plugins] Loaded "${manifest.name}" — ${manifest.tools.length} tools\n`);
    return state;
  } catch (e) {
    const state: PluginState = {
      id: fileId,
      name: fileId,
      enabled: false,
      toolCount: 0,
      loaded: false,
      error: e instanceof Error ? e.message : String(e),
    };
    loadedPlugins.set(fileId, state);
    process.stderr.write(`[plugins] Failed to load ${fileId}: ${state.error}\n`);
    return state;
  }
}

/** Load all plugins from the plugins directory. */
export async function loadAllPlugins(): Promise<PluginState[]> {
  const files = findPluginFiles();
  for (const f of files) {
    await loadPlugin(f);
  }
  return getPluginStates();
}

export function getPluginStates(): PluginState[] {
  return Array.from(loadedPlugins.values());
}

export function enablePlugin(id: string, enabled: boolean): void {
  const disabled = getDisabledPlugins();
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  setDisabledPlugins(disabled);
  const state = loadedPlugins.get(id);
  if (state) state.enabled = enabled;
}

/** Get a sample plugin template for the user. */
export function getPluginTemplate(): string {
  return `// Nexus Plugin Template
// Save this file as NEXUS_DATA_DIR/nexus/plugins/my-plugin.js
// Then restart Nexus (or reload plugins) to activate.

export default {
  name: "my-plugin",
  version: "1.0.0",
  tools: [
    {
      name: "hello",
      description: "Says hello to the given name",
      category: "utility",
      dangerous: false,
      parameters: [
        { name: "name", type: "string", description: "Name to greet", required: true }
      ],
      execute: async (args) => {
        const name = args.name || "World";
        return { output: \`Hello, \${name}! 👋\` };
      }
    }
  ]
};
`;
}
