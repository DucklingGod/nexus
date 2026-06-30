// ponytail: token budget tracking + context window management
// Tracks usage per conversation, auto-truncates when approaching budget.

export const DEFAULT_MAX_TOKENS = 128000; // conservative default for most models
const RESERVED_FOR_OUTPUT = 4096;
const CHARS_PER_TOKEN = 4; // rough estimate

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface BudgetStatus {
  used: number;
  max: number;
  remaining: number;
  percentUsed: number;
  needsTruncation: boolean;
}

// In-memory usage tracking per conversation
const usageMap = new Map<string, TokenUsage[]>();

export function recordUsage(conversationId: string, usage: TokenUsage): void {
  const history = usageMap.get(conversationId) ?? [];
  history.push(usage);
  usageMap.set(conversationId, history);
}

export function getTotalUsage(conversationId: string): TokenUsage {
  const history = usageMap.get(conversationId) ?? [];
  return history.reduce(
    (acc, u) => ({
      input: acc.input + u.input,
      output: acc.output + u.output,
      total: acc.total + u.total,
    }),
    { input: 0, output: 0, total: 0 },
  );
}

export function getBudgetStatus(conversationId: string, maxTokens?: number): BudgetStatus {
  const max = maxTokens ?? DEFAULT_MAX_TOKENS;
  const usage = getTotalUsage(conversationId);
  const remaining = max - usage.total;
  const percentUsed = max > 0 ? (usage.total / max) * 100 : 0;

  return {
    used: usage.total,
    max,
    remaining: Math.max(0, remaining),
    percentUsed: Math.min(100, percentUsed),
    needsTruncation: percentUsed > 80,
  };
}

// Estimate token count from text (rough: 1 token ≈ 4 chars)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Smart context truncation: keep system + recent messages, trim old ones
export function truncateContext(
  messages: { role: string; content: string }[],
  maxTokens: number,
): { role: string; content: string }[] {
  if (messages.length === 0) return messages;

  const budget = maxTokens - RESERVED_FOR_OUTPUT;
  let totalTokens = 0;

  // Always keep system message
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  if (systemMsg) {
    totalTokens += estimateTokens(systemMsg.content);
  }

  // Work backwards from most recent, keep as many as fit
  const kept: typeof messages = [];
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(nonSystem[i].content);
    if (totalTokens + msgTokens > budget) break;
    kept.unshift(nonSystem[i]);
    totalTokens += msgTokens;
  }

  // If we dropped messages, add a summary marker
  const dropped = nonSystem.length - kept.length;
  const result: typeof messages = [];
  if (systemMsg) result.push(systemMsg);
  if (dropped > 0) {
    result.push({
      role: "system",
      content: `[${dropped} earlier messages truncated to fit context window]`,
    });
  }
  result.push(...kept);

  return result;
}

// Reset usage for a conversation (e.g., new chat)
export function resetUsage(conversationId: string): void {
  usageMap.delete(conversationId);
}
