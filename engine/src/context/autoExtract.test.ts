import { describe, it, expect } from "vitest";
import { parseExtractJson } from "./autoExtract.ts";

// Reproduces the exact failure modes seen in the live engine log, where
// auto-extract threw "Unexpected token ..." on every turn because the model
// returned prose / markdown / tool-call blobs instead of a bare JSON array.

describe("parseExtractJson (auto-extract hardening)", () => {
  it("parses a bare JSON array", () => {
    const out = parseExtractJson('[{"file":"user","note":"Name is Somchai"}]');
    expect(out).toEqual([{ file: "user", note: "Name is Somchai" }]);
  });

  it("parses JSON wrapped in markdown fences", () => {
    const out = parseExtractJson("```json\n[{\"file\":\"memory\",\"note\":\"uses Tauri\"}]\n```");
    expect(out).toEqual([{ file: "memory", note: "uses Tauri" }]);
  });

  it("parses JSON with leading/trailing prose", () => {
    const out = parseExtractJson('Here are the facts:\n[{"file":"user","note":"likes Thai"}]\nThat is all.');
    expect(out).toEqual([{ file: "user", note: "likes Thai" }]);
  });

  it("returns [] when the model returns plain prose (no array)", () => {
    expect(parseExtractJson("I currently use Nexus on my Mac.")).toEqual([]);
  });

  it("returns [] when the model returns Thai prose starting with a non-ASCII char", () => {
    // Directly reproduces the logged failure: "คุณสามารถเ..."
    expect(parseExtractJson("คุณสามารถเข้าถึงเดสก์ท็อปได้")).toEqual([]);
  });

  it("returns [] when the model returns a markdown heading / bold blob", () => {
    expect(parseExtractJson("**Nemotron Notes**\nSome summary text.")).toEqual([]);
  });

  it("returns [] when the model emits a <tool_call> blob instead of JSON", () => {
    expect(parseExtractJson("<tool_call>\n{\"name\":\"remember\"}\n</tool_call>")).toEqual([]);
  });

  it("returns [] for empty / whitespace / '[]' input", () => {
    expect(parseExtractJson("")).toEqual([]);
    expect(parseExtractJson("   ")).toEqual([]);
    expect(parseExtractJson("[]")).toEqual([]);
  });

  it("extracts all JSON objects (field validation is the caller's job)", () => {
    // The parser only extracts valid JSON objects; deciding which file values
    // are allowed happens later in autoExtract(). Here we confirm it surfaces
    // every object, with undefined for missing string fields.
    const out = parseExtractJson('[{"file":"user","note":"ok"},{"note":"no file"},{"file":"memory"}]');
    expect(out).toEqual([
      { file: "user", note: "ok" },
      { file: undefined, note: "no file" },
      { file: "memory", note: undefined },
    ]);
  });

  it("never throws on malformed JSON between brackets", () => {
    expect(parseExtractJson("[not valid json")).toEqual([]);
    expect(parseExtractJson("[{,,,}]")).toEqual([]);
  });
});
