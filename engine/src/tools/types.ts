// ponytail: minimal tool types — just enough for LLM function calling

export interface ToolParam {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  items?: Record<string, unknown>;  // for array type: e.g. { type: "object", properties: {...} }
  properties?: Record<string, unknown>;  // for object type
}

export interface ToolDef {
  name: string;
  description: string;
  category: "web" | "file" | "system" | "code" | "utility" | "knowledge" | "media";
  parameters: ToolParam[];
  dangerous?: boolean; // requires user approval
}

export interface ToolResult {
  output: string;
  error?: string;
  elapsed_ms?: number;
  /** send_file — a downloadable attachment surfaced in the chat. */
  attachment?: { name: string; label: string; size: number; data: string; path: string };
  /** ask_user — clickable options that pause the agent loop until the user picks. */
  options?: {
    question: string;
    options: { label: string; description?: string; value: string }[];
    other: boolean;
  };
}

export type ToolFn = (args: Record<string, unknown>) => Promise<ToolResult>;
