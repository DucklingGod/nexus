import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import type { ProviderConfig } from "../providers/types.ts";
import type { Experience } from "./experience.ts";
import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Use a temp DB so tests don't pollute the real nexus.db
const TEST_DIR = join(process.env.TEMP ?? "/tmp", `nexus-test-${randomUUID().slice(0, 8)}`);
mkdirSync(TEST_DIR, { recursive: true });
process.env.NEXUS_DATA_DIR = TEST_DIR;

// Ensure required tables exist
const setupDb = new Database(join(TEST_DIR, "nexus.db"));
setupDb.pragma("journal_mode = WAL");
setupDb.exec(`CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY, target TEXT NOT NULL, previous_text TEXT NOT NULL,
  new_text TEXT NOT NULL, reason TEXT, score INTEGER, baseline_score INTEGER,
  applied INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
)`);
setupDb.close();

const chatMock = vi.fn();
vi.mock("../providers/client.ts", () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

const listExperiencesMock = vi.fn<(limit?: number) => Experience[]>();
vi.mock("./experience.ts", () => ({ listExperiences: (limit?: number) => listExperiencesMock(limit) }));

let currentInstructions = "Be helpful.";
const getSettingMock = vi.fn<(key: string) => string | null>();
const setAgentPersonalityMock = vi.fn((patch: { instructions?: string | null }) => {
  if (patch.instructions != null) currentInstructions = patch.instructions;
});
vi.mock("../db/settings.ts", () => ({
  getAgentPersonality: () => ({ name: "", role: "", tone: "", language: "", instructions: currentInstructions }),
  setAgentPersonality: (...args: [{ instructions?: string | null }]) => setAgentPersonalityMock(...args),
  getSetting: (key: string) => getSettingMock(key),
}));

const { runOptimization, listPromptVersions, applyPromptVersion, maybeAutoOptimize } = await import("./optimize.ts");

const config: ProviderConfig = { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test" };

function exp(overrides: Partial<Experience>): Experience {
  return { id: "exp-1", input: "q", output: "a", tool_steps: [], success: true, duration_ms: 0, model: null, feedback: null, created_at: Date.now(), ...overrides };
}

afterEach(() => { chatMock.mockReset(); listExperiencesMock.mockReset(); setAgentPersonalityMock.mockClear(); getSettingMock.mockReset(); currentInstructions = "Be helpful."; });

describe("runOptimization", () => {
  it("skips when there isn't enough negative signal", async () => {
    listExperiencesMock.mockReturnValue([exp({ feedback: "down" })]); // only 1, below MIN_FAILURES
    const result = await runOptimization(config, "gpt-4o-mini");
    expect(result.proposal).toBeNull();
    expect(result.skippedReason).toMatch(/negative-feedback/);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("proposes and stores the best-judged candidate when it beats the baseline", async () => {
    listExperiencesMock.mockReturnValue(Array.from({ length: 4 }, (_, i) => exp({ id: `exp-${i}`, feedback: "down", input: `bad case ${i}` })));
    chatMock.mockImplementation(async (_cfg: unknown, req: { messages: { content: string }[] }) => {
      const content = req.messages[0].content;
      if (content.includes("Propose 2-3 revised")) {
        return { content: JSON.stringify(["Be helpful and always confirm before destructive actions.", "Be extremely cautious."]) };
      }
      // Judge calls: baseline judged low, candidates judged higher.
      if (content.includes(`"""\nBe helpful.\n"""`)) return { content: JSON.stringify({ score: 40, reason: "baseline missed safety checks" }) };
      if (content.includes("always confirm before destructive")) return { content: JSON.stringify({ score: 85, reason: "adds explicit safety confirmation" }) };
      return { content: JSON.stringify({ score: 60, reason: "vaguer" }) };
    });

    const result = await runOptimization(config, "gpt-4o-mini");
    expect(result.proposal).not.toBeNull();
    expect(result.proposal!.new_text).toBe("Be helpful and always confirm before destructive actions.");
    expect(result.proposal!.score).toBe(85);
    expect(result.proposal!.baseline_score).toBe(40);
    expect(result.proposal!.applied).toBe(false);
    expect(setAgentPersonalityMock).not.toHaveBeenCalled(); // never auto-applies

    // Persisted — visible via listPromptVersions.
    const versions = listPromptVersions(5);
    expect(versions.some((v) => v.id === result.proposal!.id)).toBe(true);
  });

  it("proposes nothing when no candidate beats the current instructions", async () => {
    listExperiencesMock.mockReturnValue(Array.from({ length: 4 }, (_, i) => exp({ id: `exp-${i}`, feedback: "down" })));
    chatMock.mockImplementation(async (_cfg: unknown, req: { messages: { content: string }[] }) => {
      const content = req.messages[0].content;
      if (content.includes("Propose 2-3 revised")) return { content: JSON.stringify(["A worse rewrite."]) };
      return { content: JSON.stringify({ score: 50, reason: "no better than baseline" }) }; // everything scores the same
    });
    const result = await runOptimization(config, "gpt-4o-mini");
    expect(result.proposal).toBeNull();
    expect(result.skippedReason).toMatch(/didn't beat/);
  });

  it("skips when the model proposes no usable candidates", async () => {
    listExperiencesMock.mockReturnValue(Array.from({ length: 4 }, (_, i) => exp({ id: `exp-${i}`, feedback: "down" })));
    chatMock.mockResolvedValue({ content: "not json at all" });
    const result = await runOptimization(config, "gpt-4o-mini");
    expect(result.proposal).toBeNull();
    expect(result.skippedReason).toMatch(/didn't propose/);
  });
});

describe("applyPromptVersion", () => {
  it("applies a stored version's new_text as the live instructions and marks it applied", async () => {
    listExperiencesMock.mockReturnValue(Array.from({ length: 4 }, (_, i) => exp({ id: `exp-${i}`, feedback: "down" })));
    chatMock.mockImplementation(async (_cfg: unknown, req: { messages: { content: string }[] }) => {
      const content = req.messages[0].content;
      if (content.includes("Propose 2-3 revised")) return { content: JSON.stringify(["New instructions text."]) };
      if (content.includes("New instructions text")) return { content: JSON.stringify({ score: 90, reason: "better" }) };
      return { content: JSON.stringify({ score: 10, reason: "baseline" }) };
    });
    const result = await runOptimization(config, "gpt-4o-mini");
    const applied = applyPromptVersion(result.proposal!.id);
    expect(applied).not.toBeNull();
    expect(applied!.applied).toBe(true);
    expect(setAgentPersonalityMock).toHaveBeenCalledWith({ instructions: "New instructions text." });
  });

  it("returns null for an unknown id", () => {
    expect(applyPromptVersion("pv-doesnotexist")).toBeNull();
  });
});

describe("maybeAutoOptimize", () => {
  it("returns false when auto-trigger is disabled", async () => {
    getSettingMock.mockImplementation((k: string) => k === "optimize.autoTrigger" ? "false" : null);
    const triggered = await maybeAutoOptimize(config, "gpt-4o-mini", 40, 30);
    expect(triggered).toBe(false);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("returns false when debounced (last prompt_version < 24h ago)", async () => {
    getSettingMock.mockReturnValue(null); // auto-trigger enabled (default)
    // Seed a recent prompt version via runOptimization so the debounce check finds it.
    listExperiencesMock.mockReturnValue(Array.from({ length: 4 }, (_, i) => exp({ id: `exp-d-${i}`, feedback: "down" })));
    chatMock.mockImplementation(async (_cfg: unknown, req: { messages: { content: string }[] }) => {
      const content = req.messages[0].content;
      if (content.includes("Propose 2-3 revised")) return { content: JSON.stringify(["Better instructions."]) };
      if (content.includes("Better instructions")) return { content: JSON.stringify({ score: 90, reason: "good" }) };
      return { content: JSON.stringify({ score: 10, reason: "baseline" }) };
    });
    await runOptimization(config, "gpt-4o-mini"); // creates a prompt_version just now

    chatMock.mockReset();
    const triggered = await maybeAutoOptimize(config, "gpt-4o-mini", 40, 30);
    expect(triggered).toBe(false);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("returns true and kicks off optimization when enabled and not debounced", async () => {
    // Advance time past 24h so any prior prompt_versions don't debounce us.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    getSettingMock.mockReturnValue(null); // auto-trigger enabled
    listExperiencesMock.mockReturnValue(Array.from({ length: 4 }, (_, i) => exp({ id: `exp-a-${i}`, feedback: "down" })));
    chatMock.mockImplementation(async (_cfg: unknown, req: { messages: { content: string }[] }) => {
      const content = req.messages[0].content;
      if (content.includes("Propose 2-3 revised")) return { content: JSON.stringify(["Revised instructions."]) };
      if (content.includes("Revised instructions")) return { content: JSON.stringify({ score: 90, reason: "improved" }) };
      return { content: JSON.stringify({ score: 10, reason: "baseline" }) };
    });

    const sendMock = vi.fn();
    const triggered = await maybeAutoOptimize(config, "gpt-4o-mini", 40, 30, sendMock);
    expect(triggered).toBe(true);
    // Optimization is fire-and-forget; let the microtask queue flush.
    await vi.advanceTimersByTimeAsync(50);
    expect(chatMock).toHaveBeenCalled(); // runOptimization was called
    vi.useRealTimers();
  });
});
