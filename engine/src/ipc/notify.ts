// Background notifications to the UI — for events that happen outside a normal
// request/response (e.g. a connector receiving a Telegram/Discord message).
// Same channel as the per-request `send` in main.ts: newline-delimited JSON-RPC
// over stdout, which the Rust core forwards to the WebView as an "engine-event".

export function notify(method: string, params: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}
