// Web tools with a pluggable search backend (setting `web.searchProvider`):
//   • duckduckgo — free, zero setup (HTML scrape; best-effort)
//   • tavily     — cloud API, free tier, built for agents (key in keychain)
//   • brave      — cloud API, free tier (key in keychain)
//   • searxng    — self-hosted JSON API (`web.searxngUrl`)
//   • auto       — pick the best configured: Tavily → Brave → SearXNG → DuckDuckGo
//
// API keys are brokered from the OS keychain by Rust (chat_send) and stashed here
// per request via setWebKeys — they never touch the WebView or settings DB.

import { registerTool } from "./registry.ts";
import { getSetting } from "../db/settings.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

interface SearchResult { title: string; url: string; snippet: string; }

let webKeys: { tavily?: string; brave?: string } = {};
export function setWebKeys(keys: { tavily?: string; brave?: string } | undefined): void {
  webKeys = keys ?? {};
}

// Tavily — POST JSON. Free tier ~1000 req/mo. https://tavily.com
async function searchTavily(key: string, query: string, max: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: max }),
  });
  if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? []).slice(0, max).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.content ?? "" }));
}

// Brave Search API — GET with subscription-token header. Free tier available.
async function searchBrave(key: string, query: string, max: number): Promise<SearchResult[]> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!res.ok) throw new Error(`Brave returned ${res.status}`);
  const data = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
  return (data.web?.results ?? []).slice(0, max).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.description ?? "" }));
}

// SearXNG JSON API (instance must enable the json format).
async function searchSearxng(base: string, query: string, max: number): Promise<SearchResult[]> {
  const url = `${base.replace(/\/+$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? []).slice(0, max).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.content ?? "" }));
}

// DuckDuckGo HTML — free, no key. POST is more reliable than GET against the endpoint.
async function searchDuckDuckGo(query: string, max: number): Promise<SearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: `q=${encodeURIComponent(query)}`,
  });
  const html = await res.text();
  const grab = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1].replace(/<[^>]*>/g, "").trim());
  const titles = grab(/class="result__a"[^>]*>(.*?)<\/a/gs);
  const snippets = grab(/class="result__snippet"[^>]*>(.*?)<\/a/gs);
  const urls = grab(/class="result__url"[^>]*>(.*?)<\/a/gs);
  const out: SearchResult[] = [];
  for (let i = 0; i < Math.min(titles.length, max); i++) {
    out.push({ title: titles[i], url: urls[i] ?? "", snippet: snippets[i] ?? "" });
  }
  return out;
}

function formatResults(results: SearchResult[]): string {
  return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
}

// "auto" → prefer the most reliable configured backend, else free DuckDuckGo.
function resolveProvider(setting: string): string {
  if (setting && setting !== "auto") return setting;
  if (webKeys.tavily) return "tavily";
  if (webKeys.brave) return "brave";
  if (getSetting("web.searxngUrl")?.trim()) return "searxng";
  return "duckduckgo";
}

export function registerWebTools(): void {
  registerTool(
    {
      name: "web_search",
      category: "web" as const,
      description: "Search the web for information. Returns top results with titles, URLs, and snippets.",
      parameters: [
        { name: "query", type: "string", description: "Search query", required: true },
        { name: "max_results", type: "number", description: "Max results (default 5)" },
      ],
    },
    async (args) => {
      const query = String(args.query);
      const max = Number(args.max_results) || 5;
      const provider = resolveProvider((getSetting("web.searchProvider") || "auto").toLowerCase());

      try {
        let results: SearchResult[] = [];
        if (provider === "tavily") {
          if (!webKeys.tavily) return { output: "Tavily is selected but no API key is set. Add it in Settings → Advanced → Web search, or switch to DuckDuckGo (free)." };
          results = await searchTavily(webKeys.tavily, query, max);
        } else if (provider === "brave") {
          if (!webKeys.brave) return { output: "Brave Search is selected but no API key is set. Add it in Settings → Advanced → Web search, or switch to DuckDuckGo (free)." };
          results = await searchBrave(webKeys.brave, query, max);
        } else if (provider === "searxng") {
          const base = getSetting("web.searxngUrl")?.trim();
          if (!base) return { output: "SearXNG is selected but no instance URL is set. Add it in Settings → Advanced → Web search, or switch to DuckDuckGo (free)." };
          results = await searchSearxng(base, query, max);
        } else {
          results = await searchDuckDuckGo(query, max);
        }
        if (results.length) return { output: formatResults(results) };
        return { output: `No results from ${provider}. Try a different web search provider in Settings → Advanced → Web search (Tavily's free tier is the most reliable).` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Web search via ${provider} failed: ${msg}. Try a different provider in Settings → Advanced → Web search.` };
      }
    },
  );

  registerTool(
    {
      name: "web_fetch",
      category: "web" as const,
      description: "Fetch a URL and return its text content. Useful for reading web pages.",
      parameters: [{ name: "url", type: "string", description: "URL to fetch", required: true }],
    },
    async (args) => {
      const url = String(args.url);
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      const text = await res.text();
      const clean = text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
      return { output: clean || "(empty page)" };
    },
  );
}
