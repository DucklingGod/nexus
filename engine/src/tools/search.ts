// ponytail: search_files — grep content or find files by name
// Uses Node's fs + child_process (ripgrep if available, fallback to naive scan).
// Full machine reach: absolute paths resolve anywhere; relative under WORKDIR.

import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { exec } from "node:child_process";
import { registerTool } from "./registry.ts";

const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

function safePath(p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(WORKDIR, p);
}

function runRg(args: string): Promise<string> {
  return new Promise((resolve) => {
    exec(`rg ${args}`, { cwd: WORKDIR, timeout: 10000, maxBuffer: 512 * 1024 }, (err, stdout) => {
      resolve(stdout || "");
    });
  });
}

// Strip the search root from a full path for display (relative-looking output).
function relPath(full: string, root: string): string {
  if (full === root || full.startsWith(root + "/") || full.startsWith(root + "\\")) {
    const r = full.slice(root.length).replace(/^[\\/]/, "");
    return r || full;
  }
  return full;
}

async function naiveGrep(pattern: string, dir: string, glob?: string, limit = 30): Promise<string> {
  const results: string[] = [];
  const re = new RegExp(pattern, "gi");

  async function walk(d: string, depth: number) {
    if (depth > 4 || results.length >= limit) return;
    try {
      const entries = await readdir(d, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= limit) break;
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const full = join(d, e.name);
        if (e.isDirectory()) {
          await walk(full, depth + 1);
        } else {
          if (glob && !e.name.match(new RegExp(glob.replace("*", ".*"), "i"))) continue;
          try {
            const content = await readFile(full, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i])) {
                results.push(`${relPath(full, dir)}:${i + 1}: ${lines[i].trim()}`);
                re.lastIndex = 0;
              }
            }
          } catch { /* binary or unreadable */ }
        }
      }
    } catch { /* permission denied */ }
  }

  await walk(dir, 0);
  return results.join("\n") || "(no matches)";
}

export function registerSearchTools(): void {
  registerTool(
    {
      name: "search_files",
      category: "file" as const,
      description: "Search file contents (grep) or find files by name. Supports regex patterns and glob filters. The path may be absolute (anywhere on the host) or relative to the working directory.",
      parameters: [
        { name: "pattern", type: "string", description: "Regex pattern to search for", required: true },
        { name: "path", type: "string", description: "Directory or file to search in — absolute or relative (default: working dir root)" },
        { name: "glob", type: "string", description: "File glob filter (e.g. '*.ts', '*.py')" },
        { name: "mode", type: "string", description: "'content' (grep, default) or 'files' (find by name)" },
        { name: "limit", type: "number", description: "Max results (default 30)" },
      ],
    },
    async (args) => {
      const pattern = String(args.pattern);
      const dir = args.path ? safePath(String(args.path)) : WORKDIR;
      const glob = args.glob ? String(args.glob) : undefined;
      const mode = String(args.mode || "content");
      const limit = Number(args.limit) || 30;

      // Try ripgrep first (faster), fallback to naive scan
      try {
        let rgArgs = `--no-heading -n --max-count ${limit}`;
        if (glob) rgArgs += ` -g '${glob}'`;
        if (mode === "files") rgArgs += ` --files-with-matches`;
        rgArgs += ` '${pattern}' '${dir}'`;
        const result = await runRg(rgArgs);
        return { output: result.trim() || "(no matches — tried ripgrep)" };
      } catch {
        // ripgrep not available, use naive scan
        if (mode === "files") {
          // Find files by name pattern
          const results: string[] = [];
          const re = new RegExp(pattern, "i");
          async function walk(d: string, depth: number) {
            if (depth > 5 || results.length >= limit) return;
            try {
              const entries = await readdir(d, { withFileTypes: true });
              for (const e of entries) {
                if (results.length >= limit) break;
                if (e.name.startsWith(".") || e.name === "node_modules") continue;
                const full = join(d, e.name);
                if (e.isDirectory()) { await walk(full, depth + 1); }
                else if (re.test(e.name)) {
                  results.push(relPath(full, dir));
                }
              }
            } catch { /* skip */ }
          }
          await walk(dir, 0);
          return { output: results.join("\n") || "(no files found)" };
        }
        return { output: await naiveGrep(pattern, dir, glob, limit) };
      }
    }
  );
}
