// MCP (Model Context Protocol) tools — agent-facing tools for managing MCP servers.
// These let the agent add/remove/connect to MCP servers at runtime.

import { registerTool } from "./registry.ts";
import {
  getServers,
  addServer,
  removeServer,
  connectServer,
  disconnectServer,
  getServerStates,
  toggleServer,
} from "../mcp/client.ts";

export function registerMcpTools(): void {
  registerTool(
    {
      name: "mcp_list",
      category: "utility" as const,
      description:
        "List all configured MCP (Model Context Protocol) servers and their connection status. " +
        "MCP servers extend your capabilities with external tools (databases, APIs, file systems, etc).",
      parameters: [],
    },
    async () => {
      const states = getServerStates();
      if (states.length === 0) {
        return { output: "No MCP servers configured. Use mcp_add to add one." };
      }
      const lines = states.map((s, i) => {
        const statusIcon =
          s.status === "connected" ? "🟢" :
          s.status === "connecting" ? "🟡" :
          s.status === "error" ? "🔴" : "⚪";
        const tools = s.tools.length > 0 ? ` (${s.tools.length} tools)` : "";
        const err = s.error ? ` — Error: ${s.error}` : "";
        return `${i + 1}. ${statusIcon} ${s.config.name} [${s.config.id}] — ${s.config.type}${tools}${err}`;
      });
      return { output: `MCP Servers (${states.length}):\n\n${lines.join("\n")}` };
    },
  );

  registerTool(
    {
      name: "mcp_add",
      category: "utility" as const,
      description:
        "Add and connect to an MCP server. Two types:\n" +
        "  • stdio — runs a local subprocess (e.g. npx -y @modelcontextprotocol/server-sqlite)\n" +
        "  • sse — connects to a remote HTTP/SSE endpoint",
      parameters: [
        { name: "id", type: "string", description: "Unique server ID (lowercase, no spaces)", required: true },
        { name: "name", type: "string", description: "Human-readable name", required: true },
        {
          name: "type",
          type: "string",
          description: '"stdio" or "sse"',
          required: true,
        },
        {
          name: "command",
          type: "string",
          description: 'For stdio: the command to run (e.g. "npx", "node", "python3")',
        },
        {
          name: "args",
          type: "array",
          description: "For stdio: command arguments (e.g. [\"-y\", \"@modelcontextprotocol/server-sqlite\", \"path/to/db.sqlite\"])",
          items: { type: "string" },
        },
        {
          name: "url",
          type: "string",
          description: "For sse: the server URL endpoint",
        },
        {
          name: "env",
          type: "object",
          description: "Environment variables for the server process",
          properties: {},
        },
      ],
    },
    async (args) => {
      const id = String(args.id);
      const name = String(args.name);
      const type = String(args.type) as "stdio" | "sse";

      addServer({
        id,
        name,
        type,
        command: args.command ? String(args.command) : undefined,
        args: args.args as string[] | undefined,
        url: args.url ? String(args.url) : undefined,
        env: args.env as Record<string, string> | undefined,
        enabled: true,
      });

      // Try to connect immediately
      const state = await connectServer(id);
      if (state.status === "error") {
        return { output: `Added MCP server "${name}" but connection failed: ${state.error}` };
      }
      return {
        output: `✅ MCP server "${name}" added and connected!\nType: ${type}\nTools: ${state.tools.length} — ${state.tools.join(", ") || "(none)"}`,
      };
    },
  );

  registerTool(
    {
      name: "mcp_remove",
      category: "utility" as const,
      description: "Remove an MCP server and disconnect from it.",
      parameters: [
        { name: "id", type: "string", description: "Server ID to remove", required: true },
      ],
    },
    async (args) => {
      const id = String(args.id);
      removeServer(id);
      return { output: `Removed MCP server: ${id}` };
    },
  );

  registerTool(
    {
      name: "mcp_connect",
      category: "utility" as const,
      description: "Connect (or reconnect) to an MCP server. Discovers and registers its tools.",
      parameters: [
        { name: "id", type: "string", description: "Server ID to connect", required: true },
      ],
    },
    async (args) => {
      const id = String(args.id);
      disconnectServer(id); // disconnect first if already connected
      const state = await connectServer(id);
      if (state.status === "error") {
        return { output: `Connection failed: ${state.error}` };
      }
      return { output: `✅ Connected to ${state.config.name}\nTools: ${state.tools.length} — ${state.tools.join(", ") || "(none)"}` };
    },
  );

  registerTool(
    {
      name: "mcp_disconnect",
      category: "utility" as const,
      description: "Disconnect from an MCP server.",
      parameters: [
        { name: "id", type: "string", description: "Server ID to disconnect", required: true },
      ],
    },
    async (args) => {
      disconnectServer(String(args.id));
      return { output: `Disconnected.` };
    },
  );
}
