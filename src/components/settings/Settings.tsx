import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { secureHas, secureSet, secureDelete } from "../../lib/secure";
import { PROVIDERS, type ProviderInfo } from "../../lib/providers";
import { TokenDashboard } from "./TokenDashboard";
import { IconKey, IconBot, IconZap, IconGear, IconBook, IconChart, IconGlobe, IconFolder, IconTerminal, IconClipboard, IconBrain, IconWrench, IconArrowLeft, IconStar, IconShield, IconWifi } from "../icons";
import { About } from "../About";
import { AuditLog } from "./AuditLog";
import { ThemeSettings } from "./ThemeSettings";

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

type TabId = "provider" | "agent" | "capabilities" | "advanced" | "knowledge" | "connectors" | "ssh" | "learning" | "context" | "theme" | "logs" | "usage" | "audit" | "about";

const TABS: { id: TabId; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "provider", label: "Provider", icon: IconKey },
  { id: "agent", label: "Agent", icon: IconBot },
  { id: "capabilities", label: "Capabilities", icon: IconZap },
  { id: "advanced", label: "Advanced", icon: IconGear },
  { id: "knowledge", label: "Knowledge", icon: IconBook },
  { id: "connectors", label: "Connectors", icon: IconGlobe },
  { id: "ssh", label: "SSH Hosts", icon: IconWifi },
  { id: "learning", label: "Learning", icon: IconBrain },
  { id: "context", label: "Context", icon: IconClipboard },
  { id: "theme", label: "Theme", icon: IconStar },
  { id: "usage", label: "Usage", icon: IconChart },
  { id: "audit", label: "Audit", icon: IconShield },
  { id: "logs", label: "Logs", icon: IconTerminal },
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
  // Saved providers (multi-key hot-swap): provider ids with a stored key + local ones.
  const [savedProviders, setSavedProviders] = useState<string[]>([]);

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
  const [folders, setFolders] = useState<string[]>([]);
  const [folderSyncing, setFolderSyncing] = useState(false);
  // Obsidian vaults (Task 52)
  const [vaults, setVaults] = useState<string[]>([]);
  const [vaultSyncing, setVaultSyncing] = useState(false);
  const [logs, setLogs] = useState<{ ts: number; text: string }[]>([]);
  const [logsAuto, setLogsAuto] = useState(true);
  const [logFilter, setLogFilter] = useState("");

  // SSH hosts (remote device control)
  interface SshHost { id: string; name: string; host: string; user: string; port: number; key_path: string | null; created_at: number }
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  const [sshForm, setSshForm] = useState({ name: "", host: "", user: "", port: "22", key_path: "" });
  const [sshEditingId, setSshEditingId] = useState<string | null>(null);
  const [sshTesting, setSshTesting] = useState<string | null>(null);

  // Self-improvement (Tasks 47 & 49)
  interface Experience { id: string; input: string; output: string; tool_steps: { name: string; ok: boolean }[]; success: boolean; model: string | null; feedback: "up" | "down" | null; created_at: number }
  interface Correction { id: string; trigger_context: string; rule: string; created_at: number }
  interface Evaluation { id: string; completion: number; satisfaction: number; efficiency: number; note: string | null; created_at: number }
  const [expEnabled, setExpEnabled] = useState(false);
  const [correctionEnabled, setCorrectionEnabled] = useState(true);
  const [evalEnabled, setEvalEnabled] = useState(false);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [lastEval, setLastEval] = useState<Evaluation | null>(null);
  const [corrForm, setCorrForm] = useState({ trigger_context: "", rule: "" });

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
      // Detect every provider with a saved key (for multi-provider hot-swap).
      // Local providers (Ollama/LM Studio) are always available — no key needed.
      const saved: string[] = [];
      for (const p of PROVIDERS) {
        if (p.authType === "local") { saved.push(p.id); continue; }
        if (await secureHas(`api_key_${p.id}`)) saved.push(p.id);
      }
      setSavedProviders(saved);
      const conn = await invoke<{ connectors: { platform: string; running: boolean; status: string }[] }>("connector_status").catch(() => ({ connectors: [] }));
      setConnectors(conn.connectors ?? []);
      const ssh = await invoke<{ hosts: SshHost[] }>("engine_rpc", { method: "ssh.list", params: {} }).catch(() => ({ hosts: [] }));
      setSshHosts(ssh.hosts ?? []);
      setExpEnabled(all["experience.enabled"] === "true");
      setCorrectionEnabled(all["correction.enabled"] !== "false");
      setEvalEnabled(all["evaluation.enabled"] === "true");
      const exps = await invoke<{ experiences: Experience[] }>("engine_rpc", { method: "experience.list", params: { limit: 30 } }).catch(() => ({ experiences: [] }));
      setExperiences(exps.experiences ?? []);
      const corrs = await invoke<{ corrections: Correction[] }>("engine_rpc", { method: "correction.list", params: {} }).catch(() => ({ corrections: [] }));
      setCorrections(corrs.corrections ?? []);
      const ev = await invoke<{ evaluation: Evaluation | null }>("engine_rpc", { method: "evaluation.last", params: {} }).catch(() => ({ evaluation: null }));
      setLastEval(ev.evaluation ?? null);
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

  async function handleExportAgent() {
    const path = await save({ defaultPath: "nexus-agent.json", filters: [{ name: "JSON", extensions: ["json"] }] }).catch(() => null);
    if (!path) return;
    try {
      await invoke("engine_rpc", { method: "agent.export", params: { path } });
      showMsg("Agent exported");
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  async function handleImportAgent() {
    const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }] }).catch(() => null);
    if (typeof path !== "string") return;
    try {
      const r = await invoke<{ skills: number }>("engine_rpc", { method: "agent.import", params: { path } });
      await loadConfig();
      showMsg(`Imported agent (+${r.skills} skills)`);
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  async function handleSaveApiKey() {
    if (!config || !newApiKey.trim()) return;
    setSaving(true);
    try {
      await secureSet(`api_key_${config.provider}`, newApiKey.trim());
      setHasKey(true);
      setNewApiKey("");
      if (!savedProviders.includes(config.provider)) setSavedProviders(prev => [...prev, config.provider]);
      showMsg("API key saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleDeleteApiKey() {
    if (!config) return;
    await secureDelete(`api_key_${config.provider}`);
    setHasKey(false);
    setSavedProviders(prev => prev.filter(id => id !== config.provider));
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

  async function reloadSsh() {
    const ssh = await invoke<{ hosts: SshHost[] }>("engine_rpc", { method: "ssh.list", params: {} }).catch(() => ({ hosts: [] }));
    setSshHosts(ssh.hosts ?? []);
  }

  async function saveSshHost() {
    if (!sshForm.name.trim() || !sshForm.host.trim() || !sshForm.user.trim()) {
      showMsg("Name, host and user are required"); return;
    }
    const payload = {
      name: sshForm.name.trim(), host: sshForm.host.trim(), user: sshForm.user.trim(),
      port: Number(sshForm.port) || 22, key_path: sshForm.key_path.trim() || undefined,
    };
    try {
      if (sshEditingId) {
        await invoke("engine_rpc", { method: "ssh.update", params: { id: sshEditingId, ...payload } });
      } else {
        await invoke("engine_rpc", { method: "ssh.add", params: payload });
      }
      setSshForm({ name: "", host: "", user: "", port: "22", key_path: "" });
      setSshEditingId(null);
      await reloadSsh();
      showMsg("SSH host saved");
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  function editSshHost(h: SshHost) {
    setSshEditingId(h.id);
    setSshForm({ name: h.name, host: h.host, user: h.user, port: String(h.port), key_path: h.key_path ?? "" });
  }

  async function deleteSshHost(id: string) {
    await invoke("engine_rpc", { method: "ssh.delete", params: { id } }).catch(() => {});
    await reloadSsh();
  }

  async function testSshHost(h: SshHost) {
    setSshTesting(h.id);
    try {
      // Run `echo ok` on the remote host via the engine's ssh_exec tool.
      const r = await invoke<{ output: string; error?: string }>("engine_rpc", {
        method: "tools.execute", params: { name: "ssh_exec", arguments: { host: h.name, command: "echo ok" } },
      });
      if (r.error) showMsg(`Connection failed: ${r.error}`);
      else showMsg(r.output?.includes("ok") ? "Connected successfully ✓" : `Connected: ${r.output?.slice(0, 60)}`);
    } catch (e) { showMsg(`Connection failed: ${e}`); } finally { setSshTesting(null); }
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
    const f = await invoke<{ folders: string[] }>("engine_rpc", { method: "folders.list", params: {} }).catch(() => ({ folders: [] }));
    setFolders(f.folders ?? []);
    const vs = await invoke<{ vaults: string[] }>("engine_rpc", { method: "obsidian.vaults.list", params: {} }).catch(() => ({ vaults: [] }));
    setVaults(vs.vaults ?? []);
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

  async function handleAddFolder() {
    const dir = await open({ directory: true, title: "Pick a folder to index" }).catch(() => null);
    if (typeof dir !== "string") return;
    await invoke("engine_rpc", { method: "folders.add", params: { path: dir } }).catch(() => {});
    await loadDocs();
  }
  async function handleRemoveFolder(path: string) {
    await invoke("engine_rpc", { method: "folders.remove", params: { path } }).catch(() => {});
    await loadDocs();
  }
  async function handleSyncFolders() {
    setFolderSyncing(true);
    try {
      const r = await invoke<{ indexed: number; total: number }>("engine_rpc", { method: "folders.sync", params: {} });
      await loadDocs();
      showMsg(`Synced — indexed ${r.indexed} of ${r.total} files`);
    } catch (e) { showMsg(`Error: ${e}`); } finally { setFolderSyncing(false); }
  }

  // --- Obsidian vaults (Task 52) ---
  async function handleAddVault() {
    const dir = await open({ directory: true, title: "Pick an Obsidian vault folder" }).catch(() => null);
    if (typeof dir !== "string") return;
    await invoke("engine_rpc", { method: "obsidian.vaults.add", params: { path: dir } }).catch(() => {});
    const vs = await invoke<{ vaults: string[] }>("engine_rpc", { method: "obsidian.vaults.list", params: {} });
    setVaults(vs.vaults ?? []);
  }
  async function handleRemoveVault(path: string) {
    await invoke("engine_rpc", { method: "obsidian.vaults.remove", params: { path } }).catch(() => {});
    const vs = await invoke<{ vaults: string[] }>("engine_rpc", { method: "obsidian.vaults.list", params: {} });
    setVaults(vs.vaults ?? []);
  }
  async function handleSyncVaults() {
    setVaultSyncing(true);
    try {
      const r = await invoke<{ indexed: number; total: number }>("engine_rpc", { method: "obsidian.vaults.sync", params: {} });
      await loadDocs();
      showMsg(`Synced — indexed ${r.indexed} of ${r.total} notes`);
    } catch (e) { showMsg(`Error: ${e}`); } finally { setVaultSyncing(false); }
  }

  async function refreshLogs() {
    const r = await invoke<{ lines: { ts: number; text: string }[] }>("engine_rpc", { method: "logs.get", params: { limit: 500 } }).catch(() => ({ lines: [] }));
    setLogs(r.lines ?? []);
  }
  async function handleClearLogs() {
    await invoke("engine_rpc", { method: "logs.clear", params: {} }).catch(() => {});
    setLogs([]);
  }
  useEffect(() => {
    if (tab !== "logs") return;
    refreshLogs();
    if (!logsAuto) return;
    const iv = setInterval(refreshLogs, 2000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, logsAuto]);

  // --- Change Provider Flow ---
  async function handleSelectNewProvider(p: ProviderInfo) {
    setSelectedProvider(p);
    if (p.authType === "local") {
      await fetchModels(p.baseUrl, "");
      setChangingModel(true);
    } else {
      // If this provider already has a saved key, skip key entry → go to model select.
      const alreadyHas = await secureHas(`api_key_${p.id}`);
      if (alreadyHas) {
        setHasKey(true);
        await fetchModels(p.id, p.baseUrl);
        setChangingModel(true);
      } else {
        setChangingProvider(true);
      }
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

  // Hot-swap to a provider whose key is already saved (no re-entry needed).
  async function handleQuickSwitch(providerId: string) {
    const p = PROVIDERS.find(x => x.id === providerId);
    if (!p) return;
    setSaving(true);
    try {
      // Keep the current model only if it belonged to this provider; otherwise
      // leave model as-is and let the user pick a model after switching.
      const keepModel = config?.provider === providerId ? config.model : "";
      await invoke("provider_set", { provider: p.id, model: keepModel || "default", baseUrl: p.baseUrl });
      setConfig({ provider: p.id, model: keepModel || "default", baseUrl: p.baseUrl });
      setHasKey(await secureHas(`api_key_${p.id}`));
      // Open model picker so the user can choose a model for the newly active provider.
      setSelectedProvider(p);
      await fetchModels(p.id, p.baseUrl);
      setChangingModel(true);
      showMsg(`Switched to ${p.name} — pick a model`);
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
              {/* Saved providers — one-tap hot-swap among providers with a stored key */}
              {savedProviders.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-nexus-fg">Saved providers <span className="text-xs font-normal text-nexus-muted">— tap to switch instantly</span></h3>
                  <div className="flex flex-wrap gap-2">
                    {PROVIDERS.filter(p => savedProviders.includes(p.id)).map(p => (
                      <button key={p.id} onClick={() => handleQuickSwitch(p.id)} disabled={p.id === config.provider || saving}
                        title={p.id === config.provider ? "Currently active" : `Switch to ${p.name}`}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
                          p.id === config.provider
                            ? "border-nexus-accent bg-nexus-surface text-nexus-accent"
                            : "border-nexus-border text-nexus-fg hover:border-nexus-accent hover:bg-nexus-surface"
                        }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${p.id === config.provider ? "bg-nexus-accent" : "bg-green-400"}`} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] text-nexus-muted/60">Each provider's key is stored separately in the OS keychain — switch anytime without re-entering it.</p>
                </div>
              )}
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

              <div className="mt-4 border-t border-nexus-border/40 pt-4">
                <label className="mb-2 block text-sm text-nexus-muted">Export / Import agent</label>
                <div className="flex gap-2">
                  <button onClick={handleExportAgent} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-surface">Export agent</button>
                  <button onClick={handleImportAgent} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-fg hover:bg-nexus-surface">Import agent</button>
                </div>
                <p className="mt-1 text-xs text-nexus-muted">Personality, behavior settings, custom skills, and context as a shareable JSON. Your provider and API keys are never included.</p>
              </div>
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

              <div className="flex flex-col gap-2 border-t border-nexus-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-nexus-fg">Watched folders ({folders.length})</h3>
                  <div className="flex gap-2">
                    <button onClick={handleAddFolder} className="rounded-lg border border-nexus-border px-3 py-1.5 text-xs text-nexus-fg hover:bg-nexus-surface">+ Add folder</button>
                    <button onClick={handleSyncFolders} disabled={folderSyncing || folders.length === 0} className="rounded-lg bg-nexus-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50">{folderSyncing ? "Syncing…" : "Sync now"}</button>
                  </div>
                </div>
                {folders.length === 0 ? (
                  <p className="text-xs text-nexus-muted">No folders. Add a folder to auto-index its files (PDF/DOCX/XLSX/CSV/TXT/MD/JSON) into the knowledge base.</p>
                ) : folders.map(f => (
                  <div key={f} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2">
                    <span className="truncate text-xs text-nexus-fg">{f}</span>
                    <button onClick={() => handleRemoveFolder(f)} className="ml-2 flex-shrink-0 text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-nexus-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-nexus-fg">Obsidian vaults ({vaults.length})</h3>
                  <div className="flex gap-2">
                    <button onClick={handleAddVault} className="rounded-lg border border-nexus-border px-3 py-1.5 text-xs text-nexus-fg hover:bg-nexus-surface">+ Add vault</button>
                    <button onClick={handleSyncVaults} disabled={vaultSyncing || vaults.length === 0} className="rounded-lg bg-nexus-accent px-3 py-1.5 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50">{vaultSyncing ? "Syncing…" : "Sync now"}</button>
                  </div>
                </div>
                <p className="text-xs text-nexus-muted">Index an Obsidian vault: strips YAML frontmatter, captures tags, and resolves <code className="text-nexus-gold-light">[[wikilinks]]</code> into linked-note context so graph neighborhood is searchable.</p>
                {vaults.length === 0 ? (
                  <p className="text-xs text-nexus-muted">No vaults. Add a vault folder to index its markdown notes.</p>
                ) : vaults.map(v => (
                  <div key={v} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2">
                    <span className="truncate text-xs text-nexus-fg">{v}</span>
                    <button onClick={() => handleRemoveVault(v)} className="ml-2 flex-shrink-0 text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                ))}
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

          {/* SSH hosts — remote device control */}
          {tab === "ssh" && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-nexus-muted">Let the agent control remote machines over SSH (e.g. a PC, Mac, or server on your Tailscale network). Authentication uses an SSH <span className="text-nexus-fg/70">key file</span> — the key itself is never read or stored by Nexus; <code className="text-nexus-gold-light">ssh -i &lt;path&gt;</code> reads it from disk. Leave the key path empty to use your default ssh config / agent.</p>

              {/* Add / edit form */}
              <div className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-4">
                <p className="mb-3 text-sm font-medium text-nexus-fg">{sshEditingId ? "Edit host" : "Add a host"}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={sshForm.name} onChange={e => setSshForm({ ...sshForm, name: e.target.value })} placeholder="Name (e.g. macbook)"
                    className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                  <input value={sshForm.host} onChange={e => setSshForm({ ...sshForm, host: e.target.value })} placeholder="Host (IP / Tailscale name / domain)"
                    className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                  <input value={sshForm.user} onChange={e => setSshForm({ ...sshForm, user: e.target.value })} placeholder="User (e.g. euromoods)"
                    className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                  <input value={sshForm.port} onChange={e => setSshForm({ ...sshForm, port: e.target.value })} placeholder="Port (22)"
                    className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                  <input value={sshForm.key_path} onChange={e => setSshForm({ ...sshForm, key_path: e.target.value })} placeholder="Private key path (optional, e.g. ~/.ssh/id_ed25519)"
                    className="col-span-2 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={saveSshHost} className="rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90">{sshEditingId ? "Update" : "Add host"}</button>
                  {sshEditingId && <button onClick={() => { setSshEditingId(null); setSshForm({ name: "", host: "", user: "", port: "22", key_path: "" }); }} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-nexus-muted hover:bg-nexus-surface">Cancel</button>}
                </div>
              </div>

              {/* Host list */}
              {sshHosts.length === 0 ? (
                <p className="text-xs text-nexus-muted/60">No SSH hosts yet. Add one above to let the agent run commands on a remote machine.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sshHosts.map(h => (
                    <div key={h.id} className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-nexus-fg">{h.name}</p>
                          <p className="truncate font-mono text-[11px] text-nexus-muted">{h.user}@{h.host}:{h.port}{h.key_path ? `  ·  key: ${h.key_path}` : "  ·  default key/agent"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => testSshHost(h)} disabled={sshTesting === h.id}
                            className="rounded-md border border-nexus-border px-2.5 py-1 text-[11px] text-nexus-fg hover:bg-nexus-surface disabled:opacity-50">{sshTesting === h.id ? "…" : "Test"}</button>
                          <button onClick={() => editSshHost(h)} className="rounded-md border border-nexus-border px-2.5 py-1 text-[11px] text-nexus-muted hover:bg-nexus-surface hover:text-nexus-fg">Edit</button>
                          <button onClick={() => deleteSshHost(h.id)} className="rounded-md px-2.5 py-1 text-[11px] text-red-400/80 hover:bg-nexus-surface hover:text-red-400">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-nexus-muted/50">The agent reaches these hosts via the <code className="text-nexus-gold-light">ssh_exec</code> / <code className="text-nexus-gold-light">ssh_upload</code> / <code className="text-nexus-gold-light">ssh_download</code> tools. Ask it to “run a command on &lt;name&gt;” or “copy a file to &lt;name&gt;”.</p>
            </div>
          )}

          {/* Learning — self-improvement (Tasks 47 & 49) */}
          {tab === "learning" && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-nexus-muted">The agent learns from experience: it logs every task, learns correction rules from your thumbs-down feedback, and (optionally) scores itself after each turn.</p>

              {/* Toggles */}
              <div className="flex flex-col gap-2">
                {([
                  { key: "experience", label: "Experience logging", desc: "Record every task (input, steps, output) so patterns can be detected and the agent improves over time.", val: expEnabled, set: setExpEnabled },
                  { key: "correction", label: "Correction memory", desc: "Learn rules from your 👎 feedback and apply them in similar future situations.", val: correctionEnabled, set: setCorrectionEnabled },
                  { key: "evaluation", label: "Self-evaluation", desc: "After each turn, a background call scores completion / satisfaction / efficiency.", val: evalEnabled, set: setEvalEnabled },
                ] as const).map(t => (
                  <div key={t.key} className="flex items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface p-3">
                    <div>
                      <p className="text-sm text-nexus-fg">{t.label}</p>
                      <p className="text-xs text-nexus-muted">{t.desc}</p>
                    </div>
                    <button onClick={async () => { const v = !t.val; t.set(v); await invoke("engine_rpc", { method: "settings.set", params: { key: `${t.key}.enabled`, value: v ? "true" : "false" } }).catch(() => {}); }}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${t.val ? "bg-nexus-accent" : "bg-nexus-border"}`}>
                      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${t.val ? "translate-x-5" : ""}`} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Last self-evaluation */}
              {lastEval && (
                <div className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-3">
                  <p className="mb-2 text-sm font-medium text-nexus-fg">Last self-evaluation</p>
                  <div className="flex gap-4 text-xs">
                    {(["completion", "satisfaction", "efficiency"] as const).map(k => (
                      <div key={k} className="flex flex-col items-center gap-1">
                        <span className="text-lg font-semibold text-nexus-gold">{lastEval[k]}</span>
                        <span className="capitalize text-nexus-muted">{k}</span>
                      </div>
                    ))}
                  </div>
                  {lastEval.note && <p className="mt-2 text-[11px] italic text-nexus-muted/70">"{lastEval.note}"</p>}
                </div>
              )}

              {/* Correction rules */}
              <div>
                <p className="mb-2 text-sm font-medium text-nexus-fg">Correction rules ({corrections.length})</p>
                <div className="mb-2 rounded-lg border border-nexus-border bg-nexus-surface/40 p-3">
                  <p className="mb-2 text-[11px] text-nexus-muted">Add a rule — the agent injects matching rules into future replies so it doesn't repeat a mistake.</p>
                  <div className="flex flex-col gap-2">
                    <input value={corrForm.trigger_context} onChange={e => setCorrForm({ ...corrForm, trigger_context: e.target.value })} placeholder="When… (the situation, e.g. 'writing git commits')"
                      className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                    <input value={corrForm.rule} onChange={e => setCorrForm({ ...corrForm, rule: e.target.value })} placeholder="Do this instead… (e.g. 'use conventional commit format')"
                      className="rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                    <button onClick={async () => {
                      if (!corrForm.trigger_context.trim() || !corrForm.rule.trim()) { showMsg("Both fields are required"); return; }
                      await invoke("engine_rpc", { method: "correction.add", params: { ...corrForm } });
                      const c = await invoke<{ corrections: Correction[] }>("engine_rpc", { method: "correction.list", params: {} });
                      setCorrections(c.corrections ?? []);
                      setCorrForm({ trigger_context: "", rule: "" });
                      showMsg("Correction rule added");
                    }} className="self-start rounded-lg bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90">Add rule</button>
                  </div>
                </div>
                {corrections.length === 0 ? (
                  <p className="text-xs text-nexus-muted/60">No rules yet — add one above.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {corrections.map(c => (
                      <div key={c.id} className="rounded-lg border border-nexus-border bg-nexus-surface/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-nexus-muted">When {c.trigger_context}</p>
                            <p className="text-sm text-nexus-fg">{c.rule}</p>
                          </div>
                          <button onClick={() => { invoke("engine_rpc", { method: "correction.delete", params: { id: c.id } }).then(() => setCorrections(prev => prev.filter(x => x.id !== c.id))); }}
                            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] text-red-400/70 hover:bg-nexus-surface hover:text-red-400">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent experiences */}
              <div>
                <p className="mb-2 text-sm font-medium text-nexus-fg">Recent experiences ({experiences.length})</p>
                {experiences.length === 0 ? (
                  <p className="text-xs text-nexus-muted/60">Enable experience logging above and chat with the agent — tasks will appear here.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {experiences.slice(0, 15).map(x => (
                      <div key={x.id} className="flex items-center gap-2 rounded-md border border-nexus-border/50 bg-nexus-surface/30 px-3 py-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.success ? "bg-green-400" : "bg-red-400"}`} title={x.success ? "succeeded" : "had a failed step"} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-nexus-fg/70">{x.input}</span>
                        {x.tool_steps.length > 0 && <span className="shrink-0 text-[10px] text-nexus-muted/50">{x.tool_steps.length} tools</span>}
                        {x.feedback && <span className={`shrink-0 text-[10px] ${x.feedback === "up" ? "text-green-400" : "text-red-400"}`}>{x.feedback === "up" ? "👍" : "👎"}</span>}
                        <span className="shrink-0 text-[10px] text-nexus-muted/40">{new Date(x.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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

          {/* Logs */}
          {tab === "logs" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input type="text" value={logFilter} onChange={e => setLogFilter(e.target.value)} placeholder="Filter logs…"
                  className="flex-1 rounded-lg border border-nexus-border bg-nexus-surface px-3 py-2 text-xs text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
                <button onClick={refreshLogs} className="rounded-lg border border-nexus-border px-3 py-2 text-xs text-nexus-fg hover:bg-nexus-surface">Refresh</button>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-nexus-muted">
                  <input type="checkbox" checked={logsAuto} onChange={e => setLogsAuto(e.target.checked)} className="accent-nexus-accent" /> Auto
                </label>
                <button onClick={handleClearLogs} className="rounded-lg border border-nexus-border px-3 py-2 text-xs text-red-400 hover:bg-nexus-surface">Clear</button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-nexus-border bg-nexus-bg/60 p-3 font-mono text-[11px] leading-relaxed">
                {(() => {
                  const q = logFilter.trim().toLowerCase();
                  const filtered = q ? logs.filter(l => l.text.toLowerCase().includes(q)) : logs;
                  if (filtered.length === 0) return <p className="text-nexus-muted/40">No log lines{q ? " match the filter" : " yet"}.</p>;
                  return filtered.map((l, i) => {
                    const err = /error|fail|✗|denied|exception/i.test(l.text);
                    return (
                      <div key={i} className={`whitespace-pre-wrap ${err ? "text-red-400/90" : "text-nexus-fg/80"}`}>
                        <span className="text-nexus-muted/40">{new Date(l.ts).toLocaleTimeString([], { hour12: false })} </span>{l.text}
                      </div>
                    );
                  });
                })()}
              </div>
              <p className="text-[10px] text-nexus-muted/50">Engine runtime logs (last {logs.length}) — tool calls, MCP, scheduler, connectors, errors. Captured from the sidecar.</p>
            </div>
          )}

          {/* Usage */}
          {tab === "theme" && <ThemeSettings />}
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
