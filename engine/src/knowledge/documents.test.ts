import { describe, it, expect } from "vitest";
import { chunkText } from "./documents.ts";

describe("chunkText", () => {
  it("splits long text into overlapping chunks", () => {
    const chunks = chunkText("a".repeat(1200), 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBe(500);
  });

  it("returns a single chunk for short text", () => {
    expect(chunkText("hello world")).toEqual(["hello world"]);
  });

  it("drops empty / whitespace-only chunks", () => {
    expect(chunkText("   ")).toEqual([]);
  });
});
