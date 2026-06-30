// Session search tool: search past conversations stored in SQLite.
// Uses the episodic memory DB schema (conversations + messages tables).

import { registerTool } from "./registry.ts";
import { default as Database } from "better-sqlite3";
import { join } from "node:path";

// Connect to the same DB as episodic.ts
const DATA_DIR = join(
  process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"),
  "nexus",
);
const db = new Database(join(DATA_DIR, "nexus.db"), { readonly: true });

export function registerSessionSearchTool(): void {
  registerTool(
    {
      name: "session_search",
      category: "knowledge" as const,
      description:
        "Search past conversation history. Returns matching messages with conversation title and timestamp. " +
        "Useful for recalling what was discussed previously.",
      parameters: [
        { name: "query", type: "string", description: "Search query — finds messages containing this text", required: true },
        { name: "limit", type: "number", description: "Max results to return (default: 5, max: 20)" },
      ],
    },
    async (args) => {
      const query = String(args.query).trim();
      const limit = Math.min(Number(args.limit) || 5, 20);

      if (!query) return { output: "Please provide a search query." };

      try {
        // Search messages with LIKE, join to conversations for context
        const rows = db
          .prepare(
            `SELECT m.content, m.role, m.timestamp, c.title, c.id as conv_id, c.source
             FROM messages m
             JOIN conversations c ON m.conversation_id = c.id
             WHERE m.content LIKE '%' || ? || '%'
             ORDER BY m.timestamp DESC
             LIMIT ?`,
          )
          .all(query, limit) as {
            content: string;
            role: string;
            timestamp: number;
            title: string;
            conv_id: string;
            source: string;
          }[];

        if (rows.length === 0) {
          return { output: `No conversations found matching "${query}".` };
        }

        const lines = rows.map((r, i) => {
          const date = new Date(r.timestamp).toLocaleString();
          const roleLabel = r.role === "user" ? "👤 User" : "🤖 Assistant";
          const sourceTag = r.source !== "local" ? ` [${r.source}]` : "";
          // Truncate long messages
          const content = r.content.length > 300 ? r.content.slice(0, 300) + "…" : r.content;
          return `${i + 1}. ${r.title}${sourceTag} — ${date}\n   ${roleLabel}: ${content}`;
        });

        return {
          output: `Found ${rows.length} result(s) for "${query}":\n\n${lines.join("\n\n")}`,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Search failed: ${msg}` };
      }
    },
  );
}
