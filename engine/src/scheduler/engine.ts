// Cron execution engine for Nexus.
// Runs a tick every 60 seconds, checks all enabled scheduled tasks,
// and fires any that are due. Uses the agent runner to execute prompts.
//
// Schedule formats supported:
//   • Interval: "30m", "2h", "1d" — every N minutes/hours/days
//   • Verbal:   "every 2h", "every 30m" — same as above
//   • Cron:     "0 9 * * *" — standard 5-field cron (min hour day month weekday)
//   • One-shot: ISO timestamp "2026-01-01T09:00:00" — fires once then auto-disables

import { getSetting, setSetting } from "../db/settings.ts";
import { chat } from "../providers/client.ts";
import type { ProviderConfig } from "../providers/types.ts";
import { getProviderConfig } from "../db/settings.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  created_at: number;
  last_run: number | null;
}

interface CronEngineState {
  running: boolean;
  tickInterval: ReturnType<typeof setInterval> | null;
  totalFired: number;
  lastTick: number | null;
}

const state: CronEngineState = {
  running: false,
  tickInterval: null,
  totalFired: 0,
  lastTick: null,
};

// ---------------------------------------------------------------------------
// Task loading (shared with tools/scheduler.ts)
// ---------------------------------------------------------------------------

function loadTasks(): ScheduledTask[] {
  const raw = getSetting("scheduler.tasks");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ScheduledTask[];
  } catch {
    return [];
  }
}

function saveTasks(tasks: ScheduledTask[]): void {
  setSetting("scheduler.tasks", JSON.stringify(tasks));
}

// ---------------------------------------------------------------------------
// Schedule parsing — returns next due timestamp or null if not due
// ---------------------------------------------------------------------------

function isIntervalDue(schedule: string, lastRun: number | null, now: number): boolean {
  // Parse "30m", "2h", "1d", "every 2h"
  const match = schedule.match(/^(?:every\s+)?(\d+)([mhd])$/i);
  if (!match) return false;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  const intervalMs = value * multipliers[unit];

  if (!lastRun) {
    // Never run — check if created_at is older than interval
    return true; // fire on first tick
  }

  return now - lastRun >= intervalMs;
}

function isCronDue(cronExpr: string, lastRun: number | null, now: number): boolean {
  // Parse 5-field cron: "min hour day month weekday"
  // Fields: 0=minute(0-59) 1=hour(0-23) 2=day-of-month(1-31) 3=month(1-12) 4=day-of-week(0-6, 0=Sunday)
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const now2 = new Date(now);

  // Check each field — "*" matches everything, otherwise check numeric match
  const matches = (field: string, value: number): boolean => {
    if (field === "*") return true;
    // Handle ranges "1-5"
    if (field.includes("-")) {
      const [lo, hi] = field.split("-").map(Number);
      return value >= lo && value <= hi;
    }
    // Handle lists "1,3,5"
    if (field.includes(",")) {
      return field.split(",").map(Number).includes(value);
    }
    // Handle step "*/2" or "0-10/2"
    if (field.includes("/")) {
      const [range, stepStr] = field.split("/");
      const step = parseInt(stepStr, 10);
      if (range === "*") return value % step === 0;
      if (range.includes("-")) {
        const [lo, hi] = range.split("-").map(Number);
        return value >= lo && value <= hi && (value - lo) % step === 0;
      }
    }
    return parseInt(field, 10) === value;
  };

  const minute = matches(parts[0], now2.getMinutes());
  const hour = matches(parts[1], now2.getHours());
  const day = matches(parts[2], now2.getDate());
  const month = matches(parts[3], now2.getMonth() + 1);
  const weekday = matches(parts[4], now2.getDay());

  if (!(minute && hour && day && month && weekday)) return false;

  // Only fire once per minute — if last run was in the same minute, skip
  if (lastRun) {
    const lastDate = new Date(lastRun);
    if (
      lastDate.getFullYear() === now2.getFullYear() &&
      lastDate.getMonth() === now2.getMonth() &&
      lastDate.getDate() === now2.getDate() &&
      lastDate.getHours() === now2.getHours() &&
      lastDate.getMinutes() === now2.getMinutes()
    ) {
      return false;
    }
  }

  return true;
}

