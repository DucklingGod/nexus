// MCP (Model Context Protocol) client for Nexus.
// Connects to external MCP servers via stdio (local subprocess) or SSE (remote).
// Discovers tools from the server and dynamically registers them in the Nexus tool registry.
//
// MCP server config is stored in settings as JSON: mcp.servers
// Format: [{ id, name, type: "stdio"|"sse", command?, args?, url?, env? }]

import { ChildProcess, spawn } from "node:child_process";
import { getSetting, setSetting } from "../db/settings.ts";
import { registerTool } from "../tools/registry.ts";
import type { ToolResult } from "../tools/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  id: string;
  name: string;
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
}

export interface McpServerState {
  config: McpServerConfig;
  status: "disconnected" | "connecting" | "connected" | "error";
  tools: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const activeProcesses = new Map<string, ChildProcess>();
const serverStates = new Map<string, McpServerState>();
let nextRequestId = 1;

// Pending JSON-RPC requests waiting for responses
const pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// ---------------------------------------------------------------------------
// Config management
// ---------------------------------------------------------------------------

export function getServers(): McpServerConfig[] {
  const raw = getSetting("mcp.servers");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as McpServerConfig[];
  } catch {
    return [];
  }
}

export function saveServers(servers: McpServerConfig[]): void {
  setSetting("mcp.servers", JSON.stringify(servers));
}

export function addServer(config: Omit<McpServerConfig, "enabled"> & { enabled?: boolean }): void {
  const servers = getServers();
  const newServer: McpServerConfig = { ...config, enabled: config.enabled ?? true };
  // Replace if ID exists
  const idx = servers.findIndex((s) => s.id === config.id);
  if (idx >= 0) servers[idx] = newServer;
  else servers.push(newServer);
  saveServers(servers);
}

export function removeServer(id: string): void {
  disconnectServer(id);
  saveServers(getServers().filter((s) => s.id !== id));
}

export function toggleServer(id: string, enabled: boolean): void {
  const servers = getServers();
  const server = servers.find((s) => s.id === id);
  if (server) {
    server.enabled = enabled;
    saveServers(servers);
  }
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

function setBufferHandler(proc: ChildProcess, serverId: string): void {
  let buffer = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line) handleMessage(serverId, line);
    }
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[mcp:${serverId}] ${chunk.toString()}`);
  });
  proc.on("exit", (code) => {
    process.stderr.write(`[mcp:${serverId}] process exited with code ${code}\n`);
    activeProcesses.delete(serverId);
    const state = serverStates.get(serverId);
    if (state) {
      state.status = "disconnected";
      state.tools = [];
    }
  });
}

function handleMessage(serverId: string, line: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // not JSON, ignore
  }

  // Handle response to our request
  if (msg.id !== undefined && pendingRequests.has(Number(msg.id))) {
    const pending = pendingRequests.get(Number(msg.id))!;
    pendingRequests.delete(Number(msg.id));
    if (msg.error) {
      pending.reject(new Error(String((msg.error as { message?: string }).message ?? "MCP error")));
    } else {
      pending.resolve(msg.result);
    }
  }
}

async function sendRequest(serverId: string, method: string, params: unknown = {}): Promise<unknown> {
  const proc = activeProcesses.get(serverId);
  if (!proc || !proc.stdin || proc.killed) {
    throw new Error(`MCP server ${serverId} is not connected`);
  }

    const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    const req = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    proc.stdin?.write(req + "\n");

    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`MCP request ${method} timed out (30s)`));
      }
    }, 30000);
  });
}

export async function connectServer(id: string): Promise<McpServerState> {
  const servers = getServers();
  const config = servers.find((s) => s.id === id);
  if (!config) throw new Error(`MCP server ${id} not found`);

  // Already connected
  if (activeProcesses.has(id)) {
    return serverStates.get(id) ?? { config, status: "connected", tools: [] };
  }

  const state: McpServerState = { config, status: "connecting", tools: [] };
  serverStates.set(id, state);

  try {
    if (config.type === "stdio") {
      if (!config.command) throw new Error("stdio server requires a command");

      const proc = spawn(config.command, config.args ?? [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...config.env },
      });

      activeProcesses.set(id, proc);
      setBufferHandler(proc, id);

      // Initialize handshake
      await sendRequest(id, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "nexus", version: "0.1.0" },
      });

      // Send initialized notification (no response expected)
      const initNotif = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
      proc.stdin.write(initNotif + "\n");
    } else if (config.type === "sse") {
      // SSE: no subprocess, just verify URL is reachable
      if (!config.url) throw new Error("SSE server requires a URL");
      // For SSE we use HTTP fetch directly per-request (stateless)
    }

    // Discover tools
    const toolsResult = (await sendRequest(id, "tools/list", {})) as {
      tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[];
    } | undefined;

    const discoveredTools = toolsResult?.tools ?? [];
    state.tools = discoveredTools.map((t) => t.name);

    // Register each MCP tool in the Nexus registry
    for (const tool of discoveredTools) {
      const fullName = `mcp_${config.id}_${tool.name}`;
      registerTool(
        {
          name: fullName,
          category: "utility" as const,
          description: `[MCP:${config.name}] ${tool.description ?? tool.name}`,
          parameters: schemaToParams(tool.inputSchema),
        },
        async (args) => {
          const result = (await sendRequest(id, "tools/call", {
            name: tool.name,
            arguments: args,
          })) as { content?: { type: string; text?: string }[]; isError?: boolean } | undefined;

          const texts = (result?.content ?? [])
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text!);
          const output = texts.join("\n") || "(empty result)";

          const toolResult: ToolResult = { output };
          if (result?.isError) toolResult.error = "MCP tool returned an error";
          return toolResult;
        },
      );
    }

    state.status = "connected";
    process.stderr.write(`[mcp:${id}] Connected — ${discoveredTools.length} tools registered\n`);
    return state;
  } catch (e) {
    state.status = "error";
    state.error = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[mcp:${id}] Connection failed: ${state.error}\n`);
    return state;
  }
}

export function disconnectServer(id: string): void {
  const proc = activeProcesses.get(id);
  if (proc) {
    proc.kill();
    activeProcesses.delete(id);
  }
  const state = serverStates.get(id);
  if (state) {
    state.status = "disconnected";
    state.tools = [];
  }
}

export function getServerStates(): McpServerState[] {
  return getServers().map((config) => {
    return serverStates.get(config.id) ?? { config, status: "disconnected", tools: [] };
  });
}

/** Connect to all enabled servers on startup. */
export async function autoConnect(): Promise<void> {
  const servers = getServers().filter((s) => s.enabled);
  for (const s of servers) {
    try {
      await connectServer(s.id);
    } catch {
      // errors are captured in state
    }
  }
}

// ---------------------------------------------------------------------------
// JSON Schema → ToolParam conversion
// ---------------------------------------------------------------------------

function schemaToParams(
  schema?: Record<string, unknown>,
): import("../tools/types.ts").ToolParam[] {
  if (!schema?.properties) return [];
  const props = schema.properties as Record<string, Record<string, unknown>>;
  const required = new Set((schema.required as string[]) ?? []);

  return Object.entries(props).map(([name, prop]) => ({
    name,
    type: (prop.type as "string" | "number" | "boolean" | "array" | "object") ?? "string",
    description: (prop.description as string) ?? "",
    required: required.has(name),
    items: prop.items as Record<string, unknown> | undefined,
    properties: prop.properties as Record<string, unknown> | undefined,
  }));
}
