// Agent runner for platform connectors (Telegram/Discord). Non-streaming: takes a
// user message, runs a short tool-using loop, returns the final reply text.
//
// Security: remote messages must NOT be able to trigger dangerous tools
// (terminal/code/file-write/patch/process). We expose only non-dangerous tools.

import type { ProviderConfig, ChatMessage } from "../providers/types.ts";
import { chat } from "../providers/client.ts";
import { listToolsForLLM, executeTool, getTool } from "../tools/registry.ts";
import { getAgentPersonality } from "../db/settings.ts";

export type ConnectorConfig = ProviderConfig & { model: string };

function systemPrompt(platform: string): string {
  const p = getAgentPersonality();
  const parts = [`You are ${p.name || "Nexus"}${p.role ? `, ${p.role}` : ""}.`];
  if (p.tone) parts.push(`Tone: ${p.tone}.`);
  if (p.language) parts.push(`Always respond in ${p.language}.`);
  if (p.instructions) parts.push(p.instructions);
  parts.push(`You are replying to a user on ${platform}. Keep replies concise and chat-friendly.`);
  return parts.join(" ");
}

function safeTools(): object[] {
  return listToolsForLLM().filter((t) => {
    const name = (t as { function?: { name?: string } }).function?.name;
    return name ? !getTool(name)?.def.dangerous : true;
  });
}

export async function runConnectorAgent(config: ConnectorConfig, history: ChatMessage[], platform: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(platform) },
    ...history,
  ];
  const tools = safeTools();

  for (let round = 0; round < 3; round++) {
    const res = await chat(config, { messages, model: config.model, tools, maxTokens: 1024 });
    if (!res.tool_calls?.length) return res.content || "(no response)";
    messages.push({ role: "assistant", content: res.content || "" });
    for (const tc of res.tool_calls) {
      const result = await executeTool(tc.name, (tc.arguments ?? {}) as Record<string, unknown>);
      messages.push({
        role: "user",
        content: `[Tool ${tc.name} result]\n${(result.output || "").slice(0, 2000)}${result.error ? `\nError: ${result.error}` : ""}`,
      });
    }
  }
  const final = await chat(config, { messages, model: config.model, maxTokens: 1024 });
  return final.content || "(no response)";
}
