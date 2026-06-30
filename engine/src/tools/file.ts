// ponytail: file operations — read, write, list. Sandboxed to NEXUS_WORKDIR or cwd.
// Ceiling: no recursive operations, no symlink following. Upgrade if needed.

import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { registerTool } from "./registry.ts";

// Sandbox: all file ops restricted to this directory
const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

function safePath(p: string): string {
  const full = resolve(WORKDIR, p);
  if (full !== WORKDIR && !full.startsWith(WORKDIR + sep)) throw new Error(`Path escapes sandbox: ${p}`);
  return full;
}

export function registerFileTools(): void {
  registerTool(
    {
      name: "file_read",
      category: "file" as const,
      description: "Read a text file and return its contents.",
      parameters: [
        { name: "path", type: "string", description: "File path (relative to workspace)", required: true },
        { name: "max_lines", type: "number", description: "Max lines to read (default 200)" },
      ],
    },
    async (args) => {
      const p = safePath(String(args.path));
      const max = Number(args.max_lines) || 200;
      const content = await readFile(p, "utf-8");
      const lines = content.split("\n").slice(0, max);
      return { output: lines.join("\n") };
    }
  );

  registerTool(
    {
      name: "file_write",
      category: "file" as const,
      description: "Write text content to a file. Creates parent directories if needed.",
      parameters: [
        { name: "path", type: "string", description: "File path (relative to workspace)", required: true },
        { name: "content", type: "string", description: "Content to write", required: true },
      ],
      dangerous: true,
    },
    async (args) => {
      const p = safePath(String(args.path));
      const content = String(args.content);
      await mkdir(resolve(p, ".."), { recursive: true });
      await writeFile(p, content, "utf-8");
      return { output: `Wrote ${content.length} bytes to ${args.path}` };
    }
  );

  registerTool(
    {
      name: "file_list",
      category: "file" as const,
      description: "List files and directories in a path.",
      parameters: [
        { name: "path", type: "string", description: "Directory path (relative to workspace, default '.')", required: false },
      ],
    },
    async (args) => {
      const p = safePath(String(args.path || "."));
      const entries = await readdir(p, { withFileTypes: true });
      const lines = await Promise.all(
        entries.map(async (e) => {
          const prefix = e.isDirectory() ? "📁" : "📄";
          let size = "";
          if (!e.isDirectory()) {
            try {
              const s = await stat(join(p, e.name));
              size = ` (${s.size} bytes)`;
            } catch { /* ignore */ }
          }
          return `${prefix} ${e.name}${size}`;
        })
      );
      return { output: lines.join("\n") || "(empty directory)" };
    }
  );
}
