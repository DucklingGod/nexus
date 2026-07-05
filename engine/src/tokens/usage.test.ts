import { describe, it, expect } from "vitest";
import { recordTokenUsage, getUsageStats, calculateCost } from "./usage.ts";

// Hits the shared dev nexus.db directly (matches experience.test.ts's convention)
// — assertions are relative (before/after deltas), not absolute counts.

describe("usage tracking — savings (Task 63)", () => {
  it("calculateCost scales with tokens and differs by model tier", () => {
    const cheap = calculateCost("gpt-4o-mini", 1000, 1000);
    const expensive = calculateCost("gpt-4o", 1000, 1000);
    expect(expensive).toBeGreaterThan(cheap);
    expect(calculateCost("gpt-4o-mini", 2000, 2000)).toBeCloseTo(cheap * 2, 6);
  });

  it("regression: a model name that CONTAINS a shorter pricier key still gets its own (cheaper) price", () => {
    // Bug: "gpt-4o-mini".includes("gpt-4o") is true, so naive first-match
    // substring lookup silently priced -mini variants at the full model's rate.
    expect(calculateCost("gpt-4o-mini", 1000, 1000)).toBeLessThan(calculateCost("gpt-4o", 1000, 1000));
    expect(calculateCost("openai/gpt-4o-mini", 1000, 1000)).toBe(calculateCost("gpt-4o-mini", 1000, 1000));
    // Same collision class: "grok-3-mini" contains "grok-3".
    expect(calculateCost("grok-3-mini", 1000, 1000)).toBeLessThan(calculateCost("grok-3", 1000, 1000));
  });

  it("records a cache-hit saving and reflects it in savedCacheUsd", () => {
    const before = getUsageStats(365).savedCacheUsd;
    const saved = calculateCost("gpt-4o", 500, 200);
    recordTokenUsage({ model: "gpt-4o", input_tokens: 0, output_tokens: 0, saved_usd: saved, saved_reason: "cache" });
    const after = getUsageStats(365).savedCacheUsd;
    expect(after).toBeCloseTo(before + saved, 6);
  });

  it("records a routing saving and reflects it in savedRoutingUsd, separate from cache", () => {
    const beforeRouting = getUsageStats(365).savedRoutingUsd;
    const beforeCache = getUsageStats(365).savedCacheUsd;
    const saved = calculateCost("gpt-4o", 300, 300) - calculateCost("gpt-4o-mini", 300, 300);
    recordTokenUsage({ model: "gpt-4o-mini", input_tokens: 300, output_tokens: 300, saved_usd: saved, saved_reason: "routing" });
    const stats = getUsageStats(365);
    expect(stats.savedRoutingUsd).toBeCloseTo(beforeRouting + saved, 6);
    expect(stats.savedCacheUsd).toBeCloseTo(beforeCache, 6); // untouched
  });

  it("a normal (non-saving) record doesn't affect either savings bucket", () => {
    const before = getUsageStats(365);
    recordTokenUsage({ model: "gpt-4o", input_tokens: 100, output_tokens: 50 });
    const after = getUsageStats(365);
    expect(after.savedCacheUsd).toBeCloseTo(before.savedCacheUsd, 6);
    expect(after.savedRoutingUsd).toBeCloseTo(before.savedRoutingUsd, 6);
    expect(after.totalMessages).toBeGreaterThan(before.totalMessages);
  });
});
