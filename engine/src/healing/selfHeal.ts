// ponytail: self-healing wrapper — retry + error classification
// Wraps chat/chatStream with exponential backoff for transient errors.

import type { ProviderConfig, ChatRequest, ChatResponse, StreamChunk } from "../providers/types.ts";
import { chat, chatStream } from "../providers/client.ts";

// Error classification
export type ErrorClass = "transient" | "permanent" | "rate_limit" | "unknown";

export function classifyError(error: Error): ErrorClass {
  const msg = error.message.toLowerCase();

  // Rate limit (429)
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
    return "rate_limit";
  }

  // Transient: server errors, timeouts, network issues
  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("socket hang up")
  ) {
    return "transient";
  }

  // Permanent: auth errors, bad request, not found
  if (
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid_request") ||
    msg.includes("model_not_found") ||
    msg.includes("404")
  ) {
    return "permanent";
  }

  return "unknown";
}

export function isRetryable(errorClass: ErrorClass): boolean {
  return errorClass === "transient" || errorClass === "rate_limit";
}

// Retry config
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function backoffDelay(attempt: number, errorClass: ErrorClass): number {
  // Rate limit: longer wait
  if (errorClass === "rate_limit") return Math.min(BASE_DELAY_MS * 2 ** attempt, 30_000);
  // Transient: standard exponential backoff
  return Math.min(BASE_DELAY_MS * 2 ** attempt, 10_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Health tracking per provider
interface HealthRecord {
  errors: number;
  lastError?: string;
  lastErrorTime?: number;
  successes: number;
}

const healthMap = new Map<string, HealthRecord>();

function getHealthKey(config: ProviderConfig): string {
  return `${config.baseUrl}|${config.defaultModel ?? "default"}`;
}

export function getProviderHealth(config: ProviderConfig): HealthRecord {
  return healthMap.get(getHealthKey(config)) ?? { errors: 0, successes: 0 };
}

function recordSuccess(config: ProviderConfig): void {
  const key = getHealthKey(config);
  const rec = healthMap.get(key) ?? { errors: 0, successes: 0 };
  rec.successes++;
  healthMap.set(key, rec);
}

function recordError(config: ProviderConfig, error: string): void {
  const key = getHealthKey(config);
  const rec = healthMap.get(key) ?? { errors: 0, successes: 0 };
  rec.errors++;
  rec.lastError = error;
  rec.lastErrorTime = Date.now();
  healthMap.set(key, rec);
}

// Wrapped chat with retry
export async function chatWithRetry(
  config: ProviderConfig,
  req: ChatRequest,
): Promise<ChatResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await chat(config, req);
      recordSuccess(config);
      return result;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const errorClass = classifyError(lastError);

      process.stderr.write(
        `[heal] chat attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${errorClass}): ${lastError.message}\n`,
      );

      if (!isRetryable(errorClass) || attempt >= MAX_RETRIES) {
        recordError(config, lastError.message);
        throw lastError;
      }

      const delay = backoffDelay(attempt, errorClass);
      process.stderr.write(`[heal] retrying in ${delay}ms...\n`);
      await sleep(delay);
    }
  }

  recordError(config, lastError!.message);
  throw lastError!;
}

// Wrapped chatStream with retry (non-streaming fallback)
export async function* chatStreamWithRetry(
  config: ProviderConfig,
  req: ChatRequest,
): AsyncGenerator<StreamChunk> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      yield* chatStream(config, req);
      recordSuccess(config);
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const errorClass = classifyError(lastError);

      process.stderr.write(
        `[heal] stream attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${errorClass}): ${lastError.message}\n`,
      );

      if (!isRetryable(errorClass) || attempt >= MAX_RETRIES) {
        recordError(config, lastError.message);
        throw lastError;
      }

      const delay = backoffDelay(attempt, errorClass);
      process.stderr.write(`[heal] retrying in ${delay}ms...\n`);
      await sleep(delay);
    }
  }

  recordError(config, lastError!.message);
  throw lastError!;
}
