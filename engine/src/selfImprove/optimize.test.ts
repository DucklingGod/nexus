import { describe, it, expect, vi, afterEach } from "vitest";
import type { ProviderConfig } from "../providers/types.ts";
import type { Experience } from "./experience.ts";

const chatMock = vi.fn();
vi.mock("../providers/client.ts", () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

const listExperiencesMock = vi.fn<(limit?: number) => Experience[]>();
vi.mock("./experience.ts", () => ({ listExperiences: (limit?: number) => listExperiencesMock(limit) }));

let currentInstructions = "Be helpful.";
const setAgentPersonalityMock = vi.fn((patch: { instructions?: string | null }) => {
  if (patch.instructions != null) currentInstructions = patch.instructions;
});
vi.mock("../db/settings.ts", () => ({
  getAgentPersonality: () => ({ name: "", role: "", tone: "", language: "", instructions: currentInstructions }),
  setAgentPersonality: (...args: [{ instructions?: string | null }]) => setAgentPersonalityMock(...args),
}));

const { runOptimization, listPromptVersions, applyPromptVersion } = await import("./optimize.ts");

const config: ProviderConfig = { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test" };

function exp(overrides: Partial<Experience>): Experience {
  return { id: "exp-1", input: "q", output: "a", tool_steps: [], success: true, duration_ms: 0, model: null, feedback: null, created_at: Date.now(), ...overrides };
}

afterEach(() => { chatMock.mockReset(); listExperiencesMock.mockReset(); setAgentPersonalityMock.mockClear(); currentInstructions = "Be helpful."; });

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
