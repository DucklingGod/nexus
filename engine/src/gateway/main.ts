#!/usr/bin/env node
// Nexus Gateway — standalone background process for platform connectors.
// Runs without Tauri/UI. Receives config via env vars or CLI args.
//
// Usage:
//   node engine/src/gateway/main.ts
//   NEXUS_GATEWAY_CONFIG='{"platform":"telegram","token":"...","config":{...}}' node engine/src/gateway/main.ts
//
// The gateway writes its PID to a file for management by the app.

import { startConnector, stopConnector, connectorStatus } from "../connectors/manager.ts";
import { existsSync, writeFileSync, readFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

// ── PID file management ─────────────────────────────────────────────────────

const DATA_DIR = process.env.NEXUS_DATA_DIR
  ?? join(process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus"), "nexus");
mkdirSync(DATA_DIR, { recursive: true });
const PID_FILE = join(DATA_DIR, "gateway.pid");

function writePid(): void {
  writeFileSync(PID_FILE, String(process.pid), "utf-8");
}

function removePid(): void {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch { /* ignore */ }
}

// ── Config from env ─────────────────────────────────────────────────────────

interface GatewayConfig {
  platform: string;
  token: string;
  config: {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

function loadConfig(): GatewayConfig | null {
  // Try env var first (app passes config this way)
  const envConfig = process.env.NEXUS_GATEWAY_CONFIG;
  if (envConfig) {
    try {
      return JSON.parse(envConfig);
    } catch {
      console.error("[gateway] invalid NEXUS_GATEWAY_CONFIG JSON");
    }
  }

  // Try CLI arg
  const argIdx = process.argv.indexOf("--config");
  if (argIdx >= 0 && process.argv[argIdx + 1]) {
    try {
      return JSON.parse(process.argv[argIdx + 1]);
    } catch {
      console.error("[gateway] invalid --config JSON");
    }
  }

  // Try config file
  const configFile = join(DATA_DIR, "gateway-config.json");
  if (existsSync(configFile)) {
    try {
      return JSON.parse(readFileSync(configFile, "utf-8"));
    } catch {
      console.error("[gateway] invalid gateway-config.json");
    }
  }

  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("[gateway] no config found. Set NEXUS_GATEWAY_CONFIG env var, --config arg, or gateway-config.json");
    process.exit(1);
  }

  // Check if another gateway is already running
  if (existsSync(PID_FILE)) {
    const existingPid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    if (existingPid && !isNaN(existingPid)) {
      try {
        // Check if process is alive
        process.kill(existingPid, 0);
        console.error(`[gateway] another gateway is already running (PID ${existingPid}). Stop it first.`);
        process.exit(1);
      } catch {
        // Process not running, clean up stale PID file
        removePid();
      }
    }
  }

  // Write PID file
  writePid();
  console.log(`[gateway] starting Nexus Gateway (PID ${process.pid})`);
  console.log(`[gateway] platform: ${cfg.platform}`);
  console.log(`[gateway] model: ${cfg.config.model}`);

  // Start connector
  const result = startConnector(cfg.platform, cfg.token, cfg.config);
  if (!result.ok) {
    console.error(`[gateway] failed to start ${cfg.platform}: ${result.error}`);
    removePid();
    process.exit(1);
  }

  console.log(`[gateway] ${cfg.platform} connector started`);
  console.log(`[gateway] gateway is running. Press Ctrl+C to stop.`);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[gateway] shutting down...");
    stopConnector(cfg.platform);
    removePid();
    console.log("[gateway] stopped.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);

  // Keep alive — log status periodically
  setInterval(() => {
    const status = connectorStatus();
    for (const s of status) {
      if (s.running) {
        process.stderr.write(`[gateway] ${s.platform}: ${s.status}\n`);
      }
    }
  }, 60_000); // every minute
}

main();
