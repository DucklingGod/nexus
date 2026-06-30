// ponytail: ONE implementation for ALL OpenAI-compatible APIs
// OpenAI, OpenRouter, DeepSeek, xAI, MiniMax, Kimi, DashScope, Xiaomi, Ollama, LM Studio — ALL same format
// Anthropic + Google have different formats but we handle them via adapter

import type { ProviderConfig, ChatRequest, ChatResponse, StreamChunk, StreamToolCallDelta, ModelInfo } from "./types.ts";

/// List available models. Adapts per provider — mirrors chat()'s detection below.
/// Returns { models } on success; { models: [], error } when the call fails so the
/// UI can show "no models" vs "your key/request is wrong" instead of failing silently.
export async function listModels(config: ProviderConfig): Promise<{ models: ModelInfo[]; error?: string }> {
  if (config.baseUrl.includes("anthropic.com")) return listModelsAnthropic(config);
  if (config.baseUrl.includes("generativelanguage.googleapis.com")) return listModelsGoogle(config);
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
    messages: req.messages,
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
    messages: req.messages,
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
        if (content) yield { delta: content, done: false };
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
      messages: nonSystem.map(m => ({ role: m.role, content: m.content })),
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
      messages: nonSystem.map(m => ({ role: m.role, content: m.content })),
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
    parts: [{ text: m.content }],
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
    parts: [{ text: m.content }],
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
