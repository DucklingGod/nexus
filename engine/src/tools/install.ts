// Agent tool: install skills from a GitHub repo. Lets the agent set itself up
// with new skills when the user shares a skills repo link. Marked dangerous so
// it requires explicit approval (it adds external instructions to the agent).

import { registerTool } from "./registry.ts";
import { importSkillsFromGithub } from "../skills/import.ts";

export function registerInstallTools(): void {
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
