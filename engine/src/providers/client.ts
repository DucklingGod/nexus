// ponytail: ONE implementation for ALL OpenAI-compatible APIs
// OpenAI, OpenRouter, DeepSeek, xAI, MiniMax, Kimi, DashScope, Xiaomi, Ollama, LM Studio — ALL same format
// Anthropic + Google have different formats but we handle them via adapter

import type { ProviderConfig, ChatRequest, ChatResponse, StreamChunk, StreamToolCallDelta, ModelInfo, ChatMessage } from "./types.ts";

// ── Vision (Task 58): per-provider message content shape ────────────────────
// Messages without images keep their plain string content unchanged (every
// provider accepts that); only messages with `images` get the richer
// multipart content array each API expects.

function toOpenAIMessage(m: ChatMessage): { role: string; content: unknown } {
  if (!m.images?.length) return { role: m.role, content: m.content };
  const parts: object[] = [];
  if (m.content) parts.push({ type: "text", text: m.content });
  for (const img of m.images) parts.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
  return { role: m.role, content: parts };
}

function toAnthropicMessage(m: ChatMessage): { role: string; content: unknown } {
  if (!m.images?.length) return { role: m.role, content: m.content };
  const parts: object[] = [];
  if (m.content) parts.push({ type: "text", text: m.content });
  for (const img of m.images) parts.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  return { role: m.role, content: parts };
}

function toGoogleParts(m: ChatMessage): object[] {
  const parts: object[] = [];
  if (m.content) parts.push({ text: m.content });
  for (const img of m.images ?? []) parts.push({ inline_data: { mime_type: img.mediaType, data: img.data } });
  return parts;
}

/**
 * Stateful streaming filter that strips pseudo-tag blocks from content that
 * some models emit as plain text instead of using the API's structured fields:
 *   • `<think>...</think>`    → surfaced as reasoning (Qwen-QwQ, DeepSeek-R1, Nemotron)
 *   • `<tool_call>...</tool_call>` → dropped (text-form tool calls are never
 *     actionable; only structured tool_calls are honored by the agent loop)
 *
 * Handles tags split across chunk boundaries by buffering the tail of each
 * feed() call. Cheap: a single regex pass over the incoming text each call.
 */
export class ContentTagFilter {
  private buf = "";
  // Current open block: "think" | "tool_call" | null (normal text)
  private mode: "think" | "tool_call" | null = null;

  feed(chunk: string): { text: string; reasoning?: string } {
    this.buf += chunk;
    let text = "";
    let reasoning = "";
    // Process until no more complete decisions can be made.
    // We loop because a single chunk can contain multiple blocks.
    // Safety cap to avoid pathological loops.
    for (let guard = 0; guard < 50; guard++) {
      if (this.mode === null) {
        // Look for an opening tag.
        const thinkOpen = this.buf.indexOf("<think>");
        const toolOpen = this.buf.indexOf("<tool_call>");
        const nextOpen = thinkOpen === -1 ? toolOpen : (toolOpen === -1 ? thinkOpen : Math.min(thinkOpen, toolOpen));
        if (nextOpen === -1) {
          // No opening tag. But the tail might be the start of one (e.g. "<to"),
          // so hold back the last few chars to avoid splitting a tag.
          const safe = this.safeText(this.buf);
          text += safe.text;
          this.buf = safe.held;
          break;
        }
        // Emit text before the tag, then enter the block.
        text += this.safeText(this.buf.slice(0, nextOpen)).text;
        this.buf = this.buf.slice(nextOpen);
        this.mode = this.buf.startsWith("<think>") ? "think" : "tool_call";
        // Consume the opening tag.
        this.buf = this.buf.slice(this.buf.indexOf(">") + 1);
        continue;
      }
      // Inside a block — look for its closing tag.
      const closeTag = this.mode === "think" ? "</think>" : "</tool_call>";
      const closeIdx = this.buf.indexOf(closeTag);
      if (closeIdx === -1) {
        // Block not closed yet. Emit everything that can't be part of a split
        // close tag, holding back ONLY the longest tail that is a prefix of the
        // close tag (e.g. "</thin" of "</think>"). A fixed (closeTag.length-1)
        // holdback would wrongly withhold trailing reasoning that can't be a
        // partial tag at all (e.g. "...thought" — no suffix begins "</").
        const holdLen = this.prefixHoldLen(this.buf, closeTag);
        const emitEnd = this.buf.length - holdLen;
        const safe = this.buf.slice(0, emitEnd);
        if (this.mode === "think") reasoning += safe;
        this.buf = this.buf.slice(emitEnd);
        break;
      }
      // Block closed. Emit inner content, drop the close tag.
      const inner = this.buf.slice(0, closeIdx);
      if (this.mode === "think") reasoning += inner;
      this.buf = this.buf.slice(closeIdx + closeTag.length);
      this.mode = null;
      // loop again — there may be more blocks or trailing text
      continue;
    }
    return { text, reasoning: reasoning || undefined };
  }

