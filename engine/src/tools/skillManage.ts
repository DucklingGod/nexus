// skill_manage — create, edit, delete, list custom skills.
// Mirrors Hermes's skill_manage tool for SKILL.md-style procedural memory.

import { registerTool } from "./registry.ts";
import { addCustomSkill, listSkills, deleteCustomSkill } from "../skills/skills.ts";
import { getSetting } from "../db/settings.ts";

export function registerSkillManageTools(): void {
  registerTool(
    {
      name: "skill_manage",
      category: "knowledge" as const,
      description:
        "Manage custom skills (procedural memory). Create a skill after completing a complex task (5+ tool calls) " +
        "to remember the procedure for next time. Skills are auto-loaded when relevant. " +
        "Actions: create (new skill), edit (update existing), delete (remove), list (show all).",
      parameters: [
        {
          name: "action",
          type: "string",
          description: "Action: 'create', 'edit', 'delete', or 'list'",
          required: true,
        },
        {
          name: "name",
          type: "string",
          description: "Skill name (lowercase, hyphens, max 64 chars). Required for create/edit/delete.",
        },
        {
          name: "description",
          type: "string",
          description: "One-line description of what the skill does. Required for create.",
        },
        {
          name: "instructions",
          type: "string",
          description: "Full instructions (markdown). Include: trigger conditions, numbered steps, pitfalls, verification. Required for create/edit.",
        },
        {
          name: "category",
          type: "string",
          description: "Category for organizing (e.g., 'devops', 'data-science', 'web'). Optional.",
        },
        {
          name: "triggers",
          type: "string",
          description: "Comma-separated trigger keywords that should auto-load this skill. Optional.",
        },
      ],
    },
    async (args) => {
      const action = String(args.action || "").toLowerCase();

      switch (action) {
        case "list": {
          const skills = listSkills();
          if (skills.length === 0) return { output: "No skills found." };
          const lines = skills.map(
            (s) => `- **${s.name}** (${s.category || "Custom"}): ${s.description || "No description"}`
          );
          return { output: `Found ${skills.length} skills:\n${lines.join("\n")}` };
        }

        case "create": {
          const name = String(args.name || "").trim();
          const description = String(args.description || "").trim();
          const instructions = String(args.instructions || "").trim();
          if (!name) return { output: "Error: name is required for create." };
          if (!description) return { output: "Error: description is required for create." };
          if (!instructions) return { output: "Error: instructions is required for create." };

          const category = String(args.category || "Custom").trim();
          const triggers = String(args.triggers || "")
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);

          const id = addCustomSkill({
            name: name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            category,
            description,
            triggers,
            instructions,
            auto: true,
          });

          return {
            output: `Created skill "${name}" (id: ${id}) in category "${category}". The skill will auto-load when relevant.`,
          };
        }

        case "edit": {
          const name = String(args.name || "").trim().toLowerCase();
          const instructions = String(args.instructions || "").trim();
          if (!name) return { output: "Error: name is required for edit." };
          if (!instructions) return { output: "Error: instructions is required for edit." };

          // Find the skill by name
          const skills = listSkills();
          const skill = skills.find((s) => s.name.toLowerCase() === name || s.id === name);
          if (!skill) return { output: `Error: skill "${name}" not found. Use action='list' to see available skills.` };
          if (!skill.id.startsWith("custom-")) {
            return { output: `Error: cannot edit built-in skill "${name}". Only custom skills can be edited.` };
          }

          // Delete and recreate with updated instructions
          const description = String(args.description || skill.description || "").trim();
          const category = String(args.category || skill.category || "Custom").trim();
          const triggersStr = String(args.triggers || "");
          const triggers = triggersStr
            ? triggersStr.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
            : skill.triggers || [];

          deleteCustomSkill(skill.id);
          const newId = addCustomSkill({
            name: skill.name,
            category,
            description,
            triggers,
            instructions,
            auto: true,
          });

          return {
            output: `Updated skill "${name}" (id: ${newId}). Instructions refreshed.`,
          };
        }

        case "delete": {
          const name = String(args.name || "").trim().toLowerCase();
          if (!name) return { output: "Error: name is required for delete." };

          const skills = listSkills();
          const skill = skills.find((s) => s.name.toLowerCase() === name || s.id === name);
          if (!skill) return { output: `Error: skill "${name}" not found.` };
          if (!skill.id.startsWith("custom-")) {
            return { output: `Error: cannot delete built-in skill "${name}". Only custom skills can be deleted.` };
          }

          deleteCustomSkill(skill.id);
          return { output: `Deleted skill "${name}".` };
        }

        default:
          return { output: `Error: unknown action "${action}". Use: create, edit, delete, or list.` };
      }
    }
  );
}
