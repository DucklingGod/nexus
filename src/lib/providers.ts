// ponytail: provider list — single source of truth
// Direct providers = connect with their own API key
// Hub = OpenRouter (access 300+ models with one key, including free models)

export interface ProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
  tier: "major" | "specialized" | "local";
  models: string;
  authType: "api_key" | "oauth" | "token" | "local";
  envVar?: string;
  description: string;
  isHub?: boolean; // true = OpenRouter (aggregator, has free models)
}

export const PROVIDERS: ProviderInfo[] = [
  // Direct providers — each needs its own API key
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", tier: "major", models: "GPT-4o, GPT-4o-mini, o3", authType: "api_key", envVar: "OPENAI_API_KEY", description: "Default for most users" },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", tier: "major", models: "Claude Opus 4, Sonnet 4, Haiku 3.5", authType: "api_key", envVar: "ANTHROPIC_API_KEY", description: "Best for coding" },
  { id: "google", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", tier: "major", models: "Gemini 2.5 Pro, Flash", authType: "api_key", envVar: "GOOGLE_API_KEY", description: "Cheapest option" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", tier: "major", models: "V3, R1", authType: "api_key", envVar: "DEEPSEEK_API_KEY", description: "Budget reasoning" },
  { id: "xai", name: "xAI / Grok", baseUrl: "https://api.x.ai/v1", tier: "specialized", models: "Grok-3", authType: "api_key", envVar: "XAI_API_KEY", description: "Real-time info" },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v1", tier: "specialized", models: "MiniMax-Text-01", authType: "api_key", envVar: "MINIMAX_API_KEY", description: "Long context" },
  { id: "kimi", name: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", tier: "specialized", models: "Kimi K2", authType: "api_key", envVar: "KIMI_API_KEY", description: "Long context" },
  { id: "dashscope", name: "Alibaba / Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", tier: "specialized", models: "Qwen3 series", authType: "api_key", envVar: "DASHSCOPE_API_KEY", description: "Chinese market" },
  { id: "xiaomi", name: "Xiaomi MiMo", baseUrl: "https://api.xiaomimimo.com/v1", tier: "specialized", models: "MiMo-V2.5 Pro, Flash, Omni", authType: "api_key", envVar: "XIAOMI_API_KEY", description: "Multimodal, TTS, coding" },
  { id: "zai", name: "Z.ai (Zhipu)", baseUrl: "https://api.z.ai/api/paas/v4", tier: "specialized", models: "GLM-5.2, GLM-4-Flash", authType: "api_key", envVar: "ZAI_API_KEY", description: "Chinese LLM, coding, reasoning" },
  { id: "zai-coding", name: "Z.ai Coding Plan", baseUrl: "https://api.z.ai/api/coding/paas/v4", tier: "specialized", models: "GLM Coding models", authType: "api_key", envVar: "ZAI_API_KEY", description: "Z.ai dedicated coding endpoint" },
  // Hub — OpenRouter: one key, 300+ models, includes free models
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", tier: "major", models: "300+ models (incl. free)", authType: "api_key", envVar: "OPENROUTER_API_KEY", description: "Access all models — includes free tier", isHub: true },
  // Local
  { id: "lm-studio", name: "LM Studio", baseUrl: "http://localhost:1234/v1", tier: "local", models: "Auto-detect", authType: "local", description: "Local models via LM Studio" },
  { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/v1", tier: "local", models: "Auto-detect", authType: "local", description: "Offline, auto-detected" },
];

export const DIRECT_PROVIDERS = PROVIDERS.filter(p => !p.isHub && p.tier !== "local");
export const HUB_PROVIDERS = PROVIDERS.filter(p => p.isHub);
export const LOCAL_PROVIDERS = PROVIDERS.filter(p => p.tier === "local");

// Model with optional pricing info (from OpenRouter)
export interface ModelEntry {
  id: string;
  name?: string;
  isFree?: boolean;
  pricing?: { prompt: string; completion: string };
}

/** Group models into free vs paid for display */
export function groupModels(models: ModelEntry[]): { free: ModelEntry[]; paid: ModelEntry[] } {
  const free = models.filter(m => m.isFree);
  const paid = models.filter(m => !m.isFree);
  return { free, paid };
}
