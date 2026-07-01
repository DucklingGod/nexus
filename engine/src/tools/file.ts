// ponytail: file operations — read, write, list.
// Full machine reach (like Claude Code / Hermes): absolute paths resolve
// anywhere on the host; relative paths resolve against the working dir.
// Security boundary is the Safety Mode + approval gate (writes are `dangerous`),
// not a path sandbox. Ceiling: no symlink following. Upgrade if needed.

import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { registerTool } from "./registry.ts";

// Relative paths resolve here; absolute paths are used as-is.
const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

// Resolve a user-supplied path: absolute → as-is, relative → under WORKDIR.
function safePath(p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(WORKDIR, p);
}

export function registerFileTools(): void {
  registerTool(
    {
      name: "file_read",
      category: "file" as const,
      description: "Read a text file and return its contents. Accepts absolute paths anywhere on the host machine (e.g. /Users/.../Desktop/file.txt, ~/Documents/...) or paths relative to the working directory.",
      parameters: [
        { name: "path", type: "string", description: "File path — absolute or relative to the working directory", required: true },
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
      description: "Write text content to a file. Creates parent directories if needed. Accepts absolute or relative paths anywhere on the host.",
      parameters: [
        { name: "path", type: "string", description: "File path — absolute or relative to the working directory", required: true },
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
      description: "List files and directories in a path. Accepts absolute or relative paths anywhere on the host.",
      parameters: [
        { name: "path", type: "string", description: "Directory path — absolute or relative to the working directory (default '.')", required: false },
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
