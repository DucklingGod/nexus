// ponytail: patch — targeted find-and-replace edits in files
// No fuzzy matching, no diff generation — just exact string replacement.
// Full machine reach: absolute paths resolve anywhere; relative paths under
// the working dir. Writes are gated by the Safety Mode + approval flow.

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { registerTool } from "./registry.ts";

const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

function safePath(p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(WORKDIR, p);
}

export function registerPatchTools(): void {
  registerTool(
    {
      name: "patch",
      category: "file" as const,
      description: "Find and replace text in a file. Use for targeted edits without rewriting the entire file. Accepts absolute or relative paths anywhere on the host.",
      parameters: [
        { name: "path", type: "string", description: "File path — absolute or relative to the working directory", required: true },
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
