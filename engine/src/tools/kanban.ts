// Kanban board tools — agent-facing tools for managing boards, columns, and cards.

import { registerTool } from "./registry.ts";
import {
  createBoard,
  getBoard,
  listBoards,
  deleteBoard,
  renameBoard,
  addColumn,
  deleteColumn,
  renameColumn,
  addCard,
  moveCard,
  updateCard,
  deleteCard,
  type KanbanCard,
} from "../kanban/store.ts";

function formatBoard(board: ReturnType<typeof getBoard>): string {
  if (!board) return "Board not found.";
  const colLines = board.columns.map((col) => {
    const cards = col.cards.length > 0
      ? "\n" + col.cards.map((c) => {
          const priority = c.priority !== "normal" ? ` [${c.priority}]` : "";
          const labels = c.labels.length > 0 ? ` {${c.labels.join(", ")}}` : "";
          const due = c.due_date ? ` 📅 ${new Date(c.due_date).toLocaleDateString()}` : "";
          return `     • ${c.title}${priority}${labels}${due}`;
        }).join("\n")
      : " (empty)";
    return `  📋 ${col.name} (${col.cards.length})${cards}`;
  });
  return `📋 ${board.name}${board.description ? ` — ${board.description}` : ""}\n${colLines.join("\n")}`;
}

export function registerKanbanTools(): void {
  registerTool(
    {
      name: "kanban_list_boards",
      category: "utility" as const,
      description: "List all Kanban boards with their card counts.",
      parameters: [],
    },
    async () => {
      const boards = listBoards();
      if (boards.length === 0) {
        return { output: "No Kanban boards yet. Use kanban_create_board to create one." };
      }
      const lines = boards.map((b, i) => `${i + 1}. 📋 ${b.name} — ${b.cardCount} card(s) [${b.id}]${b.description ? `\n   ${b.description}` : ""}`);
      return { output: `Kanban Boards (${boards.length}):\n\n${lines.join("\n")}` };
    },
  );

  registerTool(
    {
      name: "kanban_create_board",
      category: "utility" as const,
      description: "Create a new Kanban board with default columns (To Do, In Progress, Done).",
      parameters: [
        { name: "name", type: "string", description: "Board name", required: true },
        { name: "description", type: "string", description: "Optional board description" },
      ],
    },
    async (args) => {
      const board = createBoard(String(args.name), args.description ? String(args.description) : undefined);
      return { output: `✅ Board "${board.name}" created with default columns!\n${formatBoard(board)}` };
    },
  );

  registerTool(
    {
      name: "kanban_view_board",
      category: "utility" as const,
      description: "View a Kanban board with all columns and cards.",
      parameters: [
        { name: "board_id", type: "string", description: "Board ID", required: true },
      ],
    },
    async (args) => {
      const board = getBoard(String(args.board_id));
      return { output: formatBoard(board) };
    },
  );

  registerTool(
    {
      name: "kanban_add_card",
      category: "utility" as const,
      description: "Add a card to a column on a Kanban board.",
      parameters: [
        { name: "board_id", type: "string", description: "Board ID", required: true },
        { name: "column_name", type: "string", description: "Column name (e.g. \"To Do\", \"In Progress\", \"Done\") or column ID", required: true },
        { name: "title", type: "string", description: "Card title", required: true },
        { name: "description", type: "string", description: "Card description/details" },
        { name: "priority", type: "string", description: '"low", "normal" (default), "high", or "urgent"' },
      ],
    },
    async (args) => {
      const board = getBoard(String(args.board_id));
      if (!board) return { output: "Board not found." };

      // Find column by name or ID
      const colInput = String(args.column_name);
      const col = board.columns.find(
        (c) => c.id === colInput || c.name.toLowerCase() === colInput.toLowerCase(),
      );
      if (!col) {
        return {
          output: `Column "${colInput}" not found. Available: ${board.columns.map((c) => c.name).join(", ")}`,
        };
      }

      const priority = (args.priority as KanbanCard["priority"]) ?? "normal";
      const id = addCard(col.id, String(args.title), args.description ? String(args.description) : undefined, {
        priority,
      });
      return { output: `✅ Card "${args.title}" added to "${col.name}" [${id}]` };
    },
  );

  registerTool(
    {
      name: "kanban_move_card",
      category: "utility" as const,
      description: "Move a card to a different column (e.g. from \"To Do\" to \"Done\").",
      parameters: [
        { name: "board_id", type: "string", description: "Board ID", required: true },
        { name: "card_title", type: "string", description: "Card title to find (fuzzy match)" },
        { name: "card_id", type: "string", description: "Or exact card ID" },
        { name: "target_column", type: "string", description: "Target column name or ID", required: true },
      ],
    },
    async (args) => {
      const board = getBoard(String(args.board_id));
      if (!board) return { output: "Board not found." };

      // Find card
      let card: KanbanCard | undefined;
      if (args.card_id) {
        for (const col of board.columns) {
          card = col.cards.find((c) => c.id === args.card_id);
          if (card) break;
        }
      } else if (args.card_title) {
        const search = String(args.card_title).toLowerCase();
        for (const col of board.columns) {
          card = col.cards.find((c) => c.title.toLowerCase().includes(search));
          if (card) break;
        }
      }

      if (!card) return { output: "Card not found. Use card_title (fuzzy match) or card_id." };

      // Find target column
      const targetInput = String(args.target_column);
      const targetCol = board.columns.find(
        (c) => c.id === targetInput || c.name.toLowerCase() === targetInput.toLowerCase(),
      );
      if (!targetCol) {
        return { output: `Column "${targetInput}" not found. Available: ${board.columns.map((c) => c.name).join(", ")}` };
      }

      moveCard(card.id, targetCol.id);
      return { output: `✅ Moved "${card.title}" → ${targetCol.name}` };
    },
  );

  registerTool(
    {
      name: "kanban_delete_card",
      category: "utility" as const,
      description: "Delete a card from a Kanban board.",
      parameters: [
        { name: "board_id", type: "string", description: "Board ID", required: true },
        { name: "card_title", type: "string", description: "Card title (fuzzy match) to delete" },
        { name: "card_id", type: "string", description: "Or exact card ID" },
      ],
    },
    async (args) => {
      const board = getBoard(String(args.board_id));
      if (!board) return { output: "Board not found." };

      let card: KanbanCard | undefined;
      if (args.card_id) {
        for (const col of board.columns) {
          card = col.cards.find((c) => c.id === args.card_id);
          if (card) break;
        }
      } else if (args.card_title) {
        const search = String(args.card_title).toLowerCase();
        for (const col of board.columns) {
          card = col.cards.find((c) => c.title.toLowerCase().includes(search));
          if (card) break;
        }
      }

      if (!card) return { output: "Card not found." };
      deleteCard(card.id);
      return { output: `🗑️ Deleted card "${card.title}"` };
    },
  );

  registerTool(
    {
      name: "kanban_delete_board",
      category: "utility" as const,
      description: "Delete an entire Kanban board and all its columns and cards.",
      parameters: [
        { name: "board_id", type: "string", description: "Board ID to delete", required: true },
      ],
    },
    async (args) => {
      deleteBoard(String(args.board_id));
      return { output: `🗑️ Board deleted.` };
    },
  );
}
