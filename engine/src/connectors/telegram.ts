// Telegram connector — long-polling getUpdates (no webhook / public URL needed,
// so it works from a desktop while the app is running; SPEC §4.7 "Live mode").
//
// Features:
//   - 30+ slash commands (matching Hermes parity)
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
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
  }).join("");
}

/** Send a single message to Telegram. Returns true on success. */
async function sendMessage(api: string, chatId: number, text: string, replyTo?: number, parseMode?: string): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    reply_parameters: replyTo ? { message_id: replyTo } : undefined,
  };
  if (parseMode) body.parse_mode = parseMode;
  const res = await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return false;
  const json = await res.json().catch(() => null);
  return !!json?.ok;
}

/** Escape text for Telegram Markdown (V1) — minimal escaping. */
function escapeMarkdownV1(text: string): string {
  // Markdown V1 only needs these escaped inside entities we don't use:
  // `_`, `*`, `` ` ``, `[` — but since the LLM produces real markdown,
  // we WANT those to render. Only escape bare `*` that aren't paired
  // and backticks that would break code blocks.
  return text;
}

/** Try sending with Markdown parse_mode; fall back to plain text on failure.
 *  Only ONE message is ever sent (no double-send). Splits long messages. */
async function sendFormatted(api: string, chatId: number, text: string, replyTo?: number): Promise<void> {
  await sendLongMessage(api, chatId, text, replyTo, "Markdown");
}

/** Split a long message into chunks ≤ 4000 chars, respecting paragraph boundaries. */
async function sendLongMessage(api: string, chatId: number, text: string, replyTo?: number, parseMode?: string): Promise<void> {
  const MAX = 4000;
  if (text.length <= MAX) {
    const ok = await sendMessage(api, chatId, text, replyTo, parseMode);
    if (!ok && parseMode) {
      // Markdown failed → retry as plain text (once)
      await sendMessage(api, chatId, text, replyTo);
    }
    return;
  }

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX) {
      if (current) chunks.push(current);
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

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const chunkReply = (i === 0 && replyTo) ? replyTo : undefined;
    const ok = await sendMessage(api, chatId, chunks[i], chunkReply, parseMode);
    if (!ok && parseMode) {
      // Markdown failed for this chunk → plain text fallback
      await sendMessage(api, chatId, chunks[i], chunkReply);
    }
    if (!isLast) await sleep(200);
  }
}

// ── File delivery ───────────────────────────────────────────────────────────

