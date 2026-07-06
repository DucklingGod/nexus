import { describe, it, expect, vi } from "vitest";
import { requestApproval, resolveApproval, requestUserChoice, resolveUserChoice, cancelAllPending } from "./approval.ts";

describe("approval gate", () => {
  it("emits a chat.tool_approval notification and resolves true when approved", async () => {
    const send = vi.fn();
    const p = requestApproval("t1", "terminal_exec", { command: "ls" }, send);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ method: "chat.tool_approval", params: expect.objectContaining({ id: "t1", name: "terminal_exec" }) }),
    );
    expect(resolveApproval("t1", true)).toBe(true);
    expect(await p).toBe(true);
  });

  it("resolves false when denied", async () => {
    const send = vi.fn();
    const p = requestApproval("t2", "execute_code", { code: "x" }, send);
    resolveApproval("t2", false);
    expect(await p).toBe(false);
  });

  it("returns false for an unknown id (nothing waiting)", () => {
    expect(resolveApproval("does-not-exist", true)).toBe(false);
  });
});

describe("ask_user option selector", () => {
  it("emits chat.options_presented and resolves with the chosen answer", async () => {
    const send = vi.fn();
    const opts = [{ label: "Use Postgres", value: "pg" }, { label: "Use SQLite", value: "sqlite" }];
    const p = requestUserChoice("c1", "Which database?", opts, true, send);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ method: "chat.options_presented", params: expect.objectContaining({ id: "c1", question: "Which database?", other: true }) }),
    );
    expect(resolveUserChoice("c1", "Use Postgres")).toBe(true);
    expect(await p).toBe("Use Postgres");
  });

  it("returns false for an unknown choice id", () => {
    expect(resolveUserChoice("nope", "x")).toBe(false);
  });

  it("cancelAllPending releases a waiting choice (so the loop can't hang on abort)", async () => {
    const send = vi.fn();
    const p = requestUserChoice("c2", "Pick one", [{ label: "A", value: "a" }], false, send);
    cancelAllPending();
    expect(await p).toMatch(/cancelled/i);
    // Already resolved — a late response finds nothing waiting.
    expect(resolveUserChoice("c2", "A")).toBe(false);
  });
});
