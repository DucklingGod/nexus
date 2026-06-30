// ponytail: execute_code — run Python or Node scripts in isolated subprocess
// Ceiling: no sandboxing beyond subprocess isolation. Upgrade with containers if needed.

import { exec } from "node:child_process";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerTool } from "./registry.ts";

const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

export function registerCodeTools(): void {
  registerTool(
    {
      name: "execute_code",
      category: "code" as const,
      description: "Execute a Python or Node.js script and return output. Scripts run in isolated temp directories.",
      parameters: [
        { name: "language", type: "string", description: "'python' or 'node'", required: true },
        { name: "code", type: "string", description: "Code to execute", required: true },
        { name: "timeout", type: "number", description: "Timeout in seconds (default 30)" },
      ],
      dangerous: true,
    },
    async (args) => {
      const lang = String(args.language).toLowerCase();
      const code = String(args.code);
      const timeout = (Number(args.timeout) || 30) * 1000;

      // Write code to temp file
      const tmpDir = await mkdtemp(join(tmpdir(), "nexus-code-"));
      const ext = lang === "python" || lang === "py" ? "py" : "js";
      const cmd = ext === "py" ? "python" : "node";
      const filePath = join(tmpDir, `script.${ext}`);

      await writeFile(filePath, code, "utf-8");

      return new Promise((resolve) => {
        exec(`${cmd} "${filePath}"`, { cwd: WORKDIR, timeout, maxBuffer: 1024 * 1024 }, async (err, stdout, stderr) => {
          // Cleanup temp file
          await unlink(filePath).catch(() => {});

          if (err) {
            resolve({
              output: stdout?.slice(0, 4000) || "",
              error: `${err.message}\n${stderr?.slice(0, 2000) || ""}`,
            });
          } else {
            resolve({
              output: (stdout?.slice(0, 8000) || "") + (stderr ? `\n[stderr]\n${stderr.slice(0, 2000)}` : ""),
            });
          }
        });
      });
    }
  );
}