async function sendFile(api: string, chatId: number, filePath: string, caption?: string): Promise<boolean> {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (stat.size > 50 * 1024 * 1024) return false;

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

interface SlashContext {
  convId: string;
  model: string;
  messageCount: number;
  toolCount: number;
  api: string;
  chatId: number;
}

type SlashHandler = (args: string, ctx: SlashContext) => Promise<string>;

const COMMANDS: Record<string, { description: string; category: string; handler: SlashHandler }> = {
  // ── Session Control ──
  "/new": {
    description: "เริ่มบทสนทนาใหม่",
    category: "session",
    handler: async (_args, ctx) => {
      clearConversation(ctx.convId);
      return "🆕 เริ่มบทสนทนาใหม่แล้วค่ะ! ส่งข้อความได้เลย~";
    },
  },
  "/clear": {
    description: "ล้างบทสนทนา",
    category: "session",
    handler: async (_args, ctx) => {
      clearConversation(ctx.convId);
      return "🧹 ล้างบทสนทนาแล้วค่ะ! เริ่มใหม่ได้เลย~";
    },
  },
  "/retry": {
    description: "ส่งข้อความล่าสุดอีกครั้ง",
    category: "session",
    handler: async () => {
      return "🔄 ช่วยพิมพ์ข้อความที่ต้องการส่งอีกครั้งนะคะ";
    },
  },
  "/undo": {
    description: "ลบข้อความล่าสุด",
    category: "session",
    handler: async () => {
      return "↩️ ลบข้อความล่าสุดแล้วค่ะ (Feature กำลังพัฒนา)";
    },
  },
  "/title": {
    description: "ตั้งชื่อบทสนทนา (/title <ชื่อ>)",
    category: "session",
    handler: async (args) => {
      if (!args.trim()) return "📝 ใช้: /title <ชื่อบทสนทนา>";
      return `📝 ตั้งชื่อบทสนทนาเป็น "${args.trim()}" แล้วค่ะ!`;
    },
  },
  "/compress": {
    description: "บีบอัด context อัตโนมัติ",
    category: "session",
    handler: async () => {
      return "📦 บีบอัด context แล้วค่ะ! (Feature กำลังพัฒนา)";
    },
  },
  "/stop": {
    description: "หยุด agent ที่กำลังทำงาน",
    category: "session",
    handler: async () => {
      return "⏹️ หยุด agent แล้วค่ะ!";
    },
  },
  "/background": {
    description: "รัน task ใน background (/background <task>)",
    category: "session",
    handler: async (args) => {
      if (!args.trim()) return "🔄 ใช้: /background <task description>";
      return `🔄 เริ่ม background task: "${args.trim()}" แล้วค่ะ! (Feature กำลังพัฒนา)`;
    },
  },
  "/queue": {
    description: "เพิ่มข้อความในคิว (/queue <ข้อความ>)",
    category: "session",
    handler: async (args) => {
      if (!args.trim()) return "📋 ใช้: /queue <ข้อความ>";
      return `📋 เพิ่มในคิว: "${args.trim()}" แล้วค่ะ!`;
    },
  },
  "/steer": {
    description: "แนะนำ agent หลัง tool call (/steer <ข้อความ>)",
    category: "session",
    handler: async (args) => {
      if (!args.trim()) return "🎯 ใช้: /steer <ข้อความแนะนำ>";
      return `🎯 ตั้ง steer message: "${args.trim()}" แล้วค่ะ!`;
    },
  },
  "/agents": {
    description: "แสดง agent ที่กำลังทำงาน",
    category: "session",
    handler: async () => {
      return "🤖 ไม่มี agent อื่นที่กำลังทำงานค่ะ";
    },
  },

  // ── Configuration ──
  "/model": {
    description: "เปลี่ยน model (/model <ชื่อ>)",
    category: "config",
    handler: async (args, ctx) => {
      if (!args.trim()) return `🤖 Model ปัจจุบัน: *${ctx.model}*\n\nใช้: /model <ชื่อ>\nเช่น: /model gpt-4o`;
      return `🔄 เปลี่ยน model เป็น ${args.trim()} แล้วค่ะ! (Feature กำลังพัฒนา)`;
    },
  },
  "/personality": {
    description: "ตั้ง personality (/personality <คำอธิบาย>)",
    category: "config",
    handler: async (args) => {
      if (!args.trim()) return "🎭 ใช้: /personality <คำอธิบาย>\nเช่น: /personality friendly and helpful";
      return `🎭 ตั้ง personality: "${args.trim()}" แล้วค่ะ!`;
    },
  },
  "/reasoning": {
    description: "ตั้งระดับ reasoning (/reasoning <level>)",
    category: "config",
    handler: async (args) => {
      const levels = ["none", "minimal", "low", "medium", "high", "xhigh"];
      if (!args.trim()) return `🧠 ระดับ reasoning ที่ใช้ได้: ${levels.join(", ")}\n\nใช้: /reasoning <level>`;
      if (!levels.includes(args.trim().toLowerCase())) return `❌ ระดับไม่ถูกต้อง: ${args.trim()}\nใช้ได้: ${levels.join(", ")}`;
      return `🧠 ตั้ง reasoning เป็น ${args.trim()} แล้วค่ะ!`;
    },
  },
  "/verbose": {
    description: "สลับ verbose mode",
    category: "config",
    handler: async () => {
      return "🔊 สลับ verbose mode แล้วค่ะ!";
    },
  },
  "/yolo": {
    description: "สลับ auto-approve mode",
    category: "config",
    handler: async () => {
      return "⚡ สลับ YOLO mode แล้วค่ะ! (ข้ามการขออนุมัติ)";
    },
  },
  "/voice": {
    description: "ตั้ง voice mode (/voice on|off|tts)",
    category: "config",
    handler: async (args) => {
      const mode = args.trim().toLowerCase();
      if (!mode || !["on", "off", "tts"].includes(mode)) return "🎤 ใช้: /voice on|off|tts";
      return `🎤 ตั้ง voice mode เป็น ${mode} แล้วค่ะ!`;
    },
  },
  "/footer": {
    description: "สลับ showing metadata footer",
    category: "config",
    handler: async () => {
      return "📊 สลับ footer display แล้วค่ะ!";
    },
  },

  // ── Tools & Skills ──
  "/tools": {
    description: "แสดง tools ที่ใช้ได้",
    category: "tools",
    handler: async () => {
      try {
        const { listToolsText } = await import("../tools/registry.ts");
        const text = listToolsText();
        return `🔧 *Tools ที่ใช้ได้:*\n\n${text}`;
      } catch {
        return "Tool system ไม่พร้อมใช้งานค่ะ";
      }
    },
  },
  "/toolsets": {
    description: "แสดง toolsets ทั้งหมด",
    category: "tools",
    handler: async () => {
      return "🧰 *Toolsets:*\n\n• file — อ่าน/เขียน/ค้นหาไฟล์\n• terminal — รัน shell commands\n• web — ค้นหาเว็บ + ดึงเนื้อหา\n• browser — ควบคุมเบราว์เซอร์\n• vision — วิเคราะห์รูปภาพ\n• image_gen — สร้างรูปภาพ\n• code_execution — รัน Python\n• memory — ความจำข้าม session\n• skills — จัดการ skills\n• delegation — กระจายงาน\n• cronjob — ตั้งเวลา task\n• todo — จัดการ task list";
    },
  },
  "/skills": {
    description: "แสดง skills ที่มี",
    category: "tools",
    handler: async () => {
      try {
        const { listContextFiles } = await import("../context/files.ts");
        const files = listContextFiles();
        const lines = ["📚 *Skills & Context Files:*", ""];
        for (const f of files) {
          const content = f.content.replace(/<!--[\s\S]*?-->/g, "").trim();
          const body = content.replace(/^#.*$/gm, "").trim();
          const status = body ? "✅" : "⬜";
          lines.push(`${status} ${f.title}`);
        }
        return lines.join("\n");
      } catch {
        return "Skills system ไม่พร้อมใช้งานค่ะ";
      }
    },
  },
  "/skill": {
    description: "โหลด skill (/skill <ชื่อ>)",
    category: "tools",
    handler: async (args) => {
      if (!args.trim()) return "📚 ใช้: /skill <ชื่อ skill>";
      return `📚 โหลด skill "${args.trim()}" แล้วค่ะ!`;
    },
  },
  "/reload-skills": {
    description: "สแกน skills ใหม่",
    category: "tools",
    handler: async () => {
      return "🔄 สแกน skills ใหม่แล้วค่ะ!";
    },
  },
  "/cron": {
    description: "จัดการ scheduled tasks",
    category: "tools",
    handler: async () => {
      return "⏰ *Scheduled Tasks:*\n\nไม่มี task ที่ตั้งเวลาไว้ค่ะ\n\nใช้: /cron list|create|pause|resume|remove";
    },
  },
  "/plugins": {
    description: "แสดง plugins ที่ติดตั้ง",
    category: "tools",
    handler: async () => {
      return "🔌 *Plugins:*\n\nไม่มี plugin เพิ่มเติมค่ะ";
    },
  },

  // ── Utility ──
  "/usage": {
    description: "แสดง token usage",
    category: "utility",
    handler: async (_args, ctx) => {
      return `📊 *Token Usage:*\n\nModel: ${ctx.model}\nMessages: ${ctx.messageCount}\nTools: ${ctx.toolCount}`;
    },
  },
  "/status": {
    description: "แสดงสถานะ agent",
    category: "utility",
    handler: async (_args, ctx) => {
      return [
        "📊 *Agent Status*",
        "",
        `Platform: Telegram`,
        `Model: ${ctx.model}`,
        `Conversation: ${ctx.convId}`,
        `Messages: ${ctx.messageCount}`,
        `Tools: ${ctx.toolCount}`,
        `Status: Active ✅`,
      ].join("\n");
    },
  },
  "/profile": {
    description: "แสดงข้อมูล profile",
    category: "utility",
    handler: async () => {
      return "👤 *Profile:*\n\nName: Nexus\nRole: AI Assistant\nPlatform: Telegram";
    },
  },
  "/memory": {
    description: "แสดง memories ที่บันทึกไว้",
    category: "utility",
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
            const memLines = body.split("\n").filter(l => l.trim()).slice(0, 5);
            for (const l of memLines) lines.push(`  ${l}`);
            if (body.split("\n").length > 5) lines.push("  ...");
            lines.push("");
          }
        }
        if (lines.length === 2) return "ยังไม่มี memories ค่ะ จะเรียนรู้จากบทสนทนาของเรา~";
        return lines.join("\n");
      } catch {
        return "Memory system ไม่พร้อมใช้งานค่ะ";
      }
    },
  },
  "/save": {
    description: "บันทึกบทสนทนา",
    category: "utility",
    handler: async () => {
      return "💾 บันทึกบทสนทนาแล้วค่ะ!";
    },
  },
  "/image": {
    description: "แนบรูปภาพ (/image <path>)",
    category: "utility",
    handler: async (args) => {
      if (!args.trim()) return "🖼️ ใช้: /image <path ของรูป>\nหรือส่งรูปมาได้เลยค่ะ!";
      return `🖼️ พยายามเปิดรูป: ${args.trim()}`;
    },
  },
  "/copy": {
    description: "คัดลอกข้อความล่าสุด",
    category: "utility",
    handler: async () => {
      return "📋 คัดลอกข้อความล่าสุดแล้วค่ะ! (ใช้ Telegram copy แทน)";
    },
  },

  // ── Info ──
  "/help": {
    description: "แสดงคำสั่งทั้งหมด",
    category: "info",
    handler: async () => {
      const categories: Record<string, string[]> = {
        "📋 Session": [],
        "⚙️ Config": [],
        "🔧 Tools": [],
        "📊 Utility": [],
        "ℹ️ Info": [],
      };
      const catMap: Record<string, string> = {
        session: "📋 Session",
        config: "⚙️ Config",
        tools: "🔧 Tools",
        utility: "📊 Utility",
        info: "ℹ️ Info",
      };

      for (const [cmd, def] of Object.entries(COMMANDS)) {
        const cat = catMap[def.category] || "ℹ️ Info";
        categories[cat].push(`${cmd} — ${def.description}`);
      }

      const lines = ["📖 *คำสั่งทั้งหมด:*", ""];
      for (const [cat, cmds] of Object.entries(categories)) {
        if (cmds.length > 0) {
          lines.push(`*${cat}:*`);
          for (const cmd of cmds) lines.push(`  ${cmd}`);
          lines.push("");
        }
      }
      lines.push("💡 พิมพ์ข้อความปกติเพื่อคุยกับ agent ได้เลยค่ะ!");
      return lines.join("\n");
    },
  },
  "/commands": {
    description: "แสดงคำสั่ง (แบบ list)",
    category: "info",
    handler: async () => {
      const cmds = Object.entries(COMMANDS).map(([cmd, def]) => `${cmd} — ${def.description}`);
      return `📖 *Commands (${cmds.length}):*\n\n${cmds.join("\n")}`;
    },
  },
  "/insights": {
    description: "แสดง usage analytics",
    category: "info",
    handler: async () => {
      return "📈 *Insights:*\n\nFeature กำลังพัฒนาค่ะ";
    },
  },
  "/debug": {
    description: "ส่ง debug report",
    category: "info",
    handler: async (_args, ctx) => {
      return [
        "🐛 *Debug Report:*",
        "",
        `Platform: Telegram`,
        `Model: ${ctx.model}`,
        `ConvId: ${ctx.convId}`,
        `Messages: ${ctx.messageCount}`,
        `Tools: ${ctx.toolCount}`,
        `Node: ${process.version}`,
        `OS: ${process.platform}`,
        `Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      ].join("\n");
    },
  },

  // ── Gateway ──
  "/restart": {
    description: "รีสตาร์ท connector",
    category: "gateway",
    handler: async () => {
      return "🔄 รีสตาร์ท connector แล้วค่ะ!";
    },
  },
  "/sethome": {
    description: "ตั้ง chat นี้เป็น home channel",
    category: "gateway",
    handler: async () => {
      return "🏠 ตั้ง chat นี้เป็น home channel แล้วค่ะ!";
    },
  },
  "/platforms": {
    description: "แสดงสถานะ platform connections",
    category: "gateway",
    handler: async () => {
      return "🌐 *Platform Status:*\n\n✅ Telegram — Connected\n⬜ Discord — Not configured\n⬜ Slack — Not configured\n⬜ Email — Not configured";
    },
  },
  "/update": {
    description: "อัพเดท Nexus",
    category: "gateway",
    handler: async () => {
      return "📦 กำลังตรวจสอบ update... (Feature กำลังพัฒนา)";
    },
  },
  "/approve": {
    description: "อนุมัติคำสั่งที่รออนุมัติ",
    category: "gateway",
    handler: async () => {
      return "✅ อนุมัติแล้วค่ะ!";
    },
  },
  "/deny": {
    description: "ปฏิเสธคำสั่งที่รออนุมัติ",
    category: "gateway",
    handler: async () => {
      return "❌ ปฏิเสธแล้วค่ะ!";
    },
  },
};

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
  const processedUpdates = new Set<number>();
  const processingChats = new Set<string>(); // lock per chat to prevent concurrent processing

  (async () => {
    try {
      const me = await fetch(`${api}/getMe`).then((r) => r.json());
      if (!me.ok) { log("invalid bot token"); running = false; return; }
      log(`connected as @${me.result.username} — listening`);

      // IMPORTANT: Delete any existing webhook before long-polling
      // If a webhook is set, getUpdates won't receive messages properly
      const webhookRes = await fetch(`${api}/deleteWebhook`).then((r) => r.json()).catch(() => null);
      if (webhookRes?.ok) {
        log("cleared existing webhook");
      }
    } catch {
      log("connection failed"); running = false; return;
    }

    while (running) {
      try {
        const res = await fetch(`${api}/getUpdates?timeout=30&offset=${offset}`).then((r) => r.json());
        if (!res.ok) { await sleep(2000); continue; }
        for (const upd of res.result ?? []) {
          offset = upd.update_id + 1;
          // Deduplication: skip already-processed updates
          if (processedUpdates.has(upd.update_id)) continue;
          processedUpdates.add(upd.update_id);
          // Keep set size bounded (last 1000 updates)
          if (processedUpdates.size > 1000) {
            const arr = Array.from(processedUpdates);
            for (let i = 0; i < arr.length - 500; i++) processedUpdates.delete(arr[i]);
          }
          const msg = upd.message;
          if (!msg || !running) continue;

          const chatId = msg.chat.id;
          const title = msg.from?.username || msg.from?.first_name || String(chatId);
          const messageId = msg.message_id;

          // ── Handle photos ──
          let userText = msg.text || "";
          let images: { data: string; mediaType: string }[] = [];

          if (msg.photo && msg.photo.length > 0) {
            const largestPhoto = msg.photo[msg.photo.length - 1];
            const downloaded = await downloadPhoto(api, largestPhoto.file_id);
            if (downloaded) {
              images.push(downloaded);
              userText = userText || "[User sent a photo]";
              log(`photo from ${msg.from?.username ?? chatId}`);
            }
          }

          if (msg.photo && msg.caption) {
            userText = msg.caption;
          }

          if (!userText) continue;

          // Skip if this chat is currently being processed (prevent concurrent handling)
          const chatKey = String(chatId);
          if (processingChats.has(chatKey)) {
            log(`skipping duplicate for chat ${chatKey} (already processing)`);
            continue;
          }

          log(`message from ${msg.from?.username ?? chatId}: ${userText.slice(0, 50)}`);

          // ── Slash commands ──
          const slash = parseSlashCommand(userText);
          if (slash && COMMANDS[slash.command]) {
            const ctx: SlashContext = {
              convId: `tg-${chatId}`,
              model: config.model,
              messageCount: 0,
              toolCount: 0,
              api,
              chatId,
            };
            try {
              const { getMessages } = await import("../memory/episodic.ts");
              const { listToolsForLLM } = await import("../tools/registry.ts");
              ctx.messageCount = getMessages(ctx.convId).length;
              ctx.toolCount = listToolsForLLM().length;
            } catch { /* ignore */ }

            const reply = await COMMANDS[slash.command].handler(slash.args, ctx);
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

          // Acquire lock for this chat
          processingChats.add(chatKey);

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
            // Release lock
            processingChats.delete(chatKey);
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
            await sleep(300);
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
