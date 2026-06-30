import { createInterface } from "node:readline";
import { handle, type RpcRequest } from "./ipc/rpc.ts";
import { streamChat } from "./ipc/stream.ts";
import { initTools } from "./tools/registry.ts";
import { resolveApproval } from "./tools/approval.ts";

// Engine ↔ Rust core transport: newline-delimited JSON-RPC 2.0 over stdio.
//   stdout = JSON-RPC responses + notifications only (never logs)
//   stderr = human-readable logs
process.stderr.write("Nexus Engine Ready\n");

// Initialize tools on startup
initTools().catch(e => process.stderr.write(`[tools] init failed: ${e}\n`));

function send(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req: RpcRequest;
  try {
    req = JSON.parse(trimmed) as RpcRequest;
  } catch {
    process.stderr.write(`[engine] dropped non-JSON line: ${trimmed}\n`);
    return;
  }
  // chat.send streams (multiple notifications + a final response); everything
  // else is a single request → response.
  if (req.method === "chat.send") {
    await streamChat(req, send);
  } else if (req.method === "tool.approvalResult") {
    const { id, approved } = (req.params ?? {}) as { id?: string; approved?: boolean };
    const matched = id ? resolveApproval(id, !!approved) : false;
    send({ jsonrpc: "2.0", id: req.id, result: { ok: matched } });
  } else {
    send(await handle(req));
  }
});
