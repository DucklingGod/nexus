// ask_user tool — presents options to the user (Claude-style selector).
// The agent can use this when it needs clarification or wants to scope a task.

import { registerTool } from "./registry.ts";

export function registerAskUserTool(): void {
  registerTool(
    {
      name: "ask_user",
      category: "system" as const,
      description: "Present a question with clickable options to the user. Use this when you need clarification, want to scope a task, or need the user to choose between approaches. The user clicks an option instead of typing. Use sparingly — only when genuinely needed.",
      parameters: [
        { name: "question", type: "string", description: "The question to ask the user", required: true },
        { name: "options", type: "string", description: "JSON array of option objects: [{\"label\": \"Option 1\", \"description\": \"Why this option\", \"value\": \"option1\"}, ...]. Include 2-5 options.", required: true },
        { name: "other", type: "boolean", description: "Whether to show a free-text 'Other' option (default true)" },
      ],
    },
    async (args) => {
      // This tool doesn't execute anything — it sends the options to the frontend
      // and waits for the user's choice. The agent loop handles the waiting.
      const question = String(args.question);
      let options: { label: string; description?: string; value: string }[];
      try {
        options = JSON.parse(String(args.options));
      } catch {
        return { output: "Error: options must be valid JSON array" };
      }
      const other = args.other !== false;

      // Return the options as a special result — the agent loop will detect
      // the `options` field and send it to the frontend, then wait for user input.
      return {
        output: `Asked user: "${question}" with ${options.length} options. Waiting for response...`,
        options: { question, options, other },
      };
    }
  );
}
