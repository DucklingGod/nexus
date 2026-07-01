// SSH tools (Task — remote device control). Lets the agent run commands and
// transfer files on remote hosts configured in the SSH host store (sshStore.ts).
//
// Auth: SSH key file (the key itself is never read by the app — `ssh -i <path>`
// reads it from disk). If a host has no key_path, ssh uses the default ssh
// config / agent. Designed for hosts reachable on a private network such as
// Tailscale. Runs the system ssh / scp binaries (no bundled SSH client needed).

import { exec } from "node:child_process";
import { registerTool } from "./registry.ts";
import { findHost, listHosts } from "./sshStore.ts";

// Common ssh options: accept new host keys once (avoids interactive prompts on
// first connect to a Tailscale host), short connect timeout, batch mode (never
// prompt for a password — fail instead so the agent reports the problem).
const SSH_OPTS = [
  "-o StrictHostKeyChecking=accept-new",
  "-o ConnectTimeout=10",
  "-o BatchMode=yes",
].join(" ");

/** Build the per-host ssh prefix: identity + port + target. */
function sshPrefix(host: { host: string; user: string; port: number; key_path: string | null }): string {
  const parts = ["ssh", SSH_OPTS];
  if (host.key_path) parts.push(`-i ${shellescape(host.key_path)}`);
  if (host.port && host.port !== 22) parts.push(`-p ${host.port}`);
  parts.push(`${shellescape(`${host.user}@${host.host}`)}`);
  return parts.join(" ");
}

/** Minimal POSIX shell escaping for a single argument. */
function shellescape(s: string): string {
  // Safe chars pass through; everything else goes single-quoted.
  if (/^[A-Za-z0-9_\-./:@,+]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

function run(cmd: string, timeoutSec = 30): Promise<{ stdout: string; stderr: string; code: number }> {
  const timeout = timeoutSec * 1000;
  return new Promise((resolve) => {
    exec(cmd, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      // `err.code` is the numeric exit code when the process ran but failed,
      // or a string (e.g. 'ENOENT') when it couldn't spawn. Normalize to a number.
      let code = 0;
      if (err) {
        const c = (err as NodeJS.ErrnoException).code;
        code = typeof c === "number" ? c : -1;
      }
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code });
    });
  });
}

export function registerSshTools(): void {
  registerTool(
    {
      name: "ssh_exec",
      category: "system" as const,
      description:
        "Run a shell command on a remote host over SSH. Use ssh_hosts first to see configured hosts (e.g. machines on a Tailscale network). The host is referenced by name or id. Requires the host to be configured in SSH Hosts settings.",
      parameters: [
        { name: "host", type: "string", description: "Name or id of a configured SSH host", required: true },
        { name: "command", type: "string", description: "Shell command to run on the remote host", required: true },
        { name: "timeout", type: "number", description: "Timeout in seconds (default 30)" },
      ],
      dangerous: true,
    },
    async (args) => {
      const h = findHost(String(args.host));
      if (!h) return { output: "", error: `No SSH host named '${args.host}'. Use the ssh_hosts tool to list configured hosts.` };
      const command = String(args.command);
      const timeout = Number(args.timeout) || 30;
      // Wrap the remote command in single quotes so it runs as one argv on the
      // remote side. Inner single quotes are escaped with the standard trick.
      const remote = `'${command.replace(/'/g, `'"'"'`)}'`;
      const { stdout, stderr, code } = await run(`${sshPrefix(h)} ${remote}`, timeout);
      const out = (stdout.slice(0, 8000) || "") + (stderr ? `\n[stderr]\n${stderr.slice(0, 2000)}` : "");
      if (code !== 0 && code !== null) {
        return { output: out, error: `Remote command exited with code ${code}` };
      }
      return { output: out || "(no output)" };
    },
  );

  registerTool(
    {
      name: "ssh_upload",
      category: "system" as const,
      description:
        "Upload a local file to a remote host via scp. Both source and destination may be absolute paths. The remote host must be configured in SSH Hosts settings.",
      parameters: [
        { name: "host", type: "string", description: "Name or id of a configured SSH host", required: true },
        { name: "local_path", type: "string", description: "Absolute path of the local file to upload", required: true },
        { name: "remote_path", type: "string", description: "Absolute destination path on the remote host", required: true },
      ],
      dangerous: true,
    },
    async (args) => {
      const h = findHost(String(args.host));
      if (!h) return { output: "", error: `No SSH host named '${args.host}'.` };
      const local = shellescape(String(args.local_path));
      const remote = `${shellescape(`${h.user}@${h.host}`)}:${shellescape(String(args.remote_path))}`;
      const port = h.port && h.port !== 22 ? `-P ${h.port}` : "";
      const identity = h.key_path ? `-i ${shellescape(h.key_path)}` : "";
      const cmd = `scp ${SSH_OPTS} ${identity} ${port} ${local} ${remote}`.replace(/\s+/g, " ").trim();
      const { stdout, stderr, code } = await run(cmd, 60);
      if (code !== 0 && code !== null) {
        return { output: stdout.slice(0, 2000), error: `scp upload failed (code ${code}): ${stderr.slice(0, 1500)}` };
      }
      return { output: `Uploaded ${args.local_path} → ${h.name}:${args.remote_path}` };
    },
  );

  registerTool(
    {
      name: "ssh_download",
      category: "system" as const,
      description:
        "Download a remote file to the local machine via scp. Both source and destination may be absolute paths. The remote host must be configured in SSH Hosts settings.",
      parameters: [
        { name: "host", type: "string", description: "Name or id of a configured SSH host", required: true },
        { name: "remote_path", type: "string", description: "Absolute path of the remote file to download", required: true },
        { name: "local_path", type: "string", description: "Absolute destination path on the local machine", required: true },
      ],
      dangerous: true,
    },
    async (args) => {
      const h = findHost(String(args.host));
      if (!h) return { output: "", error: `No SSH host named '${args.host}'.` };
      const remote = `${shellescape(`${h.user}@${h.host}`)}:${shellescape(String(args.remote_path))}`;
      const local = shellescape(String(args.local_path));
      const port = h.port && h.port !== 22 ? `-P ${h.port}` : "";
      const identity = h.key_path ? `-i ${shellescape(h.key_path)}` : "";
      const cmd = `scp ${SSH_OPTS} ${identity} ${port} ${remote} ${local}`.replace(/\s+/g, " ").trim();
      const { stdout, stderr, code } = await run(cmd, 60);
      if (code !== 0 && code !== null) {
        return { output: stdout.slice(0, 2000), error: `scp download failed (code ${code}): ${stderr.slice(0, 1500)}` };
      }
      return { output: `Downloaded ${h.name}:${args.remote_path} → ${args.local_path}` };
    },
  );

  registerTool(
    {
      name: "ssh_hosts",
      category: "system" as const,
      description:
        "List the SSH hosts the agent can reach. Call this before ssh_exec/ssh_upload/ssh_download to learn host names. Each host has a name, host address, user, port, and optional key path.",
      parameters: [],
    },
    async () => {
      const hosts = listHosts();
      if (hosts.length === 0) {
        return { output: "No SSH hosts configured. Add hosts in Settings → SSH Hosts." };
      }
      const lines = hosts.map((h) =>
        `• ${h.name} — ${h.user}@${h.host}:${h.port}${h.key_path ? ` (key: ${h.key_path})` : ""}`,
      );
      return { output: lines.join("\n") };
    },
  );
}
