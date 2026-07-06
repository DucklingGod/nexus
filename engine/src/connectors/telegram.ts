// Telegram connector — long-polling getUpdates (no webhook / public URL needed,
// so it works from a desktop while the app is running; SPEC §4.7 "Live mode").
//
// Features:
//   - Slash commands: /help, /clear, /status, /model, /memory, /tools
//   - Image/photo handling (download + pass to agent)
//   - Message splitting (>4000 chars → multiple messages)
//   - MarkdownV2 formatting (auto-escape special chars)
//   - File delivery (sendDocument for agent-created files)
//   - Typing indicator
//   - Reply-to-message for context

import { type ConnectorConfig } from "./agent.ts";
import { handleConnectorMessage, clearConversation } from "./session.ts";
import { existsSync, readFileSync, statSync } from "node:fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Telegram MarkdownV2 helpers ─────────────────────────────────────────────

/** Escape text for Telegram MarkdownV2 parse mode.
 *  Must escape: _ * [ ] ( ) ~ ` > # + - = | { } . !
 *  But NOT inside code blocks (``` or `). */
function escapeMarkdownV2(text: string): string {
  // Split by code blocks to avoid escaping inside them
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts.map((part, i) => {
    // Odd indices are code blocks — don't escape
    if (i % 2 === 1) return part;
    // Escape special MarkdownV2 characters
    return part.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
  }).join("");
}

/** Try to send with MarkdownV2; fall back to plain text if Telegram rejects it. */
async function sendFormatted(api: string, chatId: number, text: string, replyTo?: number): Promise<void> {
  // For short messages, try MarkdownV2
  if (text.length <= 4000) {
    const escaped = escapeMarkdownV2(text);
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: escaped,
      parse_mode: "MarkdownV2",
      reply_parameters: replyTo ? { message_id: replyTo } : undefined,
    };
    const res = await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => ({ ok: false }));

    if (res.ok) return;
    // Fallback: plain text
  }

  // Plain text fallback (also handles long messages that get split)
  await sendLongMessage(api, chatId, text, replyTo);
}

/** Split a long message into chunks ≤ 4000 chars, respecting paragraph boundaries. */
async function sendLongMessage(api: string, chatId: number, text: string, replyTo?: number): Promise<void> {
  const MAX = 4000;
  if (text.length <= MAX) {
    await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      }),
    }).catch(() => {});
    return;
  }

  // Split by double newlines (paragraphs), then merge into chunks ≤ MAX
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX) {
      if (current) chunks.push(current);
      // If a single paragraph is > MAX, split by lines
      if (para.length > MAX) {
        const lines = para.split("\n");
        let lineChunk = "";
        for (const line of lines) {
          if (lineChunk.length + line.length + 1 > MAX) {
            if (lineChunk) chunks.push(lineChunk);
            lineChunk = line;
          } else {
            lineChunk = lineChunk ? `${lineChunk}\n${line}` : line;
          }
        }
        current = lineChunk;
      } else {
        current = para;
      }
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);

  // Send each chunk
  for (let i = 0; i < chunks.length; i++) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[i],
      reply_parameters: (i === 0 && replyTo) ? { message_id: replyTo } : undefined,
    };
    await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    // Small delay between chunks to maintain order
    if (i < chunks.length - 1) await sleep(200);
  }
}

// ── File delivery ───────────────────────────────────────────────────────────

/** Send a file to the user via Telegram sendDocument. */
async function sendFile(api: string, chatId: number, filePath: string, caption?: string): Promise<boolean> {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (stat.size > 50 * 1024 * 1024) return false; // 50MB Telegram limit

  const fileName = filePath.split(/[/\\]/).pop() || "file";
  const fileBuffer = readFileSync(filePath);

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([fileBuffer]), fileName);
  if (caption) form.append("caption", caption.slice(0, 1024));

  const res = await fetch(`${api}/sendDocument`, {
    method: "POST",
    body: form,
  }).then(r => r.json()).catch(() => ({ ok: false }));

  return !!res.ok;
}

/** Send a photo to the user via Telegram sendPhoto. */
async function sendPhoto(api: string, chatId: number, filePath: string, caption?: string): Promise<boolean> {
  if (!existsSync(filePath)) return false;

  const fileBuffer = readFileSync(filePath);
  const fileName = filePath.split(/[/\\]/).pop() || "photo.jpg";

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([fileBuffer]), fileName);
  if (caption) form.append("caption", caption.slice(0, 1024));

  const res = await fetch(`${api}/sendPhoto`, {
    method: "POST",
    body: form,
  }).then(r => r.json()).catch(() => ({ ok: false }));

  return !!res.ok;
}

// ── Image handling ──────────────────────────────────────────────────────────

/** Download a Telegram photo and return base64 data. */
async function downloadPhoto(api: string, fileId: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const fileInfo = await fetch(`${api}/getFile?file_id=${fileId}`).then(r => r.json());
    if (!fileInfo.ok || !fileInfo.result?.file_path) return null;

    const fileUrl = `https://api.telegram.org/file/bot${api.split("/bot")[1]}/${fileInfo.result.file_path}`;
    const response = await fetch(fileUrl);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const ext = fileInfo.result.file_path.split(".").pop()?.toLowerCase() || "jpg";
    const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    return { data: base64, mediaType };
  } catch {
    return null;
  }
}

// ── Slash commands ──────────────────────────────────────────────────────────

