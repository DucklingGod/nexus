// Connector manager — starts/stops platform connectors and tracks their status.
// Connectors run inside the engine sidecar while the app is open (Live mode).

import { startTelegram } from "./telegram.ts";
import { startDiscord } from "./discord.ts";
import type { ConnectorConfig } from "./agent.ts";

interface RunningConnector {
  stop: () => void;
  status: string;
}

const running = new Map<string, RunningConnector>();

function makeLog(platform: string) {
  return (msg: string) => {
    const c = running.get(platform);
    if (c) c.status = msg;
    process.stderr.write(`[connector:${platform}] ${msg}\n`);
  };
}

export function startConnector(platform: string, token: string, config: ConnectorConfig): { ok: boolean; error?: string } {
  if (!token) return { ok: false, error: "Missing bot token" };
  if (running.has(platform)) stopConnector(platform);

  const entry: RunningConnector = { stop: () => {}, status: "starting…" };
  running.set(platform, entry);
  const log = makeLog(platform);
  try {
    if (platform === "telegram") entry.stop = startTelegram(token, config, log);
    else if (platform === "discord") entry.stop = startDiscord(token, config, log);
    else {
      running.delete(platform);
      return { ok: false, error: `Unknown platform: ${platform}` };
    }
    return { ok: true };
  } catch (e) {
    running.delete(platform);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function stopConnector(platform: string): void {
  const c = running.get(platform);
  if (c) {
    try { c.stop(); } catch { /* ignore */ }
    running.delete(platform);
  }
}

export function connectorStatus(): { platform: string; running: boolean; status: string }[] {
  return ["telegram", "discord"].map((platform) => {
    const c = running.get(platform);
    return { platform, running: !!c, status: c?.status ?? "not connected" };
  });
}
