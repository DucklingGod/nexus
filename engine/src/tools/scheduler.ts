// Scheduler tools: simple cron-like task scheduling stored in SQLite settings.
// Tasks are stored as JSON in setting key 'scheduler.tasks'.
// The Tauri core (Rust) is responsible for actually firing tasks on schedule;
// these tools provide CRUD for the task list.

import { registerTool } from "./registry.ts";
import { getSetting, setSetting } from "../db/settings.ts";

interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  created_at: number;
  last_run: number | null;
}

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

function formatSchedule(s: string): string {
  if (s.startsWith("every ")) return s; // "every 2h"
  if (/^\d+[mhs]$/.test(s)) return s; // "30m", "2h", "1d"
  return s; // cron expression as-is
}

export function registerSchedulerTools(): void {
  registerTool(
    {
      name: "schedule_create",
      category: "utility" as const,
      description:
        "Create a scheduled task. The task runs on a recurring schedule and executes the given prompt. " +
        'Schedule formats: "30m" (every 30 min), "every 2h" (every 2 hours), "0 9 * * *" (cron: daily at 9am), "2026-01-01T09:00:00" (one-shot).',
      parameters: [
        { name: "name", type: "string", description: "Human-friendly name for the task", required: true },
        { name: "prompt", type: "string", description: "What the agent should do when this task fires", required: true },
        { name: "schedule", type: "string", description: 'Schedule: "30m", "every 2h", "0 9 * * *", or ISO timestamp', required: true },
        { name: "enabled", type: "boolean", description: "Whether the task is active (default: true)" },
      ],
    },
    async (args) => {
      const name = String(args.name);
      const prompt = String(args.prompt);
      const schedule = formatSchedule(String(args.schedule));
      const enabled = args.enabled !== false;

      const tasks = loadTasks();
      const task: ScheduledTask = {
        id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        prompt,
        schedule,
        enabled,
        created_at: Date.now(),
        last_run: null,
      };
      tasks.push(task);
      saveTasks(tasks);

      return {
        output: `Scheduled task created!\nID: ${task.id}\nName: ${task.name}\nSchedule: ${task.schedule}\nEnabled: ${task.enabled}\nPrompt: ${task.prompt.slice(0, 200)}`,
      };
    },
  );

  registerTool(
    {
      name: "schedule_list",
      category: "utility" as const,
      description: "List all scheduled tasks.",
      parameters: [],
    },
    async () => {
      const tasks = loadTasks();
      if (tasks.length === 0) return { output: "No scheduled tasks." };

      const lines = tasks.map((t, i) => {
        const status = t.enabled ? "✅ active" : "⏸️ paused";
        const lastRun = t.last_run ? new Date(t.last_run).toISOString() : "never";
        return `${i + 1}. [${t.id}] ${t.name} — ${status}\n   Schedule: ${t.schedule}\n   Last run: ${lastRun}\n   Prompt: ${t.prompt.slice(0, 100)}`;
      });
      return { output: `Scheduled Tasks (${tasks.length}):\n\n${lines.join("\n\n")}` };
    },
  );

  registerTool(
    {
      name: "schedule_remove",
      category: "utility" as const,
      description: "Remove a scheduled task by ID.",
      parameters: [{ name: "id", type: "string", description: "Task ID to remove", required: true }],
    },
    async (args) => {
      const id = String(args.id);
      const tasks = loadTasks();
      const before = tasks.length;
      const filtered = tasks.filter((t) => t.id !== id);
      if (filtered.length === before) return { output: `No task found with ID: ${id}` };
      saveTasks(filtered);
      return { output: `Removed task: ${id}` };
    },
  );

  registerTool(
    {
      name: "schedule_toggle",
      category: "utility" as const,
      description: "Enable or disable a scheduled task.",
      parameters: [
        { name: "id", type: "string", description: "Task ID", required: true },
        { name: "enabled", type: "boolean", description: "true to enable, false to disable", required: true },
      ],
    },
    async (args) => {
      const id = String(args.id);
      const enabled = Boolean(args.enabled);
      const tasks = loadTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) return { output: `No task found with ID: ${id}` };
      task.enabled = enabled;
      saveTasks(tasks);
      return { output: `Task "${task.name}" (${id}) is now ${enabled ? "enabled ✅" : "disabled ⏸️"}` };
    },
  );
}
