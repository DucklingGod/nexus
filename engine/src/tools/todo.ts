// ponytail: todo — simple in-memory task list for the current session
// No persistence — resets on engine restart. Upgrade to SQLite if needed.

import { registerTool } from "./registry.ts";

interface Task {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

let tasks: Task[] = [];
let nextId = 1;

export function registerTodoTools(): void {
  registerTool(
    {
      name: "todo_read",
      category: "utility" as const,
      description: "Read the current task list.",
      parameters: [],
    },
    async () => {
      if (tasks.length === 0) return { output: "No tasks." };
      const lines = tasks.map(t => {
        const icon = t.status === "completed" ? "✅" : t.status === "in_progress" ? "🔄" : t.status === "cancelled" ? "❌" : "⬜";
        return `${icon} [${t.id}] ${t.content}`;
      });
      return { output: lines.join("\n") };
    }
  );

  registerTool(
    {
      name: "todo_write",
      category: "utility" as const,
      description: "Create or update tasks. Pass a JSON array of task objects with id, content, status.",
      parameters: [
        { name: "tasks", type: "string", description: 'JSON array, e.g. [{"id":"1","content":"Fix bug","status":"pending"}]', required: true },
        { name: "merge", type: "boolean", description: "If true, update existing tasks by id. If false (default), replace all." },
      ],
    },
    async (args) => {
      const newTasks = JSON.parse(String(args.tasks)) as Task[];
      const merge = Boolean(args.merge);

      if (merge) {
        for (const t of newTasks) {
          const idx = tasks.findIndex(existing => existing.id === t.id);
          if (idx >= 0) tasks[idx] = t;
          else tasks.push(t);
        }
      } else {
        tasks = newTasks;
        nextId = Math.max(...tasks.map(t => parseInt(t.id) || 0), 0) + 1;
      }

      return { output: `Updated ${newTasks.length} tasks. Total: ${tasks.length}` };
    }
  );
}
