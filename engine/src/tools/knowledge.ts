import type { ToolDef, ToolFn } from "./types.ts";
import {
  saveKnowledge,
  searchKnowledge,
  getByCategory,
  deleteKnowledge,
} from "../memory/semantic.ts";

const knowledgeSaveDef: ToolDef = {
  name: "knowledge_save",
  category: "knowledge" as const,
  description:
    "Save a fact, preference, or piece of information about the user to persistent memory. Use this to remember things the user tells you about themselves.",
  parameters: [
    { name: "category", type: "string", description: "Category: preference, fact, context, relationship, goal", required: true },
    { name: "key", type: "string", description: "Short label (e.g., 'favorite_language', 'timezone')", required: true },
    { name: "value", type: "string", description: "The fact or preference value", required: true },
  ],
};

const knowledgeSaveFn: ToolFn = async (args) => {
  const id = saveKnowledge(
    String(args.category),
    String(args.key),
    String(args.value),
    "agent",
  );
  return { output: `Saved: [${args.category}] ${args.key} = ${args.value} (id: ${id})` };
};

const knowledgeSearchDef: ToolDef = {
  name: "knowledge_search",
  category: "knowledge" as const,
  description:
    "Search the knowledge base for facts, preferences, or context about the user. Use this to recall information you've saved before.",
  parameters: [
    { name: "query", type: "string", description: "Search terms", required: true },
    { name: "category", type: "string", description: "Optional filter by category" },
  ],
};

const knowledgeSearchFn: ToolFn = async (args) => {
  const results = searchKnowledge(
    String(args.query),
    args.category ? String(args.category) : undefined,
  );
  if (results.length === 0) return { output: "No matching knowledge found." };
  const lines = results.map(
    (r) => `[${r.category}] ${r.key}: ${r.value}`,
  );
  return { output: lines.join("\n") };
};

const knowledgeListDef: ToolDef = {
  name: "knowledge_list",
  category: "knowledge" as const,
  description: "List all saved knowledge, optionally filtered by category.",
  parameters: [
    { name: "category", type: "string", description: "Category to filter (preference, fact, context, relationship, goal)" },
  ],
};

const knowledgeListFn: ToolFn = async (args) => {
  const results = args.category
    ? getByCategory(String(args.category))
    : searchKnowledge("", undefined);
  if (results.length === 0) return { output: "Knowledge base is empty." };
  const lines = results.map((r) => `[${r.category}] ${r.key}: ${r.value}`);
  return { output: lines.join("\n") };
};

const knowledgeDeleteDef: ToolDef = {
  name: "knowledge_delete",
  category: "knowledge" as const,
  description: "Delete a specific knowledge entry by ID.",
  parameters: [
    { name: "id", type: "number", description: "Knowledge entry ID to delete", required: true },
  ],
};

const knowledgeDeleteFn: ToolFn = async (args) => {
  deleteKnowledge(Number(args.id));
  return { output: `Deleted knowledge entry ${args.id}` };
};

export function registerKnowledgeTools(
  register: (def: ToolDef, fn: ToolFn) => void,
): void {
  register(knowledgeSaveDef, knowledgeSaveFn);
  register(knowledgeSearchDef, knowledgeSearchFn);
  register(knowledgeListDef, knowledgeListFn);
  register(knowledgeDeleteDef, knowledgeDeleteFn);
}
