// ponytail: terminal command execution — sandboxed subprocess
// Ceiling: no timeout, no resource limits. Upgrade with spawn timeout + memory cap if needed.

import { exec } from "node:child_process";
import { registerTool } from "./registry.ts";

const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

export function registerTerminalTools(): void {
  registerTool(
    {
      name: "terminal_exec",
      category: "system" as const,
      description: "Execute a shell command on the host machine and return its output. Use for running scripts, installing packages, git operations, listing files (e.g. `ls ~/Desktop`), etc. Commands run in the working directory by default but can reference or `cd` to any absolute path.",
      parameters: [
        { name: "command", type: "string", description: "Shell command to execute", required: true },
        { name: "timeout", type: "number", description: "Timeout in seconds (default 30)" },
      ],
      dangerous: true,
    },
    async (args) => {
      const cmd = String(args.command);
      const timeout = (Number(args.timeout) || 30) * 1000;

      return new Promise((resolve) => {
        exec(cmd, { cwd: WORKDIR, timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
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
