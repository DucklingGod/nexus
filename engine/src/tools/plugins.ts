// Plugin management tools — agent-facing tools for managing Nexus plugins.

import { registerTool } from "./registry.ts";
import {
  getPluginStates,
  loadAllPlugins,
  enablePlugin,
  getPluginTemplate,
} from "../plugins/manager.ts";

export function registerPluginTools(): void {
  registerTool(
    {
      name: "plugin_list",
      category: "utility" as const,
      description:
        "List all installed plugins and their status. Plugins extend your capabilities with custom tools. " +
        "Plugin files live in NEXUS_DATA_DIR/nexus/plugins/ as .js or .ts files.",
      parameters: [],
    },
    async () => {
      const plugins = getPluginStates();
      if (plugins.length === 0) {
        return {
          output:
            "No plugins installed.\n\n" +
            "Plugins are JS/TS files in your Nexus data directory under plugins/.\n" +
            "Each plugin exports { name, version?, tools: [{ name, description, parameters, execute }] }.\n" +
            "Use plugin_template to get a starter template.",
        };
      }
      const lines = plugins.map((p, i) => {
        const status = p.loaded ? (p.enabled ? "✅" : "⏸️") : "❌";
        const ver = p.version ? ` v${p.version}` : "";
        const err = p.error ? ` — Error: ${p.error}` : "";
        return `${i + 1}. ${status} ${p.name}${ver} — ${p.toolCount} tool(s)${err}`;
      });
      return { output: `Plugins (${plugins.length}):\n\n${lines.join("\n")}` };
    },
  );

  registerTool(
    {
      name: "plugin_reload",
      category: "utility" as const,
      description:
        "Scan the plugins directory and load/reload all plugin files. " +
        "Use this after adding or modifying plugin files to activate them.",
      parameters: [],
    },
    async () => {
      const plugins = await loadAllPlugins();
      const loaded = plugins.filter((p) => p.loaded).length;
      const failed = plugins.filter((p) => !p.loaded).length;
      const totalTools = plugins.reduce((sum, p) => sum + (p.loaded ? p.toolCount : 0), 0);
      return {
        output: `Plugin reload complete:\n  Loaded: ${loaded} plugin(s)\n  Failed: ${failed}\n  Total tools registered: ${totalTools}`,
      };
    },
  );

  registerTool(
    {
      name: "plugin_toggle",
      category: "utility" as const,
      description: "Enable or disable a plugin by name.",
      parameters: [
        { name: "name", type: "string", description: "Plugin name", required: true },
        { name: "enabled", type: "boolean", description: "true to enable, false to disable", required: true },
      ],
    },
    async (args) => {
      const name = String(args.name);
      const enabled = Boolean(args.enabled);
      enablePlugin(name, enabled);
      return { output: `Plugin "${name}" is now ${enabled ? "enabled ✅" : "disabled ⏸️"}. Reload plugins to apply changes.` };
    },
  );

  registerTool(
    {
      name: "plugin_template",
      category: "utility" as const,
      description:
        "Get a sample plugin template. Save it as a .js file in the plugins directory to create your own custom tools.",
      parameters: [],
    },
    async () => {
      return { output: getPluginTemplate() };
    },
  );
}