const SLASH_COMMANDS: Record<string, { description: string; handler: (args: string, ctx: SlashContext) => Promise<string> }> = {
  "/help": {
    description: "Show available commands",
    handler: async () => {
      const lines = ["📋 *Available commands:*", ""];
      for (const [cmd, def] of Object.entries(SLASH_COMMANDS)) {
        lines.push(`${cmd} — ${def.description}`);
      }
      lines.push("", "Or just type a message and I'll help you!");
      return lines.join("\n");
    },
  },
  "/clear": {
    description: "Clear conversation history",
    handler: async (_args, ctx) => {
      clearConversation(ctx.convId);
      return "🧹 Conversation cleared! Starting fresh.";
    },
  },
  "/status": {
    description: "Show agent status",
    handler: async (_args, ctx) => {
      const lines = [
        "📊 *Agent Status*",
        "",
        `Platform: Telegram`,
        `Model: ${ctx.model}`,
        `Conversation: ${ctx.convId}`,
        `Messages: ${ctx.messageCount}`,
        `Tools available: ${ctx.toolCount}`,
      ];
      return lines.join("\n");
    },
  },
  "/model": {
    description: "Switch model (/model <name>)",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        return `Current model: *${ctx.model}*\n\nUsage: /model <name>\nExample: /model gpt-4o`;
      }
      // Note: model switching would need config update — for now just report
      return `Model switching via Telegram coming soon. Current model: *${ctx.model}*`;
    },
  },
  "/memory": {
    description: "Show saved memories",
    handler: async () => {
      try {
        const { listContextFiles } = await import("../context/files.ts");
        const files = listContextFiles();
        const lines = ["🧠 *Saved memories:*", ""];
        for (const f of files) {
          const content = f.content.replace(/<!--[\s\S]*?-->/g, "").trim();
          const body = content.replace(/^#.*$/gm, "").trim();
          if (body) {
            lines.push(`*${f.title}:*`);
            // Show first 5 lines max
            const memLines = body.split("\n").filter(l => l.trim()).slice(0, 5);
            for (const l of memLines) lines.push(`  ${l}`);
            if (body.split("\n").length > 5) lines.push("  ...");
            lines.push("");
          }
        }
        if (lines.length === 2) return "No memories saved yet. I'll learn as we chat!";
        return lines.join("\n");
      } catch {
        return "Memory system not available.";
      }
    },
  },
  "/tools": {
    description: "List available tools",
    handler: async () => {
      try {
        const { listToolsText } = await import("../tools/registry.ts");
        const text = listToolsText();
        return `🔧 *Available tools:*\n\n${text}`;
      } catch {
        return "Tool system not available.";
      }
    },
  },
};

interface SlashContext {
  convId: string;
  model: string;
  messageCount: number;
  toolCount: number;
}

function parseSlashCommand(text: string): { command: string; args: string } | null {
  const match = text.trim().match(/^\/(\w+)(?:\s+(.*))?$/s);
  if (!match) return null;
  return { command: `/${match[1].toLowerCase()}`, args: match[2] || "" };
}

// ── Main connector ──────────────────────────────────────────────────────────

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
          if (!msg || !running) continue;

          const chatId = msg.chat.id;
          const title = msg.from?.username || msg.from?.first_name || String(chatId);
          const messageId = msg.message_id;

          // ── Handle photos ──
          let userText = msg.text || "";
          let images: { data: string; mediaType: string }[] = [];

          if (msg.photo && msg.photo.length > 0) {
            // Get the largest photo (last in array)
            const largestPhoto = msg.photo[msg.photo.length - 1];
            const downloaded = await downloadPhoto(api, largestPhoto.file_id);
            if (downloaded) {
              images.push(downloaded);
              userText = userText || "[User sent a photo]";
              log(`photo from ${msg.from?.username ?? chatId}`);
            }
          }

          // Handle photo with caption
          if (msg.photo && msg.caption) {
            userText = msg.caption;
          }

          if (!userText) continue;

          log(`message from ${msg.from?.username ?? chatId}: ${userText.slice(0, 50)}`);

          // ── Slash commands ──
          const slash = parseSlashCommand(userText);
          if (slash && SLASH_COMMANDS[slash.command]) {
            const ctx: SlashContext = {
              convId: `tg-${chatId}`,
              model: config.model,
              messageCount: 0, // Will be filled by session
              toolCount: 0,
            };
            try {
              const { getMessages } = await import("../memory/episodic.ts");
              const { listToolsForLLM } = await import("../tools/registry.ts");
              ctx.messageCount = getMessages(ctx.convId).length;
              ctx.toolCount = listToolsForLLM().length;
            } catch { /* ignore */ }

            const reply = await SLASH_COMMANDS[slash.command].handler(slash.args, ctx);
            await sendFormatted(api, chatId, reply, messageId);
            continue;
          }

          // ── Regular message: run agent ──
          const sendTyping = () => fetch(`${api}/sendChatAction`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" }),
          }).catch(() => {});
          sendTyping();
          const typingTimer = setInterval(sendTyping, 4000);

          let reply: string;
          let attachments: string[] = [];
          try {
            const result = await handleConnectorMessage(
              "telegram", String(chatId), title, userText, config, images.length > 0 ? images : undefined,
            );
            reply = result.text;
            attachments = result.attachments;
          } catch {
            reply = "Sorry, I hit an error handling that.";
          } finally {
            clearInterval(typingTimer);
          }

          // ── Send reply with formatting ──
          await sendFormatted(api, chatId, reply, messageId);

          // ── Send any file attachments ──
          for (const filePath of attachments) {
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(filePath);
            if (isImage) {
              await sendPhoto(api, chatId, filePath);
            } else {
              await sendFile(api, chatId, filePath);
            }
            await sleep(300); // Small delay between files
          }
        }
      } catch {
        await sleep(2000);
      }
    }
    log("stopped");
  })();

  return () => { running = false; };
}
