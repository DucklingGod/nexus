// ponytail: process — start, list, kill background processes
// Ceiling: no output streaming, no stdin pipe. Upgrade with pty if needed.

import { spawn, type ChildProcess } from "node:child_process";
import { registerTool } from "./registry.ts";

const WORKDIR = process.env.NEXUS_WORKDIR || process.cwd();

// In-memory process store — ponytail: simple map, no persistence
const procs = new Map<string, { child: ChildProcess; label: string; started: number }>();
let nextId = 1;

export function registerProcessTools(): void {
  registerTool(
    {
      name: "process_start",
      category: "system" as const,
      description: "Start a background process. Returns a process ID for later management.",
      parameters: [
        { name: "command", type: "string", description: "Shell command to run in background", required: true },
        { name: "label", type: "string", description: "Human-readable label for the process" },
      ],
      dangerous: true,
    },
    async (args) => {
      const cmd = String(args.command);
      const label = String(args.label || cmd.slice(0, 50));
      const id = `proc_${nextId++}`;

      const child = spawn(cmd, { cwd: WORKDIR, shell: true, stdio: ["ignore", "pipe", "pipe"] });
      procs.set(id, { child, label, started: Date.now() });

      child.on("exit", () => { procs.delete(id); });

      return { output: `Started background process ${id}: ${label} (PID ${child.pid})` };
    }
  );

  registerTool(
    {
      name: "process_list",
      category: "system" as const,
      description: "List all running background processes.",
      parameters: [],
    },
    async () => {
      if (procs.size === 0) return { output: "No background processes running." };
      const lines = Array.from(procs.entries()).map(([id, p]) => {
        const uptime = Math.round((Date.now() - p.started) / 1000);
        return `${id} [PID ${p.child.pid}] ${p.label} (${uptime}s)`;
      });
      return { output: lines.join("\n") };
    }
  );

  registerTool(
    {
      name: "process_kill",
      category: "system" as const,
      description: "Kill a background process by its ID.",
      parameters: [
        { name: "id", type: "string", description: "Process ID (e.g. 'proc_1')", required: true },
      ],
      dangerous: true,
    },
    async (args) => {
      const id = String(args.id);
      const proc = procs.get(id);
      if (!proc) return { output: "", error: `Process ${id} not found` };
      proc.child.kill("SIGTERM");
      procs.delete(id);
      return { output: `Killed ${id}: ${proc.label}` };
    }
  );
}
