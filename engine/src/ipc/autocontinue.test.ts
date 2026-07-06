import { describe, it, expect } from "vitest";
import { looksUnfinished } from "./autocontinue.ts";

describe("looksUnfinished (Task 64)", () => {
  it("detects an announced-but-not-done action", () => {
    expect(looksUnfinished("The pdfplumber library is not installed. Let me install it first.")).toBe(true);
    expect(looksUnfinished("The PDF is binary. Let me extract the text using a Python script.")).toBe(true);
    expect(looksUnfinished("Next, I'll run the extraction script.")).toBe(true);
    expect(looksUnfinished("I'll check your desktop now.")).toBe(true);
    expect(looksUnfinished("First, I need to read the file:")).toBe(true);
    expect(looksUnfinished("Let me search the web for that.")).toBe(true);
  });

  it("does NOT trigger on a genuine question or offer to the user", () => {
    expect(looksUnfinished("Done! Let me know if you'd like me to run it again.")).toBe(false);
    expect(looksUnfinished("Would you like me to install it?")).toBe(false);
    expect(looksUnfinished("Should I run the script now?")).toBe(false);
    expect(looksUnfinished("I can extract it if you want — shall I proceed?")).toBe(false);
    expect(looksUnfinished("That's up to you — I can run it or leave it.")).toBe(false);
  });

  it("does NOT trigger on a completed answer", () => {
    expect(looksUnfinished("The file has 12 lines and defines three functions.")).toBe(false);
    expect(looksUnfinished("Here is the summary of your desktop contents: 42 files.")).toBe(false);
    expect(looksUnfinished("")).toBe(false);
    expect(looksUnfinished("   ")).toBe(false);
  });

  it("requires BOTH intent and an action verb (no false-positive on chatty intent)", () => {
    // intent phrase but no tool-like action verb -> not a stall
    expect(looksUnfinished("Let me think about how to phrase this.")).toBe(false);
    expect(looksUnfinished("I'll be honest, that's a tricky question.")).toBe(false);
  });

  it("only inspects the tail, so a long correct answer that merely mentions a verb early is fine", () => {
    const longAnswer = "I ran the analysis and installed nothing new. " + "x".repeat(600) + " The results are attached above.";
    expect(looksUnfinished(longAnswer)).toBe(false);
  });

  it("Thai: detects a genuine action announcement but not ordinary replies", () => {
    // เดี๋ยว (in a moment) + สร้างไฟล์ (create a file) — a real stall → continue
    expect(looksUnfinished("เดี๋ยวผมสร้างไฟล์ให้นะครับ")).toBe(true);
    // Ordinary replies using the very common จะ/ต้อง/ขอ (removed from INTENT to
    // stop false positives) — must NOT trigger an auto-continue loop.
    expect(looksUnfinished("ผมจะไปทานข้าวก่อนนะครับ")).toBe(false); // "I'll go eat first"
    expect(looksUnfinished("ต้องขอบคุณมากเลยครับ")).toBe(false);       // "must thank you a lot"
    expect(looksUnfinished("ขอโทษด้วยนะครับ")).toBe(false);           // "sorry about that"
  });
});
