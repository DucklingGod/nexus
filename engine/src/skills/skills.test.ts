import { describe, it, expect } from "vitest";
import { listSkills, scoreSkills, injectSkills } from "./skills.ts";
import { BUILTIN_SKILLS } from "./builtin.ts";
import type { ChatMessage } from "../providers/types.ts";

describe("listSkills", () => {
  it("includes the ~60 built-in skills with unique ids", () => {
    const skills = listSkills();
    expect(skills.length).toBeGreaterThanOrEqual(50);
    expect(new Set(skills.map((s) => s.id)).size).toBe(skills.length);
  });
});

describe("scoreSkills", () => {
  it("matches the email skill", () => {
    expect(scoreSkills("can you write an email to my boss", BUILTIN_SKILLS).map((s) => s.id)).toContain("email-writing");
  });
  it("matches the debug skill on an error", () => {
    expect(scoreSkills("I get a TypeError, this bug is not working", BUILTIN_SKILLS).map((s) => s.id)).toContain("debug-error");
  });
  it("respects the limit", () => {
    expect(scoreSkills("summarize and translate this", BUILTIN_SKILLS, 1).length).toBe(1);
  });
  it("returns nothing for an unrelated / empty message", () => {
    expect(scoreSkills("", BUILTIN_SKILLS)).toEqual([]);
    expect(scoreSkills("zxqw fhqp", BUILTIN_SKILLS)).toEqual([]);
  });
});

describe("injectSkills", () => {
  const skills = scoreSkills("write an email", BUILTIN_SKILLS, 1);

  it("appends instructions to an existing system message", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "You are Nexus." },
      { role: "user", content: "write an email" },
    ];
    const out = injectSkills(msgs, skills);
    expect(out[0].content).toContain("You are Nexus.");
    expect(out[0].content).toContain("Relevant skills");
    expect(out).toHaveLength(2);
  });

  it("creates a system message when none exists", () => {
    const out = injectSkills([{ role: "user", content: "hi" }], skills);
    expect(out[0].role).toBe("system");
    expect(out).toHaveLength(2);
  });

  it("is a no-op with no skills", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: "hi" }];
    expect(injectSkills(msgs, [])).toBe(msgs);
  });
});
