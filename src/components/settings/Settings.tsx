import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { secureHas, secureSet, secureDelete } from "../../lib/secure";
import { PROVIDERS, type ProviderInfo } from "../../lib/providers";
import { TokenDashboard } from "./TokenDashboard";
import { IconKey, IconBot, IconZap, IconGear, IconBook, IconChart, IconGlobe, IconFolder, IconTerminal, IconClipboard, IconBrain, IconWrench, IconArrowLeft, IconStar, IconShield } from "../icons";
import { About } from "../About";
import { AuditLog } from "./AuditLog";

interface Props {
  onClose: () => void;
}

interface ProviderConfig {
  provider: string;
  model: string;
  baseUrl: string;
}

interface AgentPersonality {
  name: string;
  role: string;
  tone: string;
  language: string;
  instructions: string;
}

type TabId = "provider" | "agent" | "capabilities" | "advanced" | "knowledge" | "connectors" | "context" | "usage" | "audit" | "about";

const TABS: { id: TabId; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "provider", label: "Provider", icon: IconKey },
  { id: "agent", label: "Agent", icon: IconBot },
  { id: "capabilities", label: "Capabilities", icon: IconZap },
  { id: "advanced", label: "Advanced", icon: IconGear },
  { id: "knowledge", label: "Knowledge", icon: IconBook },
  { id: "connectors", label: "Connectors", icon: IconGlobe },
  { id: "context", label: "Context", icon: IconClipboard },
  { id: "usage", label: "Usage", icon: IconChart },
  { id: "audit", label: "Audit", icon: IconShield },
  { id: "about", label: "About", icon: IconStar },
];

