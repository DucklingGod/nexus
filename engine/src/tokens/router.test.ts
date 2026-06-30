import { describe, it, expect } from "vitest";
import { classifyComplexity, routeModel } from "./router.ts";

describe("classifyComplexity", () => {
  it("simple for short greetings", () => {
    expect(classifyComplexity("hi there")).toBe("simple");
    expect(classifyComplexity("thanks!")).toBe("simple");
  });
  it("complex for coding / analysis", () => {
    expect(classifyComplexity("debug this function then refactor it")).toBe("complex");
    expect(classifyComplexity("analyze the architecture of this module")).toBe("complex");
  });
  it("complex for very long messages", () => {
    expect(classifyComplexity("a".repeat(700))).toBe("complex");
  });
  it("medium otherwise", () => {
    expect(classifyComplexity("summarize this short article about cats and dogs")).toBe("medium");
  });
});

describe("routeModel", () => {
  it("routes simple → cheap model for OpenAI", () => {
    const r = routeModel("https://api.openai.com/v1", "gpt-4o", "hi");
    expect(r.model).toBe("gpt-4o-mini");
    expect(r.complexity).toBe("simple");
    expect(r.routed).toBe(true);
  });
  it("routes complex → premium model", () => {
    const r = routeModel("https://api.openai.com/v1", "gpt-4o-mini", "refactor this algorithm");
    expect(r.model).toBe("o3");
    expect(r.routed).toBe(true);
  });
  it("settings override wins over the built-in map", () => {
    const r = routeModel("https://api.openai.com/v1", "gpt-4o", "hi", { simple: "my-cheap-model" });
    expect(r.model).toBe("my-cheap-model");
  });
  it("unknown provider → keep requested model", () => {
    const r = routeModel("https://custom.example.com/v1", "my-model", "hi");
    expect(r.model).toBe("my-model");
    expect(r.routed).toBe(false);
  });
});
