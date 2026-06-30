// Discord connector — Gateway WebSocket (Node 24 has a global WebSocket, so no
// new dependency). Listens for mentions / DMs and replies via the REST API.
// Requires the MESSAGE CONTENT privileged intent enabled in the Discord
// developer portal for the bot to read message text.

import { type ConnectorConfig } from "./agent.ts";
import { handleConnectorMessage } from "./session.ts";

const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
const API = "https://discord.com/api/v10";
// GUILD_MESSAGES (1<<9) + MESSAGE_CONTENT (1<<15) + DIRECT_MESSAGES (1<<12)
const INTENTS = (1 << 9) | (1 << 12) | (1 << 15);

// Node's global WebSocket isn't always in the TS lib; reference it loosely.
const WS: { new (url: string): WebSocketLike } = (globalThis as { WebSocket: { new (url: string): WebSocketLike } }).WebSocket;

interface WebSocketLike {
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export function startDiscord(token: string, config: ConnectorConfig, log: (msg: string) => void): () => void {
  let running = true;
  let ws: WebSocketLike | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let seq: number | null = null;
  let selfId = "";

  function connect() {
    if (!running) return;
    ws = new WS(GATEWAY);
    ws.onmessage = async (ev) => {
      let payload: { op: number; d: Record<string, unknown>; s: number | null; t: string | null };
      try { payload = JSON.parse(String(ev.data)); } catch { return; }
      const { op, d, s, t } = payload;
      if (s != null) seq = s;

      if (op === 10) {
        const interval = (d as { heartbeat_interval: number }).heartbeat_interval;
        heartbeat = setInterval(() => ws?.send(JSON.stringify({ op: 1, d: seq })), interval);
        ws!.send(JSON.stringify({
          op: 2,
          d: { token, intents: INTENTS, properties: { os: "windows", browser: "nexus", device: "nexus" } },
        }));
      } else if (op === 0 && t === "READY") {
        selfId = (d.user as { id: string })?.id ?? "";
        log(`connected as ${(d.user as { username?: string })?.username ?? "bot"} — listening`);
      } else if (op === 0 && t === "MESSAGE_CREATE") {
        const author = d.author as { id?: string; bot?: boolean; username?: string } | undefined;
        if (!author || author.bot || author.id === selfId) return;
        const content = String(d.content ?? "");
        const mentions = (d.mentions as { id: string }[] | undefined) ?? [];
        const mentioned = mentions.some((m) => m.id === selfId);
        const isDM = !d.guild_id;
        if (!mentioned && !isDM) return; // only respond to mentions or DMs
        const text = content.replace(new RegExp(`<@!?${selfId}>`, "g"), "").trim();
        if (!text) return;
        log(`message from ${author.username ?? "user"}`);
        const channelId = String(d.channel_id);
        // show the typing indicator while the agent works (refresh every 8s)
        const sendTyping = () => fetch(`${API}/channels/${channelId}/typing`, {
          method: "POST", headers: { Authorization: `Bot ${token}` },
        }).catch(() => {});
        sendTyping();
        const typingTimer = setInterval(sendTyping, 8000);
        let reply: string;
        try {
          reply = await handleConnectorMessage("discord", channelId, author.username ?? "user", text, config);
        } catch {
          reply = "Sorry, I hit an error handling that.";
        } finally {
          clearInterval(typingTimer);
        }
        await fetch(`${API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content: reply.slice(0, 1900) }),
        }).catch(() => {});
      }
    };
    ws.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (running) setTimeout(connect, 3000); // reconnect
    };
    ws.onerror = () => log("websocket error");
  }

  connect();

  return () => {
    running = false;
    if (heartbeat) clearInterval(heartbeat);
    try { ws?.close(); } catch { /* ignore */ }
    log("stopped");
  };
}
