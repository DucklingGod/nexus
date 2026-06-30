import { describe, it, expect } from "vitest";
import { handle, type RpcRequest } from "./rpc.ts";

// handle() is async — every call must be awaited.
function req(method: string, params?: unknown): RpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params };
}

describe("RPC dispatch", () => {
  it("engine.health returns ok + version", async () => {
    const resp = await handle(req("engine.health"));
    expect(resp.result).toEqual({ ok: true, version: "0.1.0" });
  });

  it("unknown method returns error", async () => {
    const resp = await handle(req("does.not.exist"));
    expect(resp.error?.code).toBe(-32601);
  });
});

describe("Settings RPC", () => {
  it("settings.set + settings.get roundtrip", async () => {
    await handle(req("settings.set", { key: "test.key", value: "hello" }));
    const resp = await handle(req("settings.get", { key: "test.key" }));
    expect(resp.result).toEqual({ value: "hello" });
  });

  it("settings.get returns null for missing key", async () => {
    const resp = await handle(req("settings.get", { key: "nonexistent" }));
    expect(resp.result).toEqual({ value: null });
  });

  it("settings.delete removes key", async () => {
    await handle(req("settings.set", { key: "to.delete", value: "bye" }));
    await handle(req("settings.delete", { key: "to.delete" }));
    const resp = await handle(req("settings.get", { key: "to.delete" }));
    expect(resp.result).toEqual({ value: null });
  });

  it("settings.getAll returns all settings", async () => {
    await handle(req("settings.set", { key: "a", value: "1" }));
    await handle(req("settings.set", { key: "b", value: "2" }));
    const resp = await handle(req("settings.getAll"));
    expect(resp.result).toHaveProperty("a", "1");
    expect(resp.result).toHaveProperty("b", "2");
  });
});

describe("Provider RPC", () => {
  it("provider.set + provider.get roundtrip", async () => {
    await handle(req("provider.set", { provider: "openai", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" }));
    const resp = await handle(req("provider.get"));
    expect(resp.result).toEqual({ provider: "openai", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" });
  });
});

describe("Agent Personality RPC", () => {
  it("agent.personality.set + get roundtrip", async () => {
    await handle(req("agent.personality.set", { name: "Alice", tone: "friendly" }));
    const resp = await handle(req("agent.personality.get"));
    expect(resp.result).toHaveProperty("name", "Alice");
    expect(resp.result).toHaveProperty("tone", "friendly");
  });
});
