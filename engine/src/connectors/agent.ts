// Agent runner for platform connectors (Telegram/Discord). Non-streaming: takes a
// user message, runs a short tool-using loop, returns the final reply text + attachments.
//
// Features (matching main stream.ts):
//   - Full system prompt with env context + tool guides + context files
//   - Auto-continue (agent keeps working until task is complete)
//   - Memory auto-extraction after substantial tasks
//   - send_file support (collects file paths for delivery)
//   - Up to 10 rounds (was 3)

import type { ProviderConfig, ChatMessage } from "../providers/types.ts";
import { chat } from "../providers/client.ts";
import { listToolsForLLM, executeTool, getTool, listToolsText } from "../tools/registry.ts";
import { getAgentPersonality } from "../db/settings.ts";
import { formatEnvContext } from "../system/context.ts";
import { injectContext } from "../context/files.ts";
import { looksUnfinished, MAX_AUTO_CONTINUE, CONTINUE_NUDGE } from "../ipc/autocontinue.ts";

export type ConnectorConfig = ProviderConfig & { model: string };

/** Result from connector agent — text reply + file paths to deliver. */
export interface ConnectorResult {
  text: string;
  attachments: string[];
}

const MAX_ROUNDS = 10;

function systemPrompt(platform: string): string {
  const p = getAgentPersonality();
  const parts: string[] = [];

  // Identity
  parts.push(`You are ${p.name || "Nexus"}${p.role ? `, ${p.role}` : ""}.`);
  if (p.tone) parts.push(`Tone: ${p.tone}.`);
  if (p.language) parts.push(`Always respond in ${p.language}.`);
  if (p.instructions) parts.push(p.instructions);

  // Platform context
  parts.push(`You are replying to a user on ${platform}. Keep replies concise and chat-friendly.`);

  // Act, don't narrate
  parts.push(`Complete the user's request by actually calling the tools you need BEFORE you reply — do not describe what you would do or say "let me…" and stop; perform the steps, then send one final answer.`);

  // Critical reminder about tools
  parts.push(`IMPORTANT: You have MANY tools available (see the tool list below). Always use them — never tell the user you "don't have access" to something without checking the tool list first. For date/time questions, check the environment context section which includes the current date.`);

  // File delivery mandate
  parts.push(`When you create a file, use the send_file tool to deliver it to the user immediately. Never just tell the user a file was created — send it.`);

  // Efficiency rules
  parts.push(`Never check environment details (Python, Node, OS) unless the task specifically requires it — assume they are available and working. Start working on the task immediately.`);
  parts.push(`Never ask for confirmation before doing something the user clearly asked for. Just do it.`);

  // Communication style
  parts.push(`Keep replies under 500 words unless the user asks for detail. Use paragraphs and line breaks for readability. On ${platform}, messages over 4000 chars are split into multiple messages.`);

  return parts.join(" ");
}

function safeTools(): object[] {
  return listToolsForLLM().filter((t) => {
    const name = (t as { function?: { name?: string } }).function?.name;
    // Exclude dangerous tools and all delegation tools (sub-agents must not delegate again).
    return name
      ? (!["delegate", "delegate_task", "delegate_batch", "mixture_of_agents"].includes(name) && !getTool(name)?.def.dangerous)
      : true;
  });
}

/** Build the enhanced system prompt: identity + a compact, safe-scoped tool
 *  inventory + env context. We deliberately skip the full per-tool guides here
 *  (~1-2k lines): weak connector models drown in them, and the structured tools
 *  array already carries full call schemas. The inventory is placed EARLY so the
 *  model sees its real capabilities before anything else. */
function buildEnhancedPrompt(platform: string): string {
  const parts: string[] = [systemPrompt(platform)];

  // Names of the tools we actually pass to the model (safe subset), so the
  // inventory never advertises a tool the connector can't call.
  const safeNames = new Set(
    safeTools()
      .map((t) => (t as { function?: { name?: string } }).function?.name)
      .filter((n): n is string => Boolean(n)),
  );

  // Compact tool inventory, scoped to the safe tools, up front.
  try {
    const toolText = listToolsText((name) => safeNames.has(name));
    if (toolText) parts.push(toolText);
  } catch { /* ignore */ }

  // Environment context (OS, shell, current date/time)
  try {
    const envText = formatEnvContext();
    if (envText) parts.push(envText);
  } catch { /* ignore */ }

  return parts.join("\n\n");
}

/** Collect file paths from send_file tool calls in the conversation. */
function collectAttachments(messages: ChatMessage[]): string[] {
  const attachments: string[] = [];
  for (const msg of messages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      // Check for send_file result patterns
      const match = msg.content.match(/\[Tool send_file result\]\n(?:File sent: )?(.+?)(?:\n|$)/);
      if (match) {
        const path = match[1].trim();
        if (path && !attachments.includes(path)) attachments.push(path);
      }
    }
  }
  return attachments;
}

export async function runConnectorAgent(config: ConnectorConfig, history: ChatMessage[], platform: string): Promise<ConnectorResult> {
  // Build enhanced system prompt with all context
  const systemContent = buildEnhancedPrompt(platform);

  // Inject persistent context files (rules, soul, user, memory, context)
  let messages: ChatMessage[] = injectContext([
    { role: "system", content: systemContent },
    ...history,
  ]);

  const tools = safeTools();
  const attachments: string[] = [];
  let autoContinueCount = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await chat(config, { messages, model: config.model, tools, maxTokens: 2048 });

    if (!res.tool_calls?.length) {
      // No tool calls — check if the agent looks unfinished
      const replyText = res.content || "(no response)";

      if (autoContinueCount < MAX_AUTO_CONTINUE && looksUnfinished(replyText)) {
        // Nudge the agent to continue
        autoContinueCount++;
        messages.push({ role: "assistant", content: replyText });
        messages.push({ role: "user", content: CONTINUE_NUDGE });
        continue; // Another round
      }

      // Collect any send_file paths from the conversation
      const allAttachments = collectAttachments(messages);
      return { text: replyText, attachments: allAttachments };
    }

    // Reset auto-continue counter when tools are used (progress is being made)
    autoContinueCount = 0;

    messages.push({ role: "assistant", content: res.content || "" });

    for (const tc of res.tool_calls) {
      const result = await executeTool(tc.name, (tc.arguments ?? {}) as Record<string, unknown>);
      messages.push({
        role: "user",
        content: `[Tool ${tc.name} result]\n${(result.output || "").slice(0, 2000)}${result.error ? `\nError: ${result.error}` : ""}`,
      });

      // Track send_file results for attachment delivery
      if (tc.name === "send_file" && result.output) {
        const pathMatch = result.output.match(/(?:File sent: |sent to user: )(.+?)(?:\n|$)/);
        if (pathMatch) {
          const filePath = pathMatch[1].trim();
          if (filePath && !attachments.includes(filePath)) attachments.push(filePath);
        }
      }
    }
  }

  // Max rounds reached — get a final answer
  const final = await chat(config, { messages, model: config.model, maxTokens: 2048 });
  const allAttachments = [...attachments, ...collectAttachments(messages)];
  return { text: final.content || "(no response)", attachments: allAttachments };
}
