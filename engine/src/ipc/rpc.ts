// JSON-RPC 2.0 dispatch for the Nexus engine sidecar.
// `chat.send` is handled in ipc/stream.ts (it streams); everything else is here.
// Params are validated with zod at the engine's trust boundary (SPEC §15.6).

import { z } from "zod";
import {
  getSetting,
  setSetting,
  deleteSetting,
  getAllSettings,
  getProviderConfig,
  setProviderConfig,
  getAgentPersonality,
  setAgentPersonality,
} from "../db/settings.ts";
import { testConnection, listModels, chat } from "../providers/client.ts";
import type { ProviderConfig } from "../providers/types.ts";
import { listTools, executeTool } from "../tools/registry.ts";
import { listSkillsWithState, setSkillEnabled, addCustomSkill, deleteCustomSkill } from "../skills/skills.ts";
import { startConnector, stopConnector, connectorStatus } from "../connectors/manager.ts";
import { listWorkflows, getWorkflow, saveWorkflow, deleteWorkflow } from "../workflow/store.ts";
import { runWorkflow } from "../workflow/executor.ts";
import { importSkills } from "../skills/import.ts";
import { listContextFiles, setContextFile } from "../context/files.ts";
import { exportAgent, importAgent } from "../io/agent.ts";
import { addDocument, ingestFile, listDocuments, deleteDocument } from "../knowledge/documents.ts";
import {
  createConversation,
  updateConversation,
  listConversations,
  getConversation,
  deleteConversation,
  addMessage,
  getMessages,
  getLatestConversation,
  autoTitle,
} from "../memory/episodic.ts";
import {
  saveKnowledge,
  searchKnowledge,
  getByCategory,
  getAllKnowledge,
  deleteKnowledge,
  clearCategory,
} from "../memory/semantic.ts";
import { getUsageStats } from "../tokens/usage.ts";

export const ENGINE_VERSION = "0.1.0";

export interface RpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const Key = z.object({ key: z.string() });
const KeyValue = z.object({ key: z.string(), value: z.string() });
const ProviderSet = z.object({ provider: z.string(), model: z.string(), baseUrl: z.string().nullish() });
const ProviderCfg = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  baseUrl: z.string(),
  apiKey: z.string().nullish().default(""),
});
const Personality = z.object({
  name: z.string().nullish(),
  role: z.string().nullish(),
  tone: z.string().nullish(),
  language: z.string().nullish(),
});