export function Settings({ onClose }: Props) {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [personality, setPersonality] = useState<AgentPersonality>({ name: "", role: "", tone: "", language: "", instructions: "" });
  const [hasKey, setHasKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("provider");
  const [isMaximized, setIsMaximized] = useState(false);

  // Change provider flow
  const [changingProvider, setChangingProvider] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [changingModel, setChangingModel] = useState(false);
  const [models, setModels] = useState<{ id: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");

  // Advanced model params
  const [maxTokens, setMaxTokens] = useState("");
  const [maxHistory, setMaxHistory] = useState("");
  const [searxngUrl, setSearxngUrl] = useState("");
  const [searchProvider, setSearchProvider] = useState("auto");
  const [tavilyKey, setTavilyKey] = useState("");
  const [braveKey, setBraveKey] = useState("");
  const [hasTavily, setHasTavily] = useState(false);
  const [hasBrave, setHasBrave] = useState(false);
  const [tgToken, setTgToken] = useState("");
  const [dcToken, setDcToken] = useState("");
  const [hasTg, setHasTg] = useState(false);
  const [hasDc, setHasDc] = useState(false);
  const [connectors, setConnectors] = useState<{ platform: string; running: boolean; status: string }[]>([]);
  const [contextFiles, setContextFiles] = useState<{ name: string; title: string; content: string }[]>([]);
  const [autoExtract, setAutoExtract] = useState(false);
  const [routerEnabled, setRouterEnabled] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(false);

  // Knowledge base / documents (Task 15)
  const [docs, setDocs] = useState<{ id: string; title: string; chunks: number }[]>([]);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docPath, setDocPath] = useState("");

  // Capabilities (Task 14)
  const [capabilities, setCapabilities] = useState<{ name: string; enabled: boolean }[]>([]);
  const CATEGORY_META: Record<string, { label: string; icon: React.FC<{ size?: number }>; desc: string }> = {
    web: { label: "Web", icon: IconGlobe, desc: "Search the web, fetch URLs" },
    file: { label: "Files", icon: IconFolder, desc: "Read, write, search files" },
    system: { label: "System", icon: IconTerminal, desc: "Terminal, process management" },
    code: { label: "Code", icon: IconTerminal, desc: "Execute Python/Node scripts" },
    utility: { label: "Utility", icon: IconClipboard, desc: "Task management, notes" },
    knowledge: { label: "Knowledge", icon: IconBrain, desc: "Save/search facts about you" },
  };

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    try {
      const prov = await invoke<ProviderConfig | null>("provider_get");
      if (prov) {
        setConfig(prov);
        setSelectedProvider(PROVIDERS.find(p => p.id === prov.provider) ?? null);
        setHasKey(await secureHas(`api_key_${prov.provider}`));
      }
      const pers = await invoke<AgentPersonality>("agent_personality_get");
      setPersonality(pers);
      const all = await invoke<Record<string, string>>("engine_rpc", { method: "settings.getAll", params: {} });
      setMaxTokens(all["model.maxTokens"] ?? "");
      setMaxHistory(all["chat.maxHistory"] ?? "");
      setSearxngUrl(all["web.searxngUrl"] ?? "");
      setSearchProvider(all["web.searchProvider"] ?? "auto");
      setHasTavily(await secureHas("api_key_tavily"));
      setHasBrave(await secureHas("api_key_brave"));
      setHasTg(await secureHas("api_key_telegram"));
      setHasDc(await secureHas("api_key_discord"));
      const conn = await invoke<{ connectors: { platform: string; running: boolean; status: string }[] }>("connector_status").catch(() => ({ connectors: [] }));
      setConnectors(conn.connectors ?? []);
      const ctx = await invoke<{ files: { name: string; title: string; content: string }[] }>("engine_rpc", { method: "context.list", params: {} }).catch(() => ({ files: [] }));
      setContextFiles(ctx.files ?? []);
      setAutoExtract(all["memory.autoExtract"] !== "false");
      setRouterEnabled(all["router.enabled"] === "true");
      setCacheEnabled(all["cache.enabled"] === "true");
      await loadDocs();
      try {
        const caps = await invoke<{ categories: { name: string; enabled: boolean }[] }>("engine_rpc", {
          method: "tools.capabilities.get", params: {},
        });
        setCapabilities(caps.categories);
      } catch { /* ignore */ }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  function showMsg(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  }

  async function handleSaveApiKey() {
    if (!config || !newApiKey.trim()) return;
    setSaving(true);
    try {
      await secureSet(`api_key_${config.provider}`, newApiKey.trim());
      setHasKey(true);
      setNewApiKey("");
      showMsg("API key saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleDeleteApiKey() {
    if (!config) return;
    await secureDelete(`api_key_${config.provider}`);
    setHasKey(false);
    showMsg("API key deleted");
  }

  async function handleSavePersonality() {
    setSaving(true);
    try {
      await invoke("engine_rpc", { method: "agent.personality.set", params: { ...personality } });
      showMsg("Agent settings saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleSaveAdvanced() {
    setSaving(true);
    try {
      await invoke("engine_rpc", { method: "settings.set", params: { key: "model.maxTokens", value: maxTokens.trim() } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "chat.maxHistory", value: maxHistory.trim() } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "web.searxngUrl", value: searxngUrl.trim() } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "web.searchProvider", value: searchProvider } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "router.enabled", value: routerEnabled ? "true" : "false" } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "cache.enabled", value: cacheEnabled ? "true" : "false" } });
      showMsg("Advanced settings saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function saveWebKey(name: "tavily" | "brave", value: string) {
    if (!value.trim()) return;
    try {
      await secureSet(`api_key_${name}`, value.trim());
      if (name === "tavily") { setHasTavily(true); setTavilyKey(""); } else { setHasBrave(true); setBraveKey(""); }
      showMsg("Key saved!");
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  async function deleteWebKey(name: "tavily" | "brave") {
    await secureDelete(`api_key_${name}`);
    if (name === "tavily") setHasTavily(false); else setHasBrave(false);
    showMsg("Key deleted");
  }

  async function refreshConnectors() {
    const r = await invoke<{ connectors: { platform: string; running: boolean; status: string }[] }>("connector_status").catch(() => ({ connectors: [] }));
    setConnectors(r.connectors ?? []);
  }
  async function saveConnectorToken(platform: "telegram" | "discord", value: string) {
    if (!value.trim()) return;
    try {
      await secureSet(`api_key_${platform}`, value.trim());
      if (platform === "telegram") { setHasTg(true); setTgToken(""); } else { setHasDc(true); setDcToken(""); }
      showMsg("Token saved!");
    } catch (e) { showMsg(`Error: ${e}`); }
  }
  async function deleteConnectorToken(platform: "telegram" | "discord") {
    await invoke("connector_stop", { platform }).catch(() => {});
    await secureDelete(`api_key_${platform}`);
    if (platform === "telegram") setHasTg(false); else setHasDc(false);
    refreshConnectors();
    showMsg("Token removed");
  }
  async function connectPlatform(platform: "telegram" | "discord") {
    if (!config) { showMsg("Set up a provider first"); return; }
    try {
      await invoke("connector_start", { platform, provider: config.provider, model: config.model, baseUrl: config.baseUrl });
      showMsg(`${platform} connecting…`);
      setTimeout(refreshConnectors, 1500);
    } catch (e) { showMsg(`Error: ${e}`); }
  }
  async function disconnectPlatform(platform: "telegram" | "discord") {
    await invoke("connector_stop", { platform }).catch(() => {});
    setTimeout(refreshConnectors, 300);
  }

  async function saveContext() {
    setSaving(true);
    try {
      for (const f of contextFiles) {
        await invoke("engine_rpc", { method: "context.set", params: { name: f.name, content: f.content } });
      }
      showMsg("Context saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleToggleCapability(name: string) {
    const updated = capabilities.map(c => c.name === name ? { ...c, enabled: !c.enabled } : c);
    setCapabilities(updated);
    const disabled = updated.filter(c => !c.enabled).map(c => c.name);
    try {
      await invoke("engine_rpc", { method: "tools.capabilities.set", params: { disabled } });
      showMsg("Capabilities updated!");
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  // --- Knowledge base ---
  async function loadDocs() {
    const res = await invoke<{ documents: { id: string; title: string; chunks: number }[] }>("engine_rpc", { method: "documents.list", params: {} }).catch(() => ({ documents: [] }));
    setDocs(res.documents ?? []);
  }

  async function handleAddDoc() {
    if (!docContent.trim()) return;
    setSaving(true);
    try {
      await invoke("engine_rpc", { method: "documents.add", params: { title: docTitle.trim() || "Untitled", content: docContent } });
      setDocTitle(""); setDocContent("");
      await loadDocs();
      showMsg("Document added!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleIngestFile() {
    if (!docPath.trim()) return;
    setSaving(true);
    try {
      const r = await invoke<{ chunks: number }>("engine_rpc", { method: "documents.ingestFile", params: { path: docPath.trim() } });
      setDocPath("");
      await loadDocs();
      showMsg(`Ingested (${r.chunks} chunks)!`);
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleDeleteDoc(id: string) {
    await invoke("engine_rpc", { method: "documents.delete", params: { id } });
    await loadDocs();
  }

  // --- Change Provider Flow ---
  async function handleSelectNewProvider(p: ProviderInfo) {
    setSelectedProvider(p);
    if (p.authType === "local") {
      await fetchModels(p.baseUrl, "");
      setChangingModel(true);
    } else {
      setChangingProvider(true);
    }
  }

  async function handleProviderApiKeySubmit() {
    if (!selectedProvider) return;
    await secureSet(`api_key_${selectedProvider.id}`, newApiKey.trim());
    setHasKey(true);
    setNewApiKey("");
    await fetchModels(selectedProvider.id, selectedProvider.baseUrl);
    setChangingModel(true);
  }

  async function fetchModels(provider: string, baseUrl: string) {
    setModelsLoading(true);
    try {
      const result = await invoke<{ models: { id: string }[]; error?: string }>("provider_list_models", { provider, baseUrl });
      setModels(result.models ?? []);
      if (result.error) setModelsError(`Provider error: ${result.error}`);
      else setModelsError(null);
    } catch (e) {
      setModels([]);
      setModelsError(e instanceof Error ? e.message : String(e));
    } finally { setModelsLoading(false); }
  }

  async function handleSelectModel(model: string) {
    if (!selectedProvider) return;
    setSaving(true);
    try {
      await invoke("provider_set", { provider: selectedProvider.id, model, baseUrl: selectedProvider.baseUrl });
      setConfig({ provider: selectedProvider.id, model, baseUrl: selectedProvider.baseUrl });
      setChangingProvider(false);
      setChangingModel(false);
      showMsg(`Switched to ${selectedProvider.name} / ${model}`);
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleMaximize() {
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setIsMaximized(await win.isMaximized());
  }

  const providerInfo = PROVIDERS.find(p => p.id === config?.provider);

  // --- Change Provider: Model Selection (full page overlay) ---
  if (changingModel && selectedProvider) {
    return (
      <div className="flex h-screen flex-col bg-nexus-bg">
        <SettingsTopBar title={`Select Model — ${selectedProvider.name}`} onBack={() => { setChangingModel(false); setChangingProvider(false); }} isMaximized={isMaximized} onMaximize={handleMaximize} />
        <div className="flex-1 overflow-y-auto p-6">
          {modelsLoading && (
            <div className="flex items-center gap-2 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
              <span className="text-sm text-nexus-muted">Fetching models...</span>
            </div>
          )}
          {!modelsLoading && models.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-nexus-border">
              {models.map(m => (
                <button key={m.id} onClick={() => handleSelectModel(m.id)}
                  className="flex w-full items-center gap-2 border-b border-nexus-border px-4 py-2.5 text-left text-sm text-nexus-fg last:border-b-0 hover:bg-nexus-surface hover:text-nexus-accent"
                >{m.id}</button>
              ))}
            </div>
          )}
          {!modelsLoading && modelsError && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3">
              <p className="text-xs text-red-400">{modelsError}</p>
              <p className="mt-1 text-xs text-nexus-muted">You can still enter a model name manually below.</p>
            </div>
          )}
          {!modelsLoading && (
            <div className="mt-4">
              <label className="mb-2 block text-xs text-nexus-muted">Or enter model name manually</label>
              <div className="flex gap-2">
                <input type="text" value={customModel} onChange={e => setCustomModel(e.target.value)}
                  placeholder="e.g. gpt-4o, mimo-v2.5-pro"
                  className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <button onClick={() => handleSelectModel(customModel.trim())} disabled={!customModel.trim() || saving}
                  className="rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
                  {saving ? "Saving..." : "Use"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Change Provider: API Key Input ---
  if (changingProvider && selectedProvider) {
    return (
      <div className="flex h-screen flex-col bg-nexus-bg">
        <SettingsTopBar title={`API Key — ${selectedProvider.name}`} onBack={() => { setChangingProvider(false); setSelectedProvider(null); }} isMaximized={isMaximized} onMaximize={handleMaximize} />
        <div className="flex flex-col gap-4 p-6">
          <p className="text-sm text-nexus-muted">Enter your {selectedProvider.name} API key</p>
          <input type="password" value={newApiKey} onChange={e => setNewApiKey(e.target.value)}
            placeholder={`Enter your ${selectedProvider.name} API key`}
            className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
          <div className="flex gap-3">
            <button onClick={() => { setChangingProvider(false); setSelectedProvider(null); }}
              className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-muted hover:bg-nexus-surface">Cancel</button>
            <button onClick={handleProviderApiKeySubmit} disabled={!newApiKey.trim()}
              className="rounded-lg bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
              Continue → Select Model
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Change Provider: Provider Picker ---
  if (changingProvider && !selectedProvider) {
    return (
      <div className="flex h-screen flex-col bg-nexus-bg">
        <SettingsTopBar title="Change Provider" onBack={() => setChangingProvider(false)} isMaximized={isMaximized} onMaximize={handleMaximize} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-3">
            {PROVIDERS.map(p => (
              <button key={p.id} onClick={() => handleSelectNewProvider(p)}
                className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-all hover:border-nexus-accent hover:bg-nexus-surface ${
                  config?.provider === p.id ? "border-nexus-accent bg-nexus-surface" : "border-nexus-border"
                }`}>
                <span className="font-medium text-nexus-fg">{p.name}</span>
                <span className="text-xs text-nexus-muted">{p.models}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Main Settings (left nav + right content) ---
  return (
    <div className="flex h-screen flex-col bg-nexus-bg">
      {/* Title bar — same style as TopBar */}
      <SettingsTopBar title="Settings" onClose={onClose} isMaximized={isMaximized} onMaximize={handleMaximize} />

      {/* Body: left nav + right content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav panel */}
        <div className="w-52 flex-shrink-0 border-r border-nexus-border/40 bg-nexus-surface/20 py-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition ${
                tab === t.id
                  ? "bg-nexus-surface text-nexus-accent"
                  : "text-nexus-muted hover:bg-nexus-surface/50 hover:text-nexus-fg"
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Right content panel */}
        <div className="flex-1 overflow-y-auto p-6 transition-smooth">
          {msg && (
            <div className="mb-4 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2 text-xs text-nexus-accent animate-dropdown">{msg}</div>
          )}

          {/* Provider */}
          {tab === "provider" && config && (
            <div className="flex flex-col gap-6">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-nexus-fg">Current Provider</h3>
                  <button onClick={() => { setChangingProvider(true); setSelectedProvider(null); }}
                    className="rounded border border-nexus-border px-3 py-1 text-xs text-nexus-muted hover:bg-nexus-surface hover:text-nexus-accent">
                    Change Provider
                  </button>
                </div>
                <div className="rounded-lg border border-nexus-border bg-nexus-surface p-4">
                  <p className="text-sm text-nexus-fg">{providerInfo?.name ?? config.provider}</p>
                  <p className="mt-1 text-xs text-nexus-muted">Base URL: {config.baseUrl}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs text-nexus-muted">Model: <span className="text-nexus-fg">{config.model}</span></p>
                    <button onClick={() => { fetchModels(config.provider, config.baseUrl); setChangingModel(true); setSelectedProvider(providerInfo ?? null); }}
                      className="text-xs text-nexus-muted hover:text-nexus-accent">(change)</button>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-nexus-fg">API Key</h3>
                {hasKey ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-nexus-muted">Key stored securely in OS keychain ✓</span>
                    <button onClick={handleDeleteApiKey} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                ) : <p className="text-xs text-nexus-muted">No API key stored</p>}
                <div className="mt-3 flex gap-2">
                  <input type="password" value={newApiKey} onChange={e => setNewApiKey(e.target.value)}
                    placeholder="Enter new API key"
                    className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                  <button onClick={handleSaveApiKey} disabled={saving || !newApiKey.trim()}
                    className="rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Agent */}
          {tab === "agent" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Agent Name</label>
                <input type="text" value={personality.name} onChange={e => setPersonality(p => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg outline-none focus:border-nexus-accent" />
              </div>
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Role</label>
                <input type="text" value={personality.role} onChange={e => setPersonality(p => ({ ...p, role: e.target.value }))}
                  placeholder="e.g. customer support, coding assistant"
                  className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              </div>
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Custom Instructions</label>
                <textarea value={personality.instructions} onChange={e => setPersonality(p => ({ ...p, instructions: e.target.value }))}
                  rows={5} placeholder="Extra system instructions added to every conversation…"
                  className="w-full resize-none rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              </div>
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Tone</label>
                <div className="flex gap-2">
                  {["professional", "friendly", "casual", "concise"].map(t => (
                    <button key={t} onClick={() => setPersonality(p => ({ ...p, tone: t }))}
                      className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${personality.tone === t ? "border-nexus-accent bg-nexus-surface text-nexus-accent" : "border-nexus-border text-nexus-muted"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Language</label>
                <div className="flex gap-2">
                  {[{ id: "en", label: "English" }, { id: "th", label: "Thai" }, { id: "zh", label: "Chinese" }, { id: "ja", label: "Japanese" }].map(l => (
                    <button key={l.id} onClick={() => setPersonality(p => ({ ...p, language: l.id }))}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${personality.language === l.id ? "border-nexus-accent bg-nexus-surface text-nexus-accent" : "border-nexus-border text-nexus-muted"}`}>{l.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleSavePersonality} disabled={saving}
                className="mt-2 self-start rounded-lg bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Save Agent Settings"}
              </button>
            </div>
          )}

          {/* Capabilities */}
          {tab === "capabilities" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-nexus-muted">Toggle tool categories on/off. Disabled tools won't be available to the agent.</p>
              {capabilities.map(cap => {
                const meta = CATEGORY_META[cap.name] ?? { label: cap.name, icon: IconWrench, desc: "" };
                const Icon = meta.icon;
                return (
                  <div key={cap.name} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface p-4">
                    <div className="flex items-center gap-3">
                      <Icon size={18} />
                      <div>
                        <p className="text-sm font-medium text-nexus-fg">{meta.label}</p>
                        <p className="text-xs text-nexus-muted">{meta.desc}</p>
                      </div>
                    </div>
                    <button onClick={() => handleToggleCapability(cap.name)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${cap.enabled ? "bg-nexus-accent" : "bg-nexus-border"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${cap.enabled ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Advanced */}
          {tab === "advanced" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Max output tokens</label>
                <input type="number" value={maxTokens} onChange={e => setMaxTokens(e.target.value)}
                  placeholder="blank = provider default (1024)"
                  className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <p className="mt-1 text-xs text-nexus-muted">Caps the length of each reply.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Context length (max past turns)</label>
                <input type="number" value={maxHistory} onChange={e => setMaxHistory(e.target.value)}
                  placeholder="0 = unlimited"
                  className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <p className="mt-1 text-xs text-nexus-muted">How many recent turns to send each message. Lower = cheaper.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm text-nexus-muted">Web search provider</label>
                <select value={searchProvider}
                  onChange={async e => { setSearchProvider(e.target.value); await invoke("engine_rpc", { method: "settings.set", params: { key: "web.searchProvider", value: e.target.value } }).catch(() => {}); }}
                  className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2.5 text-sm text-nexus-fg outline-none focus:border-nexus-accent">
                  <option value="auto">Auto — best configured, else free DuckDuckGo</option>
                  <option value="duckduckgo">DuckDuckGo — free, no setup</option>
                  <option value="tavily">Tavily — API key (free tier, best for agents)</option>
                  <option value="brave">Brave Search — API key (free tier)</option>
                  <option value="searxng">SearXNG — self-hosted</option>
                </select>

                {searchProvider === "searxng" && (
                  <input type="text" value={searxngUrl} onChange={e => setSearxngUrl(e.target.value)}
                    placeholder="https://searxng.example.org (JSON API enabled) — then Save Advanced"
                    className="mt-2 w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                )}

                {searchProvider === "tavily" && (
                  <div className="mt-2 flex gap-2">
                    <input type="password" value={tavilyKey} onChange={e => setTavilyKey(e.target.value)}
                      placeholder={hasTavily ? "✓ key saved — enter to replace" : "Tavily API key (tavily.com)"}
                      className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                    <button onClick={() => saveWebKey("tavily", tavilyKey)} disabled={!tavilyKey.trim()}
                      className="rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Save</button>
                    {hasTavily && <button onClick={() => deleteWebKey("tavily")} className="rounded-lg border border-nexus-border px-3 py-2 text-sm text-red-400 hover:bg-nexus-surface">Remove</button>}
                  </div>
                )}

                {searchProvider === "brave" && (
                  <div className="mt-2 flex gap-2">
                    <input type="password" value={braveKey} onChange={e => setBraveKey(e.target.value)}
                      placeholder={hasBrave ? "✓ key saved — enter to replace" : "Brave Search API key (brave.com/search/api)"}
                      className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                    <button onClick={() => saveWebKey("brave", braveKey)} disabled={!braveKey.trim()}
                      className="rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Save</button>
                    {hasBrave && <button onClick={() => deleteWebKey("brave")} className="rounded-lg border border-nexus-border px-3 py-2 text-sm text-red-400 hover:bg-nexus-surface">Remove</button>}
                  </div>
                )}

                <p className="mt-1.5 text-xs text-nexus-muted">Tavily & Brave keys are stored in your OS keychain. DuckDuckGo needs no setup but can be rate-limited; Tavily's free tier is the most reliable for agents.</p>
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
                className="mt-2 self-start rounded-lg bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Save Advanced Settings"}
              </button>
            </div>
          )}

          {/* Knowledge */}
          {tab === "knowledge" && (
            <div className="flex flex-col gap-5">
              <p className="text-xs text-nexus-muted">Add documents the agent can search and cite during chats (RAG). Embeddings are computed on first use with your provider key.</p>
              <div className="flex flex-col gap-2">
                <input type="text" value={docTitle} onChange={e => setDocTitle(e.target.value)}
                  placeholder="Document title"
                  className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <textarea value={docContent} onChange={e => setDocContent(e.target.value)}
                  rows={5} placeholder="Paste document text here…"
                  className="w-full resize-none rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <button onClick={handleAddDoc} disabled={saving || !docContent.trim()}
                  className="self-start rounded-lg bg-nexus-accent px-5 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Add text</button>
              </div>
              <div className="flex gap-2">
                <input type="text" value={docPath} onChange={e => setDocPath(e.target.value)}
                  placeholder="C:\\path\\to\\file.pdf  (PDF, DOCX, XLSX, CSV, TXT, MD)"
                  className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <button onClick={handleIngestFile} disabled={saving || !docPath.trim()}
                  className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">Ingest file</button>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-nexus-fg">Documents ({docs.length})</h3>
                {docs.length === 0 ? (
                  <p className="text-xs text-nexus-muted">No documents yet.</p>
                ) : docs.map(d => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2">
                    <span className="text-sm text-nexus-fg">{d.title} <span className="text-xs text-nexus-muted">· {d.chunks} chunks</span></span>
                    <button onClick={() => handleDeleteDoc(d.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connectors */}
          {tab === "connectors" && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-nexus-muted">Let your agent reply on chat platforms while Nexus is running (Live mode — no server needed). Bot tokens are stored in your OS keychain; remote messages use safe tools only (no terminal/code/file-write).</p>
              {([
                { id: "telegram", label: "Telegram", token: tgToken, setToken: setTgToken, has: hasTg, ph: "123456789:ABCdef...", hint: "Create a bot with @BotFather in Telegram → copy the token → Save → Connect, then message your bot." },
                { id: "discord", label: "Discord", token: dcToken, setToken: setDcToken, has: hasDc, ph: "Bot token", hint: "Discord Developer Portal → your app → Bot → Reset/Copy Token. Enable the MESSAGE CONTENT intent, invite the bot to a server, then @mention it or DM it." },
              ] as const).map(c => {
                const status = connectors.find(s => s.platform === c.id);
                const running = status?.running;
                return (
                  <div key={c.id} className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-nexus-fg">{c.label}</span>
                      <span className={`flex items-center gap-1.5 text-[11px] ${running ? "text-green-400" : "text-nexus-muted"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-green-400" : "bg-nexus-muted/50"}`} />
                        {status?.status ?? "not connected"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input type="password" value={c.token} onChange={e => c.setToken(e.target.value)}
                        placeholder={c.has ? "✓ token saved — enter to replace" : c.ph}
                        className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                      <button onClick={() => saveConnectorToken(c.id, c.token)} disabled={!c.token.trim()}
                        className="rounded-lg border border-nexus-border px-3 py-2 text-sm text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">Save</button>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {running ? (
                        <button onClick={() => disconnectPlatform(c.id)} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-red-400 hover:bg-nexus-surface">Disconnect</button>
                      ) : (
                        <button onClick={() => connectPlatform(c.id)} disabled={!c.has}
                          className="rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">Connect</button>
                      )}
                      {c.has && <button onClick={() => deleteConnectorToken(c.id)} className="text-xs text-nexus-muted/60 hover:text-red-400">Remove token</button>}
                    </div>
                    <p className="mt-2 text-[11px] text-nexus-muted">{c.hint}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Context files */}
          {tab === "context" && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-nexus-muted">Editable .md files injected into every chat (priority: Rules → Soul → About you → Memory → Context) — a transparent layer over the agent's memory.</p>
              <div className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface p-3">
                <div>
                  <p className="text-sm text-nexus-fg">Auto-extract memory</p>
                  <p className="text-xs text-nexus-muted">After each chat, a background LLM call distills durable facts into these files automatically.</p>
                </div>
                <button onClick={async () => { const v = !autoExtract; setAutoExtract(v); await invoke("engine_rpc", { method: "settings.set", params: { key: "memory.autoExtract", value: v ? "true" : "false" } }).catch(() => {}); }}
                  className={`relative h-6 w-11 rounded-full transition-colors ${autoExtract ? "bg-nexus-accent" : "bg-nexus-border"}`}>
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoExtract ? "translate-x-5" : ""}`} />
                </button>
              </div>
              {contextFiles.map((f, i) => (
                <div key={f.name}>
                  <label className="mb-1 block text-sm text-nexus-fg">{f.title} <span className="text-xs text-nexus-muted">({f.name}.md)</span></label>
                  <textarea value={f.content} onChange={e => setContextFiles(prev => prev.map((x, j) => j === i ? { ...x, content: e.target.value } : x))} rows={4}
                    className="w-full resize-y rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                </div>
              ))}
              <button onClick={saveContext} disabled={saving} className="self-start rounded-lg bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save context"}</button>
            </div>
          )}

          {/* Usage */}
          {tab === "usage" && <TokenDashboard />}

          {/* Audit */}
          {tab === "audit" && <AuditLog />}

          {/* About */}
          {tab === "about" && <About />}
        </div>
      </div>
    </div>
  );
}

/** Shared title bar matching TopBar style */
function SettingsTopBar({ title, onClose, onBack, isMaximized, onMaximize }: {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
  isMaximized: boolean;
  onMaximize: () => void;
}) {
  return (
    <div data-tauri-drag-region className="flex h-10 items-center gap-2 border-b border-nexus-border/40 px-3">
      <div className="flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="rounded p-1 text-nexus-muted/60 transition hover:bg-nexus-surface hover:text-nexus-fg">
            <IconArrowLeft size={14} />
          </button>
        )}
        {!onBack && onClose && (
          <button onClick={onClose} className="rounded p-1 text-nexus-muted/60 transition hover:bg-nexus-surface hover:text-nexus-fg">
            <IconArrowLeft size={14} />
          </button>
        )}
        <span className="text-[13px] font-medium text-nexus-fg" data-tauri-drag-region>{title}</span>
      </div>
      <div className="flex-1" data-tauri-drag-region />
      <div className="flex items-center gap-1">
        <div className="mx-1 h-4 w-px bg-nexus-border/50" />
        <button
          onClick={() => getCurrentWindow().minimize()}
          className="flex h-6 w-6 items-center justify-center rounded text-nexus-muted/50 transition hover:bg-nexus-surface hover:text-nexus-muted"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          onClick={onMaximize}
          className="flex h-6 w-6 items-center justify-center rounded text-nexus-muted/50 transition hover:bg-nexus-surface hover:text-nexus-muted"
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2" y="0" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" />
              <rect x="0" y="2" width="8" height="8" rx="1" fill="var(--color-nexus-bg, #0a0a0a)" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          onClick={() => getCurrentWindow().close()}
          className="flex h-6 w-6 items-center justify-center rounded text-nexus-muted/50 transition hover:bg-red-600/80 hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
