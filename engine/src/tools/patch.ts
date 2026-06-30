// ponytail: patch — targeted find-and-replace edits in files
// No fuzzy matching, no diff generation — just exact string replacement

import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { registerTool } from "./registry.ts";

const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

function safePath(p: string): string {
  const full = resolve(WORKDIR, p);
  if (full !== WORKDIR && !full.startsWith(WORKDIR + sep)) throw new Error(`Path escapes sandbox: ${p}`);
  return full;
}

export function registerPatchTools(): void {
  registerTool(
    {
      name: "patch",
      category: "file" as const,
      description: "Find and replace text in a file. Use for targeted edits without rewriting the entire file.",
      parameters: [
        { name: "path", type: "string", description: "File path (relative to workspace)", required: true },
        { name: "old_string", type: "string", description: "Exact text to find", required: true },
        { name: "new_string", type: "string", description: "Replacement text", required: true },
      ],
      dangerous: true,
    },
    async (args) => {
      const p = safePath(String(args.path));
      const oldStr = String(args.old_string);
      const newStr = String(args.new_string);

      const content = await readFile(p, "utf-8");
      const idx = content.indexOf(oldStr);
      if (idx === -1) {
        // ponytail: suggest similar text for user debugging
        const lines = content.split("\n");
        const oldLines = oldStr.split("\n");
        const firstLine = oldLines[0]?.trim();
        const candidates = firstLine
          ? lines.filter(l => l.includes(firstLine.slice(0, 20))).slice(0, 3)
          : [];
        const hint = candidates.length ? `\nSimilar text found:\n${candidates.map(c => `  ${c.trim()}`).join("\n")}` : "";
        return { output: "", error: `Text not found in ${args.path}${hint}` };
      }

      const updated = content.replace(oldStr, newStr);
      await writeFile(p, updated, "utf-8");

      // Count how many chars changed
      const diff = Math.abs(updated.length - content.length);
      return { output: `Patched ${args.path}: replaced ${oldStr.length} chars with ${newStr.length} chars (${diff > 0 ? `±${diff}` : "same length"})` };
    }
  );
}
