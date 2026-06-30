// ponytail: provider list matches SPEC §2B, single source of truth

export interface ProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
  tier: "major" | "specialized" | "code" | "enterprise" | "local";
  models: string;
  authType: "api_key" | "oauth" | "token" | "local";
  envVar?: string;
  description: string;
}

export const PROVIDERS: ProviderInfo[] = [
  // Tier 1: Major
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", tier: "major", models: "GPT-4o, GPT-4o-mini, o3", authType: "api_key", envVar: "OPENAI_API_KEY", description: "Default for most users" },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", tier: "major", models: "Claude Opus 4, Sonnet 4, Haiku 3.5", authType: "api_key", envVar: "ANTHROPIC_API_KEY", description: "Best for coding" },
  { id: "google", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", tier: "major", models: "Gemini 2.5 Pro, Flash", authType: "api_key", envVar: "GOOGLE_API_KEY", description: "Cheapest option" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", tier: "major", models: "V3, R1", authType: "api_key", envVar: "DEEPSEEK_API_KEY", description: "Budget reasoning" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", tier: "major", models: "300+ models", authType: "api_key", envVar: "OPENROUTER_API_KEY", description: "Access all models" },
  // Tier 2: Specialized
  { id: "xai", name: "xAI / Grok", baseUrl: "https://api.x.ai/v1", tier: "specialized", models: "Grok-3", authType: "api_key", envVar: "XAI_API_KEY", description: "Real-time info" },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v1", tier: "specialized", models: "MiniMax-Text-01", authType: "api_key", envVar: "MINIMAX_API_KEY", description: "Long context" },
  { id: "kimi", name: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", tier: "specialized", models: "Kimi K2", authType: "api_key", envVar: "KIMI_API_KEY", description: "Long context" },
  { id: "dashscope", name: "Alibaba / Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", tier: "specialized", models: "Qwen3 series", authType: "api_key", envVar: "DASHSCOPE_API_KEY", description: "Chinese market" },
  { id: "xiaomi", name: "Xiaomi MiMo", baseUrl: "https://api.xiaomimimo.com/v1", tier: "specialized", models: "MiMo-V2.5 Pro, Flash, Omni", authType: "api_key", envVar: "XIAOMI_API_KEY", description: "Multimodal, TTS, coding" },
  // Tier 5: Local
  { id: "lm-studio", name: "LM Studio", baseUrl: "http://localhost:1234/v1", tier: "local", models: "Auto-detect", authType: "local", description: "Local models via LM Studio" },
  { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/v1", tier: "local", models: "Auto-detect", authType: "local", description: "Offline, auto-detected" },
];

export const MAJOR_PROVIDERS = PROVIDERS.filter(p => p.tier === "major");
export const MORE_PROVIDERS = PROVIDERS.filter(p => p.tier === "specialized" || p.tier === "code");
export const LOCAL_PROVIDERS = PROVIDERS.filter(p => p.tier === "local");