/** Async request → response dispatch. */
export async function handle(req: RpcRequest): Promise<RpcResponse> {
  const base = { jsonrpc: "2.0" as const, id: req.id ?? null };
  try {
    switch (req.method) {
      case "engine.health":
        return { ...base, result: { ok: true, version: ENGINE_VERSION } };

      // Settings
      case "settings.get": {
        const { key } = Key.parse(req.params);
        return { ...base, result: { value: getSetting(key) } };
      }
      case "settings.set": {
        const { key, value } = KeyValue.parse(req.params);
        setSetting(key, value);
        return { ...base, result: { ok: true } };
      }
      case "settings.delete": {
        const { key } = Key.parse(req.params);
        deleteSetting(key);
        return { ...base, result: { ok: true } };
      }
      case "settings.getAll":
        return { ...base, result: getAllSettings() };

      // Provider config
      case "provider.get":
        return { ...base, result: getProviderConfig() };
      case "provider.set": {
        const { provider, model, baseUrl } = ProviderSet.parse(req.params);
        setProviderConfig(provider, model, baseUrl);
        return { ...base, result: { ok: true } };
      }

      // Agent personality
      case "agent.personality.get":
        return { ...base, result: getAgentPersonality() };
      case "agent.personality.set":
        setAgentPersonality(Personality.parse(req.params));
        return { ...base, result: { ok: true } };

      // Provider test / model list
      case "provider.test": {
        const cfg = ProviderCfg.parse(req.params) as ProviderConfig;
        return { ...base, result: { ok: await testConnection(cfg) } };
      }
      case "provider.listModels": {
        const cfg = ProviderCfg.parse(req.params) as ProviderConfig;
        const { models, error } = await listModels(cfg);
        return { ...base, result: { models, error } };
      }

      // Tools
      case "tools.list":
        return { ...base, result: { tools: listTools() } };
      case "skills.list":
        return { ...base, result: { skills: listSkillsWithState() } };
      case "skills.setEnabled": {
        const { id, enabled } = req.params as { id: string; enabled: boolean };
        setSkillEnabled(id, enabled);
        return { ...base, result: { ok: true } };
      }
      case "skills.create": {
        const p = req.params as { name: string; category?: string; description: string; triggers: string[]; instructions: string };
        return { ...base, result: { id: addCustomSkill(p) } };
      }
      case "skills.delete": {
        const { id } = req.params as { id: string };
        deleteCustomSkill(id);
        return { ...base, result: { ok: true } };
      }
      case "connector.start": {
        const { platform, token, config } = req.params as { platform: string; token: string; config: ProviderConfig & { model: string } };
        return { ...base, result: startConnector(platform, token, config) };
      }
      case "connector.stop": {
        const { platform } = req.params as { platform: string };
        stopConnector(platform);
        return { ...base, result: { ok: true } };
      }
      case "connector.status":
        return { ...base, result: { connectors: connectorStatus() } };
      case "workflow.list":
        return { ...base, result: { workflows: listWorkflows() } };
      case "workflow.get": {
        const { id } = req.params as { id: string };
        const w = getWorkflow(id);
        return { ...base, result: { workflow: w ? { id: w.id, name: w.name, graph: JSON.parse(w.graph) } : null } };
      }
      case "workflow.save": {
        const { id, name, graph } = req.params as { id?: string; name: string; graph: unknown };
        return { ...base, result: { id: saveWorkflow(id, name, graph) } };
      }
      case "workflow.delete": {
        const { id } = req.params as { id: string };
        deleteWorkflow(id);
        return { ...base, result: { ok: true } };
      }
      case "workflow.run": {
        const { graph, config } = req.params as {
          graph: { nodes: { id: string; data: { type: string; label?: string } }[]; edges: { source: string; target: string }[] };
          config: ProviderConfig & { model: string };
        };
        return { ...base, result: await runWorkflow(graph, config) };
      }
      case "skills.import": {
        const { dir } = (req.params ?? {}) as { dir?: string };
        return { ...base, result: importSkills(dir) };
      }
      case "context.list":
        return { ...base, result: { files: listContextFiles() } };
      case "context.set": {
        const { name, content } = req.params as { name: string; content: string };
        setContextFile(name, content);
        return { ...base, result: { ok: true } };
      }
      case "agent.export": {
        const { path } = req.params as { path: string };
        return { ...base, result: exportAgent(path) };
      }
      case "agent.import": {
        const { path } = req.params as { path: string };
        return { ...base, result: importAgent(path) };
      }
      case "complete.once": {
        const { text, system, config } = req.params as { text: string; system?: string; config: ProviderConfig & { model: string } };
        const messages = system
          ? [{ role: "system" as const, content: system }, { role: "user" as const, content: text }]
          : [{ role: "user" as const, content: text }];
        const res = await chat(config, { messages, model: config.model, maxTokens: 1024 });
        return { ...base, result: { content: res.content ?? "" } };
      }
      case "tools.execute": {
        const { name, arguments: args } = req.params as { name: string; arguments: Record<string, unknown> };
        return { ...base, result: await executeTool(name, args || {}) };
      }

      // Conversations (Episodic Memory)
      case "conversation.list": {
        const { limit } = (req.params ?? {}) as { limit?: number };
        return { ...base, result: { conversations: listConversations(limit ?? 50) } };
      }
      case "conversation.create": {
        const { id, title, provider, model } = req.params as {
          id: string;
          title?: string;
          provider?: string;
          model?: string;
        };
        createConversation(id, title ?? "New Chat", provider, model);
        return { ...base, result: { id } };
      }
      case "conversation.get": {
        const { id } = req.params as { id: string };
        const conv = getConversation(id);
        if (!conv) return { ...base, error: { code: -32001, message: "Conversation not found" } };
        const msgs = getMessages(id);
        return {
          ...base,
          result: {
            conversation: conv,
            messages: msgs.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              toolEvents: m.tool_events ? JSON.parse(m.tool_events) : undefined,
              timestamp: m.timestamp,
            })),
          },
        };
      }
      case "conversation.delete": {
        const { id } = req.params as { id: string };
        deleteConversation(id);
        return { ...base, result: { ok: true } };
      }
      case "conversation.rename": {
        const { id, title } = req.params as { id: string; title: string };
        updateConversation(id, title);
        return { ...base, result: { ok: true } };
      }
      case "conversation.addMessage": {
        const { id, conversationId, role, content, toolEvents, sortOrder } = req.params as {
          id: string;
          conversationId: string;
          role: "user" | "assistant";
          content: string;
          toolEvents?: unknown[];
          sortOrder?: number;
        };
        addMessage(id, conversationId, role, content, toolEvents, sortOrder);
        autoTitle(conversationId);
        return { ...base, result: { ok: true } };
      }
      case "conversation.latest": {
        const conv = getLatestConversation();
        if (!conv) return { ...base, result: null };
        const msgs = getMessages(conv.id);
        return {
          ...base,
          result: {
            conversation: conv,
            messages: msgs.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              toolEvents: m.tool_events ? JSON.parse(m.tool_events) : undefined,
              timestamp: m.timestamp,
            })),
          },
        };
      }

      // Knowledge base / RAG (Task 15)
      case "documents.add": {
        const { title, source, content } = req.params as { title: string; source?: string; content: string };
        return { ...base, result: addDocument(title, source ?? "manual", content) };
      }
      case "documents.ingestFile": {
        const { path, title } = req.params as { path: string; title?: string };
        return { ...base, result: await ingestFile(path, title) };
      }
      case "documents.list":
        return { ...base, result: { documents: listDocuments() } };
      case "documents.delete": {
        const { id } = req.params as { id: string };
        deleteDocument(id);
        return { ...base, result: { ok: true } };
      }

      // Tool capabilities (Task 14)
      case "tools.capabilities.get": {
        const raw = getSetting("tools.disabled");
        const disabled: string[] = raw ? JSON.parse(raw) : [];
        const all = ["web", "file", "system", "code", "utility", "knowledge"];
        return { ...base, result: { categories: all.map(c => ({ name: c, enabled: !disabled.includes(c) })) } };
      }
      case "tools.capabilities.set": {
        const { disabled } = req.params as { disabled: string[] };
        setSetting("tools.disabled", JSON.stringify(disabled));
        return { ...base, result: { ok: true } };
      }

      // Conversation search (Task 16)
      case "conversation.search": {
        const { query } = req.params as { query: string };
        const allConvs = listConversations(200);
        const q = query.toLowerCase();
        const filtered = allConvs.filter(c => c.title.toLowerCase().includes(q));
        return { ...base, result: { conversations: filtered } };
      }

      // Usage stats (Task 33)
      case "usage.stats": {
        const { days } = (req.params ?? {}) as { days?: number };
        return { ...base, result: getUsageStats(days ?? 30) };
      }

      // Knowledge (Semantic Memory)
      case "knowledge.search": {
        const { query, category } = (req.params ?? {}) as { query: string; category?: string };
        return { ...base, result: { items: searchKnowledge(query, category) } };
      }
      case "knowledge.list": {
        const { category, limit } = (req.params ?? {}) as { category?: string; limit?: number };
        const items = category ? getByCategory(category, limit) : getAllKnowledge(limit);
        return { ...base, result: { items } };
      }
      case "knowledge.save": {
        const { category, key, value, source } = req.params as {
          category: string;
          key: string;
          value: string;
          source?: string;
        };
        const id = saveKnowledge(category, key, value, source);
        return { ...base, result: { id } };
      }
      case "knowledge.delete": {
        const { id } = req.params as { id: number };
        deleteKnowledge(id);
        return { ...base, result: { ok: true } };
      }

      default:
        return { ...base, error: { code: -32601, message: `Method not found: ${req.method}` } };
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ...base, error: { code: -32602, message: `Invalid params: ${e.issues.map((i) => i.message).join("; ")}` } };
    }
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[engine] error in ${req.method}: ${message}\n`);
    return { ...base, error: { code: -32000, message } };
  }
}
