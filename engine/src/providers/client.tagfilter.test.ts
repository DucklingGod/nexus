import { describe, it, expect } from "vitest";
import { ContentTagFilter } from "./client.ts";

// The filter strips <think>/<tool_call> pseudo-tags from streaming content.
// These leak into chat as text/garbage from free OpenRouter models that don't
// support native function-calling (Qwen-QwQ, Nemotron, etc.).

describe("ContentTagFilter", () => {
  it("passes plain text through unchanged", () => {
    const f = new ContentTagFilter();
    expect(f.feed("Hello world").text).toBe("Hello world");
  });

  it("strips a complete <think> block and surfaces it as reasoning", () => {
    const f = new ContentTagFilter();
    const out = f.feed("<think>let me consider</think>Here is the answer.");
    expect(out.text).toBe("Here is the answer.");
    expect(out.reasoning).toBe("let me consider");
  });

  it("strips a complete <tool_call> block entirely (not reasoning, not text)", () => {
    const f = new ContentTagFilter();
    const out = f.feed('Before.<tool_call><function=file_list><parameter=path>.</parameter></function></tool_call>After.');
    expect(out.text).toBe("Before.After.");
    expect(out.reasoning).toBeUndefined();
  });

  it("handles a <think> block split across multiple chunks", () => {
    const f = new ContentTagFilter();
    const a = f.feed("Start <think");
    const b = f.feed(">reasoning continues");
    const c = f.feed("</think> end");
    expect(a.text + b.text + c.text).toBe("Start  end");
    expect((a.reasoning ?? "") + (b.reasoning ?? "") + (c.reasoning ?? "")).toBe("reasoning continues");
  });

  it("handles a closing tag split across chunks (close tag held until complete)", () => {
    const f = new ContentTagFilter();
    f.feed("<think>working");
    // The partial close "</thin" is held back (not emitted) so the next chunk
    // can still reconstruct the full "</think>" close tag.
    const out = f.feed("</thin");
    expect(out.text).toBe("");
    expect(out.reasoning ?? "").toBe(""); // nothing streamed yet — close is incomplete (undefined == none)
    // The rest closes the block; trailing text is normal content.
    const done = f.feed("k>Final answer");
    expect(done.text).toBe("Final answer");
  });

  it("handles multiple blocks in one chunk", () => {
    const f = new ContentTagFilter();
    const out = f.feed("<think>a</think>mid<tool_call>x</tool_call>end");
    expect(out.text).toBe("midend");
    expect(out.reasoning).toBe("a");
  });

  it("holds back a trailing '<' that could be the start of a tag", () => {
    const f = new ContentTagFilter();
    const out = f.feed("text <too");
    // The partial tag should be held, not emitted as text.
    expect(out.text).toBe("text ");
    // Flushing emits whatever was held (no close ever came).
    expect(f.flush().text).toBe("<too");
  });

  it("streams think-block reasoning during feed(), so flush() has nothing left", () => {
    const f = new ContentTagFilter();
    const during = f.feed("<think>unfinished thought");
    expect(during.reasoning).toBe("unfinished thought");
    // By flush time the buffer is empty — reasoning already streamed out.
    const flushed = f.flush();
    expect(flushed.text).toBe("");
    expect(flushed.reasoning).toBe("");
  });

  it("passes a literal '<' in prose through when it is not near a known tag", () => {
    const f = new ContentTagFilter();
    // 'a < b' — the '<' at index 2 is outside the hold-back window, so the
    // whole string is emitted as text (no over-holding of normal prose).
    const out = f.feed("a < b and more");
    expect(out.text).toBe("a < b and more");
  });

  it("emits interleaved text and think blocks in order across chunks", () => {
    const f = new ContentTagFilter();
    let text = "";
    let reasoning = "";
    for (const chunk of ["Hello ", "<think>step 1</think>", " middle ", "<think>step 2</think>", " end"]) {
      const o = f.feed(chunk);
      text += o.text;
      reasoning += o.reasoning ?? "";
    }
    expect(text).toBe("Hello  middle  end");
    expect(reasoning).toBe("step 1step 2");
  });
});
