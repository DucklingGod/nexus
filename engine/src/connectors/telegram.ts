// Telegram connector — long-polling getUpdates (no webhook / public URL needed,
// so it works from a desktop while the app is running; SPEC §4.7 "Live mode").

import { type ConnectorConfig } from "./agent.ts";
import { handleConnectorMessage } from "./session.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startTelegram(token: string, config: ConnectorConfig, log: (msg: string) => void): () => void {
  let running = true;
  let offset = 0;
  const api = `https://api.telegram.org/bot${token}`;

  (async () => {
    try {
      const me = await fetch(`${api}/getMe`).then((r) => r.json());
      if (!me.ok) { log("invalid bot token"); running = false; return; }
      log(`connected as @${me.result.username} — listening`);
    } catch {
      log("connection failed"); running = false; return;
    }

    while (running) {
      try {
        const res = await fetch(`${api}/getUpdates?timeout=30&offset=${offset}`).then((r) => r.json());
        if (!res.ok) { await sleep(2000); continue; }
        for (const upd of res.result ?? []) {
          offset = upd.update_id + 1;
          const msg = upd.message;
          if (!msg?.text || !running) continue;
          const chatId = msg.chat.id;
          const title = msg.from?.username || msg.from?.first_name || String(chatId);
          log(`message from ${msg.from?.username ?? chatId}`);
          // show "typing…" under the bot's name while it works (refresh every 4s)
          const sendTyping = () => fetch(`${api}/sendChatAction`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" }),
          }).catch(() => {});
          sendTyping();
          const typingTimer = setInterval(sendTyping, 4000);
          let reply: string;
          try {
            reply = await handleConnectorMessage("telegram", String(chatId), title, msg.text, config);
          } catch {
            reply = "Sorry, I hit an error handling that.";
          } finally {
            clearInterval(typingTimer);
          }
          await fetch(`${api}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: reply.slice(0, 4000) }),
          }).catch(() => {});
        }
      } catch {
        await sleep(2000);
      }
    }
    log("stopped");
  })();

  return () => { running = false; };
}
