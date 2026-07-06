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

// ── ask_user option selector (Claude-style) ────────────────────────────────
// Same "pause the loop until the UI responds" mechanism as approval, but the
// agent loop RESUMES with the user's choice instead of ending the turn. The
// tool emits the options via chat.options_presented and blocks on
// requestUserChoice; the UI sends tool.optionsResult → resolveUserChoice.

type ChoiceResolver = (answer: string) => void;
const pendingChoices = new Map<string, ChoiceResolver>();

export function requestUserChoice(
  id: string,
  question: string,
  options: { label: string; description?: string; value: string }[],
  other: boolean,
  send: (obj: unknown) => void,
): Promise<string> {
  send({ jsonrpc: "2.0", method: "chat.options_presented", params: { id, question, options, other } });
  return new Promise<string>((resolve) => {
    pendingChoices.set(id, resolve);
  });
}

/** Resolve a pending user choice. Returns false if nothing was waiting on `id`. */
export function resolveUserChoice(id: string, answer: string): boolean {
  const resolver = pendingChoices.get(id);
  if (!resolver) return false;
  pendingChoices.delete(id);
  resolver(answer);
  return true;
}

/** On abort/stop, release every pending prompt so the agent loop can't hang:
 *  approvals resolve as denied, option choices resolve as cancelled. */
export function cancelAllPending(): void {
  for (const resolver of pending.values()) resolver(false);
  pending.clear();
  for (const resolver of pendingChoices.values()) resolver("(cancelled by user)");
  pendingChoices.clear();
}