function isOneShotDue(isoString: string, lastRun: number | null, now: number): boolean {
  // ISO timestamp one-shot — fire when now >= target, only once
  if (lastRun) return false; // already fired
  const target = new Date(isoString).getTime();
  if (isNaN(target)) return false;
  return now >= target;
}

function isTaskDue(task: ScheduledTask, now: number): boolean {
  const schedule = task.schedule.trim().toLowerCase();

  // Interval formats
  if (/^(?:every\s+)?\d+[mhd]$/i.test(schedule)) {
    return isIntervalDue(schedule, task.last_run, now);
  }

  // ISO timestamp one-shot
  if (/^\d{4}-\d{2}-\d{2}T/.test(task.schedule.trim())) {
    return isOneShotDue(task.schedule.trim(), task.last_run, now);
  }

  // Otherwise treat as cron expression
  return isCronDue(task.schedule.trim(), task.last_run, now);
}

// ---------------------------------------------------------------------------
// Task execution
// ---------------------------------------------------------------------------

async function fireTask(task: ScheduledTask): Promise<void> {
  process.stderr.write(`[cron] Firing task: ${task.name} (${task.id})\n`);

  try {
    const providerCfg = getProviderConfig();
    if (!providerCfg) {
      process.stderr.write(`[cron] No provider configured — skipping task ${task.id}\n`);
      return;
    }

    const config: ProviderConfig = {
      id: providerCfg.provider,
      name: providerCfg.provider,
      baseUrl: providerCfg.baseUrl,
      apiKey: "", // engine has key from streamChat brokering
    };

    const result = await chat(config, {
      messages: [{ role: "user", content: task.prompt }],
      model: providerCfg.model,
      maxTokens: 2048,
    });

    process.stderr.write(`[cron] Task "${task.name}" completed — ${result.content?.length ?? 0} chars\n`);
  } catch (e) {
    process.stderr.write(`[cron] Task "${task.name}" failed: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  state.totalFired++;
}

// ---------------------------------------------------------------------------
// Engine loop
// ---------------------------------------------------------------------------

async function tick(): Promise<void> {
  state.lastTick = Date.now();
  const now = Date.now();
  const tasks = loadTasks();
  let modified = false;

  for (const task of tasks) {
    if (!task.enabled) continue;
    if (!isTaskDue(task, now)) continue;

    // Fire the task (non-blocking)
    void fireTask(task).catch(() => {});

    // Update last_run
    task.last_run = now;
    modified = true;

    // Auto-disable one-shot tasks after firing
    if (/^\d{4}-\d{2}-\d{2}T/.test(task.schedule.trim())) {
      task.enabled = false;
    }
  }

  if (modified) saveTasks(tasks);
}

export function startCronEngine(): void {
  if (state.running) return;
  state.running = true;

  // Run first tick after 5 seconds (let engine initialize)
  setTimeout(() => void tick().catch(() => {}), 5000);

  // Then tick every 60 seconds
  state.tickInterval = setInterval(() => void tick().catch(() => {}), 60_000);

  process.stderr.write(`[cron] Engine started — checking every 60s\n`);
}

export function stopCronEngine(): void {
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
    state.tickInterval = null;
  }
  state.running = false;
}

export function getCronEngineState(): CronEngineState {
  return { ...state };
}

/** Run a manual tick now — useful for testing. */
export async function tickNow(): Promise<{ checked: number; fired: number }> {
  const tasks = loadTasks();
  const now = Date.now();
  let fired = 0;
  let modified = false;

  for (const task of tasks) {
    if (!task.enabled) continue;
    if (!isTaskDue(task, now)) continue;
    await fireTask(task);
    task.last_run = now;
    fired++;
    modified = true;
    if (/^\d{4}-\d{2}-\d{2}T/.test(task.schedule.trim())) task.enabled = false;
  }

  if (modified) saveTasks(tasks);
  return { checked: tasks.length, fired };
}
