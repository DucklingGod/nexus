import { describe, it, expect, vi } from "vitest";
import { requestApproval, resolveApproval } from "./approval.ts";

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
