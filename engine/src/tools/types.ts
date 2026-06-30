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
}

export type ToolFn = (args: Record<string, unknown>) => Promise<ToolResult>;
