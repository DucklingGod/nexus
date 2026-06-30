// User-approval gate for dangerous tools (SPEC §15.4 / §11: "never auto-execute
// destructive commands without approval").
//
// The agent loop calls `requestApproval` before running any tool flagged
// `dangerous`. That emits a `chat.tool_approval` notification (→ Rust →
// "engine-event" → UI modal) and blocks until the UI sends a
// `tool.approvalResult` request, which main.ts routes to `resolveApproval`.

type Resolver = (approved: boolean) => void;

const pending = new Map<string, Resolver>();

export function requestApproval(
  id: string,
  name: string,
  args: Record<string, unknown>,
  send: (obj: unknown) => void,
): Promise<boolean> {
  send({ jsonrpc: "2.0", method: "chat.tool_approval", params: { id, name, arguments: args } });
  return new Promise<boolean>((resolve) => {
    pending.set(id, resolve);
  });
}

/** Resolve a pending approval. Returns false if nothing was waiting on `id`. */
export function resolveApproval(id: string, approved: boolean): boolean {
  const resolver = pending.get(id);
  if (!resolver) return false;
  pending.delete(id);
  resolver(approved);
  return true;
}
