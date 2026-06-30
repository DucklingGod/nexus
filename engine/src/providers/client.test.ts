import { describe, it, expect, vi, afterEach } from "vitest";
import { chat, chatStream, testConnection, listModels } from "./client.ts";
import type { ProviderConfig } from "./types.ts";

// These tests mock global fetch, so they exercise the real request-building and
// response-parsing logic WITHOUT a live API key or network — the automated
// substitute for "I'd need your key to test this".

const openai: ProviderConfig = { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test" };
const anthropic: ProviderConfig = { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant" };

function jsonResponse(obj: unknown, ok = true): Response {
  return new Response(JSON.stringify(obj), { status: ok ? 200 : 400 });
}

function sseResponse(events: string[]): Response {
  const body = events.map((e) => `data: ${e}`).join("\n\n") + "\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => vi.restoreAllMocks());

describe("chat — OpenAI-compatible", () => {
  it("parses content + usage and sends a Bearer key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: "hi there" } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
      model: "gpt-4o",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await chat(openai, { messages: [{ role: "user", content: "hi" }], model: "gpt-4o" });

    expect(res.content).toBe("hi there");
    expect(res.usage).toEqual({ input: 5, output: 3 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    await expect(chat(openai, { messages: [], model: "x" })).rejects.toThrow(/401/);
  });
});

describe("chat — Anthropic adapter", () => {
  it("uses output_tokens for usage.output (regression for the token bug)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      content: [{ text: "hello" }],
      usage: { input_tokens: 5, output_tokens: 7 },
      model: "claude-x",
    })));

    const res = await chat(anthropic, { messages: [{ role: "user", content: "hi" }], model: "claude-x" });

    expect(res.content).toBe("hello");
    expect(res.usage).toEqual({ input: 5, output: 7 });
  });
});

describe("chatStream", () => {
  it("yields content deltas then done", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      '{"choices":[{"delta":{"content":"He"}}]}',
      '{"choices":[{"delta":{"content":"llo"}}]}',
      "[DONE]",
    ])));

    const deltas: string[] = [];
    let sawDone = false;
    for await (const chunk of chatStream(openai, { messages: [{ role: "user", content: "hi" }], model: "gpt-4o" })) {
      if (chunk.delta) deltas.push(chunk.delta);
      if (chunk.done) sawDone = true;
    }

    expect(deltas.join("")).toBe("Hello");
    expect(sawDone).toBe(true);
  });
});

describe("testConnection", () => {
  it("true when /models responds ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
    expect(await testConnection(openai)).toBe(true);
  });

  it("false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await testConnection(openai)).toBe(false);
  });
});

describe("listModels", () => {
  it("maps the OpenAI /models list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "gpt-4o" }, { id: "o3" }] })));
    const { models, error } = await listModels(openai);
    expect(error).toBeUndefined();
    expect(models.map((m) => m.id)).toEqual(["gpt-4o", "o3"]);
  });

  it("returns an error string (not a throw) on a bad key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401, statusText: "Unauthorized" })));
    const { models, error } = await listModels(openai);
    expect(models).toEqual([]);
    expect(error).toContain("401");
  });
});
