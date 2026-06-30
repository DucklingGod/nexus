import { chatStream } from "../providers/client.ts";
import type { ChatMessage, ProviderConfig, StreamToolCallDelta } from "../providers/types.ts";
import type { RpcRequest } from "./rpc.ts";
import { listToolsForLLM, executeTool, getTool } from "../tools/registry.ts";
import { requestApproval } from "../tools/approval.ts";
import { getSetting } from "../db/settings.ts";
import { augmentWithContext } from "../knowledge/documents.ts";
import { recordTokenUsage } from "../tokens/usage.ts";
import { estimateTokens } from "../tokens/budget.ts";
import { maybeRouteModel } from "../tokens/router.ts";
import { isCacheable, getCachedResponse, saveCachedResponse } from "../tokens/semanticCache.ts";
import { matchSkillsAsync, injectSkills, synthesizeSkill } from "../skills/skills.ts";
import { setWebKeys } from "../tools/web.ts";
import { injectContext, isUserOnboarded } from "../context/files.ts";
import { isAutoExtractEnabled, autoExtract } from "../context/autoExtract.ts";

const MAX_TOOL_ROUNDS = 5;

interface AccumulatedToolCall {
  id?: string;
  name?: string;
  arguments: string;
}

/// `chat.send` streams tokens as `chat.delta` notifications, then returns the
/// final response. When tools are available, runs a streaming agent loop:
/// LLM (streaming) → tool_call → execute → feed result → LLM again (up to 5 rounds).
export async function streamChat(
  req: RpcRequest,
  send: (obj: unknown) => void,
): Promise<void> {
  const { messages, model: requestedModel, reasoningEffort, webKeys, safetyMode, ...config } = req.params as {
    messages: ChatMessage[];
    model: string;
    reasoningEffort?: "low" | "medium" | "high" | "max";
    webKeys?: { tavily?: string; brave?: string };
    safetyMode?: string;
  } & ProviderConfig;
  setWebKeys(webKeys);
  const maxTokens = Number(getSetting("model.maxTokens")) || undefined;
  // Smart model routing (Task 31): route simpler messages to a cheaper model.
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const model = maybeRouteModel(config.baseUrl ?? "", requestedModel, lastUserMsg, send);

  // Semantic cache (Task 30): serve a cached answer for a repeated standalone question.
  const cacheable = getSetting("cache.enabled") === "true" && isCacheable(messages);
  if (cacheable) {
    const cached = await getCachedResponse(lastUserMsg, config).catch(() => null);
    if (cached) {
      send({ jsonrpc: "2.0", method: "chat.delta", params: { token: cached } });
      send({ jsonrpc: "2.0", method: "chat.cached", params: {} });
      send({ jsonrpc: "2.0", id: req.id, result: { content: cached, model, usage: { input: 0, output: 0 } } });
      return;
    }
  }

  // Skills (procedural memory): auto-pick skills matching this task; their
  // procedures are injected into the system prompt below (default on).
  const matchedSkills = getSetting("skills.enabled") === "false" ? [] : await matchSkillsAsync(lastUserMsg, config, 2);
  if (matchedSkills.length > 0) {
    send({ jsonrpc: "2.0", method: "chat.skills", params: { skills: matchedSkills.map((s) => s.name) } });
  }
  // RAG document context, then skill instructions — both into the system prompt.
  const ragMessages = injectContext(injectSkills(
    await augmentWithContext(messages, config).catch(() => messages),
    matchedSkills,
  ));

  // First-run onboarding: if user.md is empty (no real content), prepend an
  // onboarding instruction so the agent introduces itself and gets to know the user.
  if (!isUserOnboarded()) {
    const onboardMsg: ChatMessage = {
      role: "system",
      content: `This is the user's first conversation with you. Greet them warmly, introduce yourself briefly, then ask them to tell you about themselves — their name, what they do, and what they hope to use you for. After they respond, use the 'remember' tool to save their details to the 'user' file. Keep it natural and conversational, not like a form.`,
    };
    // Insert after existing system messages
    const lastSysIdx = ragMessages.map((m, i) => m.role === "system" ? i : -1).filter(i => i >= 0).pop() ?? -1;
    ragMessages.splice(lastSysIdx + 1, 0, onboardMsg);
  }

  try {
    const tools = listToolsForLLM();
    const hasTools = tools.length > 0;

    if (hasTools) {
      const result = await agentLoop(config, ragMessages, model, tools, send, maxTokens, reasoningEffort, safetyMode);
      if (result) {
        send({ jsonrpc: "2.0", id: req.id, result: { content: result.text, model, usage: { input: result.inputTokens, output: result.outputTokens } } });
        if (cacheable && !result.usedTools) void saveCachedResponse(lastUserMsg, result.text, config).catch(() => {});
        // Auto-skill creation: distill a reusable skill from substantial tasks (opt-in).
        if (result.usedTools && getSetting("skills.autoCreate") === "true") {
          void synthesizeSkill(config, [...messages, { role: "assistant", content: result.text }], model)
            .then((s) => { if (s) send({ jsonrpc: "2.0", method: "chat.skill_created", params: { id: s.id, name: s.name } }); })
            .catch(() => {});
        }
        // Auto-extract: distill durable facts into .md context files (opt-in).
        if (isAutoExtractEnabled()) {
          void autoExtract(config, [...messages, { role: "assistant", content: result.text }], model).catch(() => {});
        }
      }
      return;
    }

    // No tools — simple streaming
    let full = "";
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const chunk of chatStream(config, { messages: ragMessages, model, maxTokens, reasoningEffort })) {
      if (chunk.reasoning) {
        send({ jsonrpc: "2.0", method: "chat.reasoning.delta", params: { token: chunk.reasoning } });
      }
      if (chunk.delta) {
        full += chunk.delta;
        send({ jsonrpc: "2.0", method: "chat.delta", params: { token: chunk.delta } });
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.input ?? 0;
        outputTokens = chunk.usage.output ?? 0;
      }
    }
    if (inputTokens > 0 || outputTokens > 0) {
      recordTokenUsage({ model, provider: config.id, input_tokens: inputTokens, output_tokens: outputTokens });
    } else {
      const inputText = ragMessages.map(m => m.content).join(" ");
      const estInput = estimateTokens(inputText);
      const estOutput = estimateTokens(full);
      recordTokenUsage({ model, provider: config.id, input_tokens: estInput, output_tokens: estOutput });
      inputTokens = estInput;
      outputTokens = estOutput;
    }
    send({ jsonrpc: "2.0", id: req.id, result: { content: full, model, usage: { input: inputTokens, output: outputTokens } } });
    if (cacheable) void saveCachedResponse(lastUserMsg, full, config).catch(() => {});
    // Auto-extract: distill durable facts into .md context files (opt-in).
    if (isAutoExtractEnabled()) {
      void autoExtract(config, [...messages, { role: "assistant", content: full }], model).catch(() => {});
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    send({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message } });
  }
}

