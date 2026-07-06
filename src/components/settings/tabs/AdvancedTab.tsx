import { useSettings } from "../SettingsContext";
import { invoke } from "@tauri-apps/api/core";

export default function AdvancedTab() {
  const {
    maxTokens, setMaxTokens, maxHistory, setMaxHistory, maxRounds, setMaxRounds,
    searxngUrl, setSearxngUrl, searchProvider, setSearchProvider,
    tavilyKey, setTavilyKey, braveKey, setBraveKey, hasTavily, hasBrave,
    githubKey, setGithubKey, hasGithub,
    routerEnabled, setRouterEnabled, cacheEnabled, setCacheEnabled,
    saving, handleSaveAdvanced, handleExportAgent, handleImportAgent,
    saveWebKey, deleteWebKey,
  } = useSettings();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Max output tokens</label>
        <input type="number" value={maxTokens} onChange={e => setMaxTokens(e.target.value)}
          placeholder="blank = provider default (1024)"
          className="w-full rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <p className="mt-1 text-xs text-nexus-muted">Caps the length of each reply.</p>
      </div>
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Context length (max past turns)</label>
        <input type="number" value={maxHistory} onChange={e => setMaxHistory(e.target.value)}
          placeholder="0 = unlimited"
          className="w-full rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <p className="mt-1 text-xs text-nexus-muted">How many recent turns to send each message. Lower = cheaper.</p>
      </div>
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Max tool rounds per task</label>
        <input type="number" value={maxRounds} onChange={e => setMaxRounds(e.target.value)}
          placeholder="blank = 12 (max 30)"
          className="w-full rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <p className="mt-1 text-xs text-nexus-muted">How many tool-call rounds the agent may chain to finish one task (install → run → parse → answer). Higher = more autonomous on complex tasks, but more tokens.</p>
      </div>
      <div>
        <label className="mb-2 block text-sm text-nexus-muted">Web search provider</label>
        <select value={searchProvider}
          onChange={async e => { setSearchProvider(e.target.value); await invoke("engine_rpc", { method: "settings.set", params: { key: "web.searchProvider", value: e.target.value } }).catch(() => {}); }}
          className="w-full rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2.5 text-sm text-nexus-fg outline-none focus:border-nexus-accent">
          <option value="auto">Auto — best configured, else free DuckDuckGo</option>
          <option value="duckduckgo">DuckDuckGo — free, no setup</option>
          <option value="tavily">Tavily — API key (free tier, best for agents)</option>
          <option value="brave">Brave Search — API key (free tier)</option>
          <option value="searxng">SearXNG — self-hosted</option>
        </select>

        {searchProvider === "searxng" && (
          <input type="text" value={searxngUrl} onChange={e => setSearxngUrl(e.target.value)}
            placeholder="https://searxng.example.org (JSON API enabled) — then Save Advanced"
            className="mt-2 w-full rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        )}

        {searchProvider === "tavily" && (
          <div className="mt-2 flex gap-2">
            <input type="password" value={tavilyKey} onChange={e => setTavilyKey(e.target.value)}
              placeholder={hasTavily ? "✓ key saved — enter to replace" : "Tavily API key (tavily.com)"}
              className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <button onClick={() => saveWebKey("tavily", tavilyKey)} disabled={!tavilyKey.trim()}
              className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Save</button>
            {hasTavily && <button onClick={() => deleteWebKey("tavily")} className="rounded-xl border border-nexus-border px-3 py-2 text-sm text-red-400 hover:bg-nexus-surface">Remove</button>}
          </div>
        )}

        {searchProvider === "brave" && (
          <div className="mt-2 flex gap-2">
            <input type="password" value={braveKey} onChange={e => setBraveKey(e.target.value)}
              placeholder={hasBrave ? "✓ key saved — enter to replace" : "Brave Search API key (brave.com/search/api)"}
              className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <button onClick={() => saveWebKey("brave", braveKey)} disabled={!braveKey.trim()}
              className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Save</button>
            {hasBrave && <button onClick={() => deleteWebKey("brave")} className="rounded-xl border border-nexus-border px-3 py-2 text-sm text-red-400 hover:bg-nexus-surface">Remove</button>}
          </div>
        )}

        <p className="mt-1.5 text-xs text-nexus-muted">Tavily & Brave keys are stored in your OS keychain. DuckDuckGo needs no setup but can be rate-limited; Tavily's free tier is the most reliable for agents.</p>
        <div className="mt-3 border-t border-nexus-border/30 pt-3">
          <label className="block text-sm text-nexus-fg">GitHub token <span className="text-nexus-muted">(optional)</span></label>
          <p className="mb-2 mt-0.5 text-xs text-nexus-muted">Raises GitHub's rate limit for the Skills marketplace search &amp; install. A classic token with no scopes is enough — stored in your OS keychain.</p>
          <div className="flex gap-2">
            <input type="password" value={githubKey} onChange={e => setGithubKey(e.target.value)}
              placeholder={hasGithub ? "✓ token saved — enter to replace" : "GitHub token (github.com/settings/tokens)"}
              className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
            <button onClick={() => saveWebKey("github", githubKey)} disabled={!githubKey.trim()}
              className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Save</button>
            {hasGithub && <button onClick={() => deleteWebKey("github")} className="rounded-xl border border-nexus-border px-3 py-2 text-sm text-red-400 hover:bg-nexus-surface">Remove</button>}
          </div>
        </div>
      </div>
      <div>
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-sm text-nexus-fg">Smart model routing</span>
            <span className="block text-xs text-nexus-muted">Auto-pick a cheaper model for simpler messages (Task 31).</span>
          </span>
          <button
            type="button"
            onClick={() => setRouterEnabled(v => !v)}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition ${routerEnabled ? "bg-nexus-accent" : "bg-nexus-border"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${routerEnabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </label>
      </div>
      <div>
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-sm text-nexus-fg">Semantic cache</span>
            <span className="block text-xs text-nexus-muted">Reuse past answers for repeated standalone questions (Task 30).</span>
          </span>
          <button
            type="button"
            onClick={() => setCacheEnabled(v => !v)}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition ${cacheEnabled ? "bg-nexus-accent" : "bg-nexus-border"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${cacheEnabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </label>
      </div>
      <button onClick={handleSaveAdvanced} disabled={saving}
        className="mt-2 self-start rounded-xl bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
        {saving ? "Saving..." : "Save Advanced Settings"}
      </button>

      <div className="mt-4 border-t border-nexus-border/40 pt-4">
        <label className="mb-2 block text-sm text-nexus-muted">Export / Import agent</label>
        <div className="flex gap-2">
          <button onClick={handleExportAgent} className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-surface">Export agent</button>
          <button onClick={handleImportAgent} className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-surface">Import agent</button>
        </div>
        <p className="mt-1 text-xs text-nexus-muted">Personality, behavior settings, custom skills, and context as a shareable JSON. Your provider and API keys are never included.</p>
      </div>
    </div>
  );
}