  /** Flush any remaining buffer at stream end. */
  flush(): { text: string; reasoning?: string } {
    // If we ended inside a think block (unclosed), surface it as reasoning.
    if (this.mode === "think") {
      const reasoning = this.buf;
      this.buf = "";
      this.mode = null;
      return { text: "", reasoning };
    }
    const text = this.buf;
    this.buf = "";
    this.mode = null;
    return { text };
  }

  /** Emit all text that cannot be the prefix of a tag; hold the ambiguous tail. */
  private safeText(s: string): { text: string; held: string } {
    // The longest tag we track is "<tool_call>" (11 chars). Hold back up to 10
    // trailing chars that could be the start of "<...".
    const cut = Math.max(0, s.length - 11);
    // Only hold back if the tail looks like a partial tag (starts with '<').
    for (let i = s.length - 1; i >= 0 && i >= cut; i--) {
      if (s[i] === "<") {
        return { text: s.slice(0, i), held: s.slice(i) };
      }
    }
    return { text: s, held: "" };
  }

  /** Longest suffix of `s` that is a (proper) prefix of `tag` — how many trailing
   * chars to hold back in case a close tag is split across stream chunks. 0 when
   * the tail can't begin the tag, so unambiguous content streams immediately. */
  private prefixHoldLen(s: string, tag: string): number {
    const max = Math.min(s.length, tag.length - 1);
    for (let k = max; k > 0; k--) {
      if (s.endsWith(tag.slice(0, k))) return k;
    }
    return 0;
  }
}

