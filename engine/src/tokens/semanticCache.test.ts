import { describe, it, expect } from "vitest";
import { cosine, isCacheable } from "./semanticCache.ts";
import type { ChatMessage } from "../providers/types.ts";

describe("cosine", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 when a vector is all zeros", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("isCacheable", () => {
  const sys: ChatMessage = { role: "system", content: "you are helpful" };
  const user = (c: string): ChatMessage => ({ role: "user", content: c });
  const asst = (c: string): ChatMessage => ({ role: "assistant", content: c });

  it("true for a fresh single-turn question (with system prompt)", () => {
    expect(isCacheable([sys, user("what is the capital of France?")])).toBe(true);
  });
  it("false once there's a prior assistant turn", () => {
    expect(isCacheable([sys, user("hi"), asst("hello"), user("again")])).toBe(false);
  });
  it("false for multiple user messages", () => {
    expect(isCacheable([user("a"), user("b")])).toBe(false);
  });
});