// Streaming agent loop: streams text to the UI in real-time, accumulates
// tool_call deltas from the SSE stream, executes tools, loops up to MAX_TOOL_ROUNDS.
async function agentLoop(
  config: ProviderConfig,
  messages: ChatMessage[],
  model: string,
  tools: object[],
  send: (obj: unknown) => void,
  maxTokens?: number,
  reasoningEffort?: "low" | "medium" | "high" | "max",
  safetyMode?: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number; usedTools: boolean } | null> {
  const history = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    // Accumulate tool_call fragments by index
    const toolCallMap = new Map<number, AccumulatedToolCall>();

    for await (const chunk of chatStream(config, { messages: history, model, tools, maxTokens, reasoningEffort })) {
      // Stream reasoning/thinking tokens to UI
      if (chunk.reasoning) {
        send({ jsonrpc: "2.0", method: "chat.reasoning.delta", params: { token: chunk.reasoning } });
      }
      // Stream text deltas to UI in real-time
      if (chunk.delta) {
        fullText += chunk.delta;
        send({ jsonrpc: "2.0", method: "chat.delta", params: { token: chunk.delta } });
      }
      // Accumulate streaming tool_call fragments
      if (chunk.tool_calls) {
        for (const tc of chunk.tool_calls) {
          if (!toolCallMap.has(tc.index)) {
            toolCallMap.set(tc.index, { id: tc.id, name: tc.function?.name, arguments: "" });
          }
          const acc = toolCallMap.get(tc.index)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
        }
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.input ?? 0;
        outputTokens = chunk.usage.output ?? 0;
      }
    }

    // Record usage for this round
    if (inputTokens > 0 || outputTokens > 0) {
      recordTokenUsage({ model, provider: config.id, input_tokens: inputTokens, output_tokens: outputTokens });
    }

    // No tool calls — we're done, text was already streamed
    if (toolCallMap.size === 0) {
      return { text: fullText, inputTokens, outputTokens, usedTools: round > 0 };
    }

    // Has tool calls — execute each one
    history.push({ role: "assistant", content: fullText });

    const toolCalls = Array.from(toolCallMap.values());
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const name = tc.name!;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.arguments || "{}");
      } catch {
        args = {};
      }
      const id = tc.id || `call_${Date.now()}`;

      // Notify frontend about tool execution
      send({ jsonrpc: "2.0", method: "chat.tool_call", params: { id, name, arguments: args } });

      // Dangerous tools gated by the chosen safety mode (SPEC §15.4):
      //   ask  → confirm every change (default)   full → run everything
      //   auto → file edits auto, others confirm    plan → don't change, plan only
      const def = getTool(name)?.def;
      const dangerous = !!def?.dangerous;
      let approved: boolean;
      if (!dangerous) approved = true;
      else if (safetyMode === "full") approved = true;
      else if (safetyMode === "plan") approved = false;
      else if (safetyMode === "auto") approved = def?.category === "file" ? true : await requestApproval(id, name, args, send);
      else approved = await requestApproval(id, name, args, send);
      const result = approved
        ? await executeTool(name, args)
        : { output: "", error: safetyMode === "plan" ? "Plan mode — change not executed (planning only)." : "Denied by user — tool not executed.", elapsed_ms: 0 };

      // Notify frontend about tool result
      send({ jsonrpc: "2.0", method: "chat.tool_result", params: { id, name, output: result.output.slice(0, 2000), error: result.error, elapsed_ms: result.elapsed_ms } });

      // Add tool result to history
      history.push({
        role: "user",
        content: `[Tool Result: ${name}]\n${result.output.slice(0, 4000)}${result.error ? `\nError: ${result.error}` : ""}`,
      });
    }
  }

  // Max rounds reached — final streaming without tools
  let full = "";
  for await (const chunk of chatStream(config, { messages: history, model, maxTokens })) {
    if (chunk.delta) {
      full += chunk.delta;
      send({ jsonrpc: "2.0", method: "chat.delta", params: { token: chunk.delta } });
    }
  }
  return { text: full, inputTokens: 0, outputTokens: 0, usedTools: true };
}
