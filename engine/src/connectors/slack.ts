// Slack connector — Socket Mode (a websocket the app opens to Slack, no public
// URL / webhook needed, so it works from a desktop while running — same "Live
// mode" model as Telegram/Discord). Requires a Slack app with Socket Mode
// enabled: an app-level token (xapp-…, connections:write scope) to open the
// socket, and a bot token (xoxb-…, chat:write + reactions:write + app_mentions:read
// + im:history scopes) to read/post messages.
//
// Credentials are stored as one JSON blob (not a single string) since Socket
// Mode needs two tokens — see SlackCreds below.

import { type ConnectorConfig } from "./agent.ts";
import { handleConnectorMessage } from "./session.ts";

const API = "https://slack.com/api";

export interface SlackCreds { appToken: string; botToken: string }

/** Parse the stored credential blob; throws a clear error if it's malformed. */
export function parseSlackCreds(raw: string): SlackCreds {
  const parsed = JSON.parse(raw) as Partial<SlackCreds>;
  if (!parsed.appToken || !parsed.botToken) throw new Error("Slack credentials missing appToken/botToken");
  return { appToken: parsed.appToken, botToken: parsed.botToken };
}

const WS: { new (url: string): WebSocketLike } = (globalThis as { WebSocket: { new (url: string): WebSocketLike } }).WebSocket;

interface WebSocketLike {
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

async function slackApi(botToken: string, method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return fetch(`${API}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json()) as Promise<Record<string, unknown>>;
}

export function startSlack(token: string, config: ConnectorConfig, log: (msg: string) => void): () => void {
  let running = true;
  let ws: WebSocketLike | null = null;
  let creds: SlackCreds;
  try {
    creds = parseSlackCreds(token);
  } catch (e) {
    log(e instanceof Error ? e.message : "invalid Slack credentials");
    return () => {};
  }

  let selfId = "";

  async function connect() {
    if (!running) return;
    try {
      const auth = await slackApi(creds.botToken, "auth.test", {});
      if (!auth.ok) { log(`auth failed: ${auth.error ?? "unknown"}`); return; }
      selfId = String(auth.user_id ?? "");

      const opened = await fetch(`${API}/apps.connections.open`, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.appToken}` },
      }).then((r) => r.json()) as { ok: boolean; url?: string; error?: string };
      if (!opened.ok || !opened.url) { log(`connections.open failed: ${opened.error ?? "unknown"}`); if (running) setTimeout(connect, 5000); return; }

      ws = new WS(opened.url);
      ws.onmessage = async (ev) => {
        let payload: { envelope_id?: string; type?: string; payload?: Record<string, unknown> };
        try { payload = JSON.parse(String(ev.data)); } catch { return; }

        // Ack every envelope immediately (Slack requires this within 3s).
        if (payload.envelope_id) ws?.send(JSON.stringify({ envelope_id: payload.envelope_id }));

        if (payload.type !== "events_api") return;
        const event = (payload.payload?.event ?? {}) as Record<string, unknown>;
        if (event.type !== "message" || event.subtype) return; // skip edits/bot messages/etc.
        const userId = String(event.user ?? "");
        if (!userId || userId === selfId) return;
        const text = String(event.text ?? "").replace(new RegExp(`<@${selfId}>`, "g"), "").trim();
        if (!text) return;
        const channel = String(event.channel ?? "");
        const ts = String(event.ts ?? "");
        log(`message from ${userId}`);

        // "working" indicator: react with an hourglass while the agent runs.
        if (ts) slackApi(creds.botToken, "reactions.add", { channel, timestamp: ts, name: "hourglass_flowing_sand" }).catch(() => {});
        let replyText: string;
        try {
          const result = await handleConnectorMessage("slack", channel, userId, text, config);
          replyText = result.text;
        } catch {
          replyText = "Sorry, I hit an error handling that.";
        } finally {
          if (ts) slackApi(creds.botToken, "reactions.remove", { channel, timestamp: ts, name: "hourglass_flowing_sand" }).catch(() => {});
        }
        await slackApi(creds.botToken, "chat.postMessage", { channel, text: replyText.slice(0, 3900) });
      };
      ws.onclose = () => { if (running) setTimeout(connect, 3000); };
      ws.onerror = () => log("websocket error");
      log(`connected as ${auth.user ?? "bot"} — listening`);
    } catch {
      log("connection failed");
      if (running) setTimeout(connect, 5000);
    }
  }

  connect();

  return () => {
    running = false;
    try { ws?.close(); } catch { /* ignore */ }
    log("stopped");
  };
}
