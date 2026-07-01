import { describe, it, expect } from "vitest";
import { logExperience, listExperiences, setFeedback, getExperience } from "./experience.ts";

// These exercise the SQLite-backed CRUD against the shared dev nexus.db.
// (Vector search needs a provider key and is therefore not unit-tested here —
// it's exercised end-to-end via stream.ts when experience.enabled is on.)

describe("experience collector (Task 47)", () => {
  it("logs an experience and lists it back", () => {
    const id = logExperience({
      input: "list my desktop files",
      output: "Found 12 files…",
      tool_steps: [{ name: "file_list", args: { path: "~/Desktop" }, ok: true }],
      success: true,
      model: "test-model",
    });
    expect(id).toMatch(/^exp-/);
    const fetched = getExperience(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.input).toBe("list my desktop files");
    expect(fetched!.tool_steps).toHaveLength(1);
    expect(fetched!.tool_steps[0].name).toBe("file_list");
    expect(fetched!.success).toBe(true);
  });

  it("appears in the recent list", () => {
    const before = listExperiences(100).length;
    logExperience({ input: "another task", output: "done", success: true });
    expect(listExperiences(100).length).toBeGreaterThan(before);
  });

  it("records thumbs-up / thumbs-down feedback", () => {
    const id = logExperience({ input: "q", output: "a", success: true });
    expect(getExperience(id)!.feedback).toBeNull();
    expect(setFeedback(id, "down")).toBe(true);
    expect(getExperience(id)!.feedback).toBe("down");
    expect(setFeedback(id, null)).toBe(true);
    expect(getExperience(id)!.feedback).toBeNull();
  });

  it("marks a task with a failed tool step as unsuccessful when requested", () => {
    const id = logExperience({
      input: "broken task",
      output: "",
      tool_steps: [{ name: "ssh_exec", args: {}, ok: false }],
      success: false,
    });
    expect(getExperience(id)!.success).toBe(false);
    expect(getExperience(id)!.tool_steps[0].ok).toBe(false);
  });
});
