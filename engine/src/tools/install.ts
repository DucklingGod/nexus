// Agent tool: install skills from a GitHub repo. Lets the agent set itself up
// with new skills when the user shares a skills repo link. Marked dangerous so
// it requires explicit approval (it adds external instructions to the agent).

import { registerTool } from "./registry.ts";
import { importSkillsFromGithub, searchSkillRepos } from "../skills/import.ts";

export function registerInstallTools(): void {
  registerTool(
    {
      name: "search_skills",
      category: "knowledge" as const,
      description: "Search the open agent-skills ecosystem (agentskills.io / GitHub 'agent-skills' topic) for skill repositories by keyword. Returns repos you can then install with install_skills. Use when the user wants a capability you don't already have a skill for.",
      parameters: [
        { name: "query", type: "string", description: "Keywords (e.g. 'pdf', 'excel', 'security'). Omit to list the most popular.", required: false },
      ],
    },
    async (args) => {
      const { repos } = await searchSkillRepos(args.query ? String(args.query) : undefined);
      if (repos.length === 0) return { output: "No skill repositories found. Try different keywords." };
      const list = repos.slice(0, 10)
        .map((r) => `• ${r.fullName} (★${r.stars}) — ${r.description || "no description"}\n  ${r.url}`)
        .join("\n");
      return { output: `Found ${repos.length} skill repo(s):\n${list}\n\nInstall any of them with install_skills using its URL.` };
    },
  );

  registerTool(
    {
      name: "install_skills",
      category: "knowledge" as const,
      description: "Download and install agent skills from a public GitHub repository by parsing its SKILL.md files. Use this when the user shares a skills repo link.",
      parameters: [
        { name: "url", type: "string", description: "GitHub repository URL (e.g. https://github.com/owner/repo)", required: true },
      ],
      dangerous: true,
    },
    async (args) => {
      const r = await importSkillsFromGithub(String(args.url));
      return {
        output: r.imported > 0
          ? `Installed ${r.imported} new skill(s) from ${r.repo} (${r.scanned} SKILL.md found). They're now available to use.`
          : `No new skills installed from ${r.repo} — found ${r.scanned} SKILL.md file(s) (already installed, or none).`,
      };
    },
  );
}
