import { describe, it, expect, vi, afterEach } from "vitest";
import type { ProviderConfig } from "../providers/types.ts";

const chatMock = vi.fn();
vi.mock("../providers/client.ts", () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

const { runMoA, formatMoAResult } = await import("./moa.ts");

const config: ProviderConfig & { model: string } = { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-test", model: "gpt-4o-mini" };

afterEach(() => { chatMock.mockReset(); });

describe("runMoA", () => {
  it("fans out to every model then synthesizes with the aggregator", async () => {
    // The aggregator call is distinguished by its prompt content, not the model
    // name — aggregatorModel defaults to models[0], so the same model name is
    // used for both the first candidate call and the synthesis call.
    chatMock.mockImplementation(async (_cfg: unknown, req: { model: string; messages: { content: string }[] }) => {
      const isAggregator = req.messages[0].content.includes("Candidate answers:");
      if (isAggregator) return { content: "SYNTHESIZED", model: req.model, usage: { input: 50, output: 20 } };
      if (req.model === "model-a") return { content: "answer A", model: "model-a", usage: { input: 10, output: 5 } };
      return { content: "answer B", model: "model-b", usage: { input: 10, output: 5 } };
    });

    const result = await runMoA(config, { query: "what is 2+2?", models: ["model-a", "model-b"] });

    expect(result.candidates.map((c) => c.content)).toEqual(["answer A", "answer B"]);
    expect(result.synthesized).toBe("SYNTHESIZED");
    expect(result.aggregatorModel).toBe("model-a"); // defaults to first model
    expect(result.usage).toEqual({ input: 10 + 10 + 50, output: 5 + 5 + 20 });
    expect(chatMock).toHaveBeenCalledTimes(3); // 2 candidates + 1 aggregator
  });

  it("uses an explicit aggregator_model when given", async () => {
    chatMock.mockImplementation(async (_cfg: unknown, req: { model: string }) => ({ content: `from ${req.model}`, model: req.model, usage: { input: 1, output: 1 } }));
    const result = await runMoA(config, { query: "q", models: ["a", "b"], aggregatorModel: "judge-model" });
    expect(result.aggregatorModel).toBe("judge-model");
    expect(chatMock.mock.calls.some(([, req]) => (req as { model: string }).model === "judge-model")).toBe(true);
  });

  it("skips the aggregator call when only one model is given", async () => {
    chatMock.mockResolvedValue({ content: "solo answer", model: "a", usage: { input: 1, output: 1 } });
    const result = await runMoA(config, { query: "q", models: ["a"] });
    expect(result.synthesized).toBe("solo answer");
    expect(chatMock).toHaveBeenCalledTimes(1); // no aggregator call needed
  });

  it("dedupes and caps at 5 models", async () => {
    chatMock.mockResolvedValue({ content: "x", model: "m", usage: { input: 1, output: 1 } });
    await runMoA(config, { query: "q", models: ["a", "a", "b", "c", "d", "e", "f", "g"] });
    // 5 candidates (capped, deduped) + 1 aggregator call = 6
    expect(chatMock).toHaveBeenCalledTimes(6);
  });

  it("captures a per-model error as a candidate without throwing", async () => {
    chatMock.mockImplementation(async (_cfg: unknown, req: { model: string }) => {
      if (req.model === "broken") throw new Error("503 upstream error");
      return { content: "fine", model: "good", usage: { input: 1, output: 1 } };
    });
    const result = await runMoA(config, { query: "q", models: ["broken", "good"] });
    const broken = result.candidates.find((c) => c.model === "broken")!;
    expect(broken.error).toMatch(/503/);
    expect(broken.usage).toEqual({ input: 0, output: 0 });
    // Only one candidate actually succeeded -> nothing to synthesize across,
    // so its answer is returned directly (same "skip the aggregator" path as
    // a single-model request).
    expect(result.synthesized).toBe("fine");
  });

  it("still synthesizes when 2+ candidates succeed alongside a failure", async () => {
    chatMock.mockImplementation(async (_cfg: unknown, req: { model: string; messages: { content: string }[] }) => {
      const isAggregator = req.messages[0].content.includes("Candidate answers:");
      if (isAggregator) return { content: "synthesized across survivors", model: req.model, usage: { input: 5, output: 5 } };
      if (req.model === "broken") throw new Error("503 upstream error");
      return { content: `fine from ${req.model}`, model: req.model, usage: { input: 1, output: 1 } };
    });
    const result = await runMoA(config, { query: "q", models: ["broken", "good-1", "good-2"] });
    expect(result.candidates.find((c) => c.model === "broken")!.error).toMatch(/503/);
    expect(result.synthesized).toBe("synthesized across survivors");
  });

  it("throws when no models are given", async () => {
    await expect(runMoA(config, { query: "q", models: [] })).rejects.toThrow(/at least one model/);
  });
});

describe("formatMoAResult", () => {
  it("includes the synthesized answer and each candidate", () => {
    const text = formatMoAResult({
      query: "q",
      aggregatorModel: "agg",
      synthesized: "FINAL",
      usage: { input: 10, output: 10 },
      candidates: [
        { model: "a", content: "candidate A", usage: { input: 5, output: 5 } },
        { model: "b", content: "", error: "timeout", usage: { input: 0, output: 0 } },
      ],
    });
    expect(text).toContain("FINAL");
    expect(text).toContain("candidate A");
    expect(text).toContain("timeout");
  });
});
