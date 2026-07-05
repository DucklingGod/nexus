// Matrix connector — Client-Server API `/sync` long-poll (plain HTTPS, no
// public URL needed — same "Live mode" model as Telegram). Needs a homeserver
// URL + an access token for a dedicated bot account (create one on the
// homeserver, then get its access token via /login or the homeserver admin UI).
//
// Credentials are a JSON blob (homeserver URL varies per user, unlike a bot
// token alone) — see MatrixCreds below.

import { randomUUID } from "node:crypto";
import { type ConnectorConfig } from "./agent.ts";
import { handleConnectorMessage } from "./session.ts";

export interface MatrixCreds { homeserverUrl: string; accessToken: string }

/** Parse the stored credential blob; throws a clear error if it's malformed. */
export function parseMatrixCreds(raw: string): MatrixCreds {
  const parsed = JSON.parse(raw) as Partial<MatrixCreds>;
  if (!parsed.homeserverUrl || !parsed.accessToken) throw new Error("Matrix credentials missing homeserverUrl/accessToken");
  return { homeserverUrl: parsed.homeserverUrl.replace(/\/+$/, ""), accessToken: parsed.accessToken };
}

export function startMatrix(token: string, config: ConnectorConfig, log: (msg: string) => void): () => void {
  let running = true;
  let creds: MatrixCreds;
  try {
    creds = parseMatrixCreds(token);
  } catch (e) {
    log(e instanceof Error ? e.message : "invalid Matrix credentials");
    return () => {};
  }
  const { homeserverUrl, accessToken } = creds;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const api = (path: string) => `${homeserverUrl}/_matrix/client/v3${path}`;

  let selfId = "";
  let since: string | undefined;

  async function joinInvites(rooms: Record<string, unknown> | undefined) {
    for (const roomId of Object.keys(rooms ?? {})) {
      await fetch(api(`/join/${encodeURIComponent(roomId)}`), { method: "POST", headers }).catch(() => {});
    }
  }

  async function sendTyping(roomId: string, typing: boolean) {
    await fetch(api(`/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(selfId)}`), {
      method: "PUT", headers, body: JSON.stringify({ typing, timeout: 25000 }),
    }).catch(() => {});
  }

  async function sendMessage(roomId: string, text: string) {
    const txnId = randomUUID();
    await fetch(api(`/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`), {
      method: "PUT", headers, body: JSON.stringify({ msgtype: "m.text", body: text.slice(0, 8000) }),
    }).catch(() => {});
  }

  (async () => {
    try {
      const whoami = await fetch(api("/account/whoami"), { headers }).then((r) => r.json()) as { user_id?: string; errcode?: string };
      if (!whoami.user_id) { log(`auth failed: ${whoami.errcode ?? "invalid token"}`); return; }
      selfId = whoami.user_id;
      // Initial sync just establishes the `since` cursor — don't reply to history.
      const first = await fetch(api("/sync?timeout=0"), { headers }).then((r) => r.json()) as { next_batch: string };
      since = first.next_batch;
      log(`connected as ${selfId} — listening`);
    } catch {
      log("connection failed"); running = false; return;
    }

    while (running) {
      try {
        const res = await fetch(api(`/sync?since=${encodeURIComponent(since ?? "")}&timeout=30000`), { headers }).then((r) => r.json()) as {
          next_batch: string;
          rooms?: { join?: Record<string, { timeline?: { events?: Array<Record<string, unknown>> } }>; invite?: Record<string, unknown> };
        };
        if (!running) break;
        since = res.next_batch;
        await joinInvites(res.rooms?.invite);

        for (const [roomId, room] of Object.entries(res.rooms?.join ?? {})) {
          for (const event of room.timeline?.events ?? []) {
            if (event.type !== "m.room.message") continue;
            if (event.sender === selfId) continue;
            const content = event.content as { msgtype?: string; body?: string } | undefined;
            if (content?.msgtype !== "m.text" || !content.body?.trim()) continue;
            const text = content.body.trim();
            const sender = String(event.sender ?? "");
            log(`message from ${sender}`);
            await sendTyping(roomId, true);
            let reply: string;
            try {
              reply = await handleConnectorMessage("matrix", roomId, sender, text, config);
            } catch {
              reply = "Sorry, I hit an error handling that.";
            } finally {
              await sendTyping(roomId, false);
            }
            await sendMessage(roomId, reply);
          }
        }
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    log("stopped");
  })();

  return () => { running = false; };
}
