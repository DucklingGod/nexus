// ponytail: ONE provider implementation for ALL OpenAI-compatible APIs
// User provides: base_url + api_key → system lists available models → user picks any
// No hardcoded provider list needed!

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  stream?: boolean;
  tools?: object[]; // OpenAI function-calling format
  reasoningEffort?: "low" | "medium" | "high" | "max";
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { input: number; output: number };
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Raw streaming tool call delta (arguments come as partial strings)
export interface StreamToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  reasoning?: string;  // reasoning/thinking tokens from o1, Claude, DeepSeek
  tool_calls?: StreamToolCallDelta[];
  usage?: { input: number; output: number };
}

export interface ModelInfo {
  id: string;
  name: string;
  isFree?: boolean;
  pricing?: { prompt: string; completion: string };
}

export interface ProviderConfig {
  id: string;          // unique ID (e.g., "openai", "custom-1")
  name: string;        // display name
  baseUrl: string;     // API base URL
  apiKey: string;      // API key (stored in OS keychain)
  defaultModel?: string;
}

// Preset providers — just convenience, user can add custom ones
export const PROVIDER_PRESETS: Omit<ProviderConfig, "apiKey">[] = [
  { id: "openai",     name: "OpenAI",           baseUrl: "https://api.openai.com/v1",         defaultModel: "gpt-4o-mini" },
  { id: "anthropic",  name: "Anthropic",        baseUrl: "https://api.anthropic.com/v1",      defaultModel: "claude-sonnet-4-20250514" },
  { id: "google",     name: "Google Gemini",    baseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultModel: "gemini-2.5-flash" },
  { id: "openrouter", name: "OpenRouter",       baseUrl: "https://openrouter.ai/api/v1",     defaultModel: "openai/gpt-4o-mini" },
  { id: "deepseek",   name: "DeepSeek",         baseUrl: "https://api.deepseek.com/v1",      defaultModel: "deepseek-chat" },
  { id: "xai",        name: "xAI / Grok",       baseUrl: "https://api.x.ai/v1",              defaultModel: "grok-3-mini" },
  { id: "minimax",    name: "MiniMax",           baseUrl: "https://api.minimax.chat/v1",      defaultModel: "MiniMax-Text-01" },
  { id: "kimi",       name: "Kimi / Moonshot",  baseUrl: "https://api.moonshot.cn/v1",       defaultModel: "moonshot-v1-8k" },
  { id: "dashscope",  name: "Alibaba / Qwen",   baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus" },
  { id: "xiaomi",     name: "Xiaomi MiMo",      baseUrl: "https://api.xiaomi.com/v1",        defaultModel: "MiMo-V2.5" },
  { id: "zai",        name: "Z.ai (Zhipu)",    baseUrl: "https://api.z.ai/api/paas/v4",    defaultModel: "glm-4-flash" },
  { id: "zai-coding", name: "Z.ai Coding Plan", baseUrl: "https://api.z.ai/api/coding/paas/v4", defaultModel: "glm-4-flash" },
  { id: "ollama",     name: "Ollama (local)",   baseUrl: "http://localhost:11434/v1",        defaultModel: "llama3.2" },
];
