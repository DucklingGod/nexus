import { describe, it, expect } from "vitest";
import {
  getStrategyProfile,
  setPinnedStrategy,
  clearPinnedStrategy,
  analyzeStrategy,
  getStrategyHints,
  injectStrategy,
} from "./strategy.ts";

describe("strategy engine (Task 67)", () => {
  it("getStrategyProfile returns an array", () => {
    const profiles = getStrategyProfile();
    expect(Array.isArray(profiles)).toBe(true);
  });

  it("setPinnedStrategy / getStrategyProfile round-trip", () => {
    setPinnedStrategy("verbosity", "concise");
    const profiles = getStrategyProfile();
    const v = profiles.find((p) => p.category === "verbosity" && p.pinned);
    expect(v).toBeDefined();
    expect(v!.value).toBe("concise");
    expect(v!.confidence).toBe(1.0);
  });

  it("clearPinnedStrategy removes the pinned override", () => {
    setPinnedStrategy("verbosity", "detailed");
    expect(clearPinnedStrategy("verbosity")).toBe(true);
    const profiles = getStrategyProfile();
    const pinned = profiles.filter((p) => p.category === "verbosity" && p.pinned);
    expect(pinned).toHaveLength(0);
  });

  it("clearPinnedStrategy returns false for non-existent category", () => {
    expect(clearPinnedStrategy("nonexistent_cat_xyz")).toBe(false);
  });

  it("analyzeStrategy returns profiles without crashing", () => {
    const profiles = analyzeStrategy();
    expect(Array.isArray(profiles)).toBe(true);
  });

  it("getStrategyHints returns a string (empty or non-empty)", () => {
    const hints = getStrategyHints();
    expect(typeof hints).toBe("string");
  });

  it("getStrategyHints respects maxHints parameter", () => {
    // Pin multiple strategies so there are guaranteed hints
    setPinnedStrategy("verbosity", "concise");
    setPinnedStrategy("format", "code");
    setPinnedStrategy("proactivity", "act_first");
    const hints = getStrategyHints(2);
    // Should have at most 2 lines (each "- " prefixed)
    const lines = hints.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBeLessThanOrEqual(2);
    // Cleanup
    clearPinnedStrategy("verbosity");
    clearPinnedStrategy("format");
    clearPinnedStrategy("proactivity");
  });

  it("injectStrategy returns messages unchanged when no hints", () => {
    // Clear all pinned strategies to ensure empty hints
    clearPinnedStrategy("verbosity");
    clearPinnedStrategy("format");
    clearPinnedStrategy("proactivity");
    clearPinnedStrategy("tool_preference");
    const msgs = [{ role: "system" as const, content: "test" }];
    const result = injectStrategy(msgs);
    expect(result).toHaveLength(1);
    // If no hints generated, messages should be unchanged
    if (!getStrategyHints()) {
      expect(result[0].content).toBe("test");
    }
  });

  it("injectStrategy appends hints to system message when available", () => {
    setPinnedStrategy("verbosity", "concise");
    const msgs = [{ role: "system" as const, content: "base prompt" }];
    const result = injectStrategy(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("base prompt");
    // The pinned strategy should produce a hint
    expect(result[0].content).toContain("Adaptive strategy");
    // Cleanup
    clearPinnedStrategy("verbosity");
  });

  it("injectStrategy prepends system message when none exists", () => {
    setPinnedStrategy("verbosity", "concise");
    const msgs = [{ role: "user" as const, content: "hello" }];
    const result = injectStrategy(msgs);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    // Cleanup
    clearPinnedStrategy("verbosity");
  });
});
