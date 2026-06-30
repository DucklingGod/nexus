import { getSetting } from "../db/settings.ts";

// Generate embeddings via the provider's OpenAI-compatible /embeddings endpoint.
// Works for OpenAI / OpenRouter / DeepSeek / Ollama (OpenAI-compat) / etc.
// Anthropic & Google don't expose this endpoint — RAG embedding errors there
// are caught by callers (chat still works, just without document context).
// The embedding model is configurable via the `model.embedding` setting.
export async function embed(
  config: { baseUrl: string; apiKey: string },
  texts: string[],
): Promise<number[][]> {
  const model = getSetting("model.embedding") ?? "text-embedding-3-small";
  const res = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`Embeddings error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.data ?? []).map((d: { embedding: number[] }) => d.embedding);
}