/// List available models. Adapts per provider — mirrors chat()'s detection below.
/// Returns { models } on success; { models: [], error } when the call fails so the
/// UI can show "no models" vs "your key/request is wrong" instead of failing silently.
export async function listModels(config: ProviderConfig): Promise<{ models: ModelInfo[]; error?: string }> {
  if (config.baseUrl.includes("anthropic.com")) return listModelsAnthropic(config);
  if (config.baseUrl.includes("generativelanguage.googleapis.com")) return listModelsGoogle(config);
  if (config.baseUrl.includes("openrouter.ai")) return listModelsOpenRouter(config);
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    process.stderr.write(`[listModels] url=${config.baseUrl}/models apiKey_len=${config.apiKey?.length ?? 0} apiKey_empty=${!config.apiKey}
`);
    const res = await fetch(`${config.baseUrl}/models`, { headers });
    if (!res.ok) return { models: [], error: `${res.status} ${res.statusText}` };
    const data = await res.json();
    const models = data.data ?? data.models ?? [];
    return {
      models: models.map((m: { id: string; name?: string }) => ({
        id: m.id,
        name: m.name ?? m.id,
      })),
    };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/// Anthropic: x-api-key + anthropic-version headers, { data: [{ id, display_name }] }
async function listModelsAnthropic(config: ProviderConfig): Promise<{ models: ModelInfo[]; error?: string }> {
  try {
    const res = await fetch(`${config.baseUrl}/models`, {
      headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) return { models: [], error: `${res.status} ${res.statusText}` };
    const data = await res.json();
    return {
      models: (data.data ?? []).map((m: { id: string; display_name?: string }) => ({
        id: m.id,
        name: m.display_name ?? m.id,
      })),
    };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/// Google: key in query string, names come back as "models/<id>", filter to chat-capable.
async function listModelsGoogle(config: ProviderConfig): Promise<{ models: ModelInfo[]; error?: string }> {
  try {
    const res = await fetch(`${config.baseUrl}/models?key=${config.apiKey}`);
    if (!res.ok) return { models: [], error: `${res.status} ${res.statusText}` };
    const data = await res.json();
    return {
      models: (data.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: { name: string; displayName?: string }) => {
          const id = m.name.replace(/^models\//, "");
          return { id, name: m.displayName ?? id };
        }),
    };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/// OpenRouter: fetch models with pricing info — mark free models (prompt price = "0").
async function listModelsOpenRouter(config: ProviderConfig): Promise<{ models: ModelInfo[]; error?: string }> {
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    const res = await fetch(`${config.baseUrl}/models`, { headers });
    if (!res.ok) return { models: [], error: `${res.status} ${res.statusText}` };
    const data = await res.json();
    const models = (data.data ?? []) as Array<{
      id: string;
      name?: string;
      pricing?: { prompt?: string; completion?: string };
      supported_parameters?: string[];
    }>;
    return {
      models: models
        .map(m => {
          const promptPrice = m.pricing?.prompt ?? "1";
          const isFree = promptPrice === "0" || promptPrice === "0.00" || promptPrice === "0.000000";
          // OpenRouter advertises 'tools' in supported_parameters when the model
          // natively supports function-calling. Free models without it will emit
          // <tool_call> text blobs if sent a tools array — so we track this to
          // decide whether to enable the agent loop for a given model.
          const supportsTools = Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools");
          return {
            id: m.id,
            name: m.name ?? m.id,
            isFree,
            supportsTools,
            pricing: m.pricing ? { prompt: m.pricing.prompt ?? "0", completion: m.pricing.completion ?? "0" } : undefined,
          };
        })
        .sort((a, b) => {
          // Free first, then alphabetical
          if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
          return a.id.localeCompare(b.id);
        }),
    };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/// Test connection to any OpenAI-compatible endpoint
export async function testConnection(config: ProviderConfig): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
    process.stderr.write(`[listModels] url=${config.baseUrl}/models apiKey_len=${config.apiKey?.length ?? 0} apiKey_empty=${!config.apiKey}
`);
    const res = await fetch(`${config.baseUrl}/models`, { headers });
    return res.ok;
  } catch {
    return false;
  }
}

/// Chat with any OpenAI-compatible endpoint
export async function chat(config: ProviderConfig, req: ChatRequest): Promise<ChatResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  // Anthropic adapter: different API format
  if (config.baseUrl.includes("anthropic.com")) {
    return chatAnthropic(config, req, headers);
  }

  // Google adapter: different API format
  if (config.baseUrl.includes("generativelanguage.googleapis.com")) {
    return chatGoogle(config, req);
  }

  // Standard OpenAI-compatible
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map(toOpenAIMessage),
    max_tokens: req.maxTokens ?? 1024,
  };
  if (req.tools?.length) body.tools = req.tools;
  if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;

  // Parse tool_calls if present
  const tool_calls = msg?.tool_calls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || "{}"),
  }));

  return {
    content: msg?.content ?? "",
    model: data.model ?? req.model,
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
    },
    tool_calls: tool_calls?.length ? tool_calls : undefined,
  };
}

/// Stream with any OpenAI-compatible endpoint
export async function* chatStream(config: ProviderConfig, req: ChatRequest): AsyncGenerator<StreamChunk> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  // Anthropic adapter
  if (config.baseUrl.includes("anthropic.com")) {
    yield* chatStreamAnthropic(config, req, headers);
    return;
  }

  // Google adapter
  if (config.baseUrl.includes("generativelanguage.googleapis.com")) {
    yield* chatStreamGoogle(config, req);
    return;
  }

  // Standard OpenAI-compatible streaming
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map(toOpenAIMessage),
    max_tokens: req.maxTokens ?? 1024,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.tools?.length) body.tools = req.tools;
  if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  // Stateful filter: strips <think>/<tool_call> pseudo-tags from content that
  // some models emit as text (free OpenRouter models, Qwen-QwQ, Nemotron).
  // <think> is surfaced as reasoning; <tool_call> is dropped (the agent loop
  // only honors structured tool_calls, so the text form is never actionable).
  const tagFilter = new ContentTagFilter();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        // Flush any trailing buffered text (e.g. an unclosed think block).
        const { text, reasoning } = tagFilter.flush();
        if (reasoning) yield { delta: "", done: false, reasoning };
        if (text) yield { delta: text, done: false };
        yield { delta: "", done: true };
        return;
      }
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        const content = delta?.content ?? "";
        // Reasoning tokens: OpenAI o1/o3 send reasoning_content in delta
        const reasoning = delta?.reasoning_content ?? "";
        if (reasoning) yield { delta: "", done: false, reasoning };
        if (content) {
          const { text, reasoning: thinkReasoning } = tagFilter.feed(content);
          if (thinkReasoning) yield { delta: "", done: false, reasoning: thinkReasoning };
          if (text) yield { delta: text, done: false };
        }
        // Parse streaming tool_calls (OpenAI sends them as delta chunks)
        if (delta?.tool_calls) {
          yield { delta: "", done: false, tool_calls: delta.tool_calls as StreamToolCallDelta[] };
        }
        // Parse usage from final chunk (stream_options.include_usage)
        if (parsed.usage) {
          yield { delta: "", done: false, usage: { input: parsed.usage.prompt_tokens ?? 0, output: parsed.usage.completion_tokens ?? 0 } };
        }
      } catch {
        // skip malformed chunks
      }
    }
  }
  yield { delta: "", done: true };
}

// --- Anthropic adapter ---

// Mark the system prompt as a cacheable prefix so Anthropic reuses it across
// turns (prompt caching, Task 29). Below the model's minimum cacheable size this
// is simply ignored — no error and no extra cost.
function anthropicSystem(content: string) {
  return [{ type: "text" as const, text: content, cache_control: { type: "ephemeral" as const } }];
}

async function chatAnthropic(config: ProviderConfig, req: ChatRequest, headers: Record<string, string>): Promise<ChatResponse> {
  const systemMsg = req.messages.find(m => m.role === "system");
  const nonSystem = req.messages.filter(m => m.role !== "system");
  const res = await fetch(`${config.baseUrl}/messages`, {
    method: "POST",
    headers: { ...headers, "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31" },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      ...(systemMsg ? { system: anthropicSystem(systemMsg.content) } : {}),
      messages: nonSystem.map(toAnthropicMessage),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    content: data.content?.[0]?.text ?? "",
    model: data.model ?? req.model,
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
  };
}

async function* chatStreamAnthropic(config: ProviderConfig, req: ChatRequest, headers: Record<string, string>): AsyncGenerator<StreamChunk> {
  const systemMsg = req.messages.find(m => m.role === "system");
  const nonSystem = req.messages.filter(m => m.role !== "system");
  const res = await fetch(`${config.baseUrl}/messages`, {
    method: "POST",
    headers: { ...headers, "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31" },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      stream: true,
      ...(systemMsg ? { system: anthropicSystem(systemMsg.content) } : {}),
      messages: nonSystem.map(toAnthropicMessage),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        // Anthropic thinking blocks (extended thinking)
        if (parsed.type === "content_block_start" && parsed.content_block?.type === "thinking") {
          // thinking block started — will receive deltas
        }
        if (parsed.type === "content_block_delta") {
          // Thinking delta
          if (parsed.delta?.type === "thinking_delta") {
            const thinking = parsed.delta?.thinking ?? "";
            if (thinking) yield { delta: "", done: false, reasoning: thinking };
          }
          // Text delta
          const text = parsed.delta?.text ?? "";
          if (text) yield { delta: text, done: false };
        }
        if (parsed.type === "message_stop") {
          yield { delta: "", done: true };
          return;
        }
      } catch { /* skip */ }
    }
  }
  yield { delta: "", done: true };
}

// --- Google adapter ---

async function chatGoogle(config: ProviderConfig, req: ChatRequest): Promise<ChatResponse> {
  const systemMsg = req.messages.find(m => m.role === "system");
  const contents = req.messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: toGoogleParts(m),
  }));
  const res = await fetch(`${config.baseUrl}/models/${req.model}:generateContent?key=${config.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
      generationConfig: { maxOutputTokens: req.maxTokens ?? 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Google error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    model: req.model,
    usage: { input: data.usageMetadata?.promptTokenCount ?? 0, output: data.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

async function* chatStreamGoogle(config: ProviderConfig, req: ChatRequest): AsyncGenerator<StreamChunk> {
  const systemMsg = req.messages.find(m => m.role === "system");
  const contents = req.messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: toGoogleParts(m),
  }));
  const res = await fetch(`${config.baseUrl}/models/${req.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
      generationConfig: { maxOutputTokens: req.maxTokens ?? 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Google error ${res.status}: ${await res.text()}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) yield { delta: text, done: false };
      } catch { /* skip */ }
    }
  }
  yield { delta: "", done: true };
}
