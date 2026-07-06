import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { save, open } from "@tauri-apps/plugin-dialog";
import { secureHas, secureSet, secureDelete } from "../../lib/secure";
import { PROVIDERS, type ProviderInfo } from "../../lib/providers";
import type {
  ProviderConfig, AgentPersonality, SshHost, Experience, Correction,
  Evaluation, PromptVersion, ConnectorStatus, DocItem, ContextFile,
  Capability, LogLine,
} from "./tabs/types";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface SettingsCtx {
  // Provider tab
  config: ProviderConfig | null;
  setConfig: (c: ProviderConfig | null) => void;
  hasKey: boolean;
  setHasKey: (v: boolean) => void;
  newApiKey: string;
  setNewApiKey: (v: string) => void;
  saving: boolean;
  savedProviders: string[];
  setSavedProviders: (v: string[] | ((prev: string[]) => string[])) => void;
  // Change-provider flow
  changingProvider: boolean;
  setChangingProvider: (v: boolean) => void;
  selectedProvider: ProviderInfo | null;
  setSelectedProvider: (v: ProviderInfo | null) => void;
  changingModel: boolean;
  setChangingModel: (v: boolean) => void;
  models: { id: string }[];
  modelsLoading: boolean;
  modelsError: string | null;
  customModel: string;
  setCustomModel: (v: string) => void;
  handleSaveApiKey: () => Promise<void>;
  handleDeleteApiKey: () => Promise<void>;
  handleSelectNewProvider: (p: ProviderInfo) => Promise<void>;
  handleProviderApiKeySubmit: () => Promise<void>;
  fetchModels: (provider: string, baseUrl: string) => Promise<void>;
  handleSelectModel: (model: string) => Promise<void>;
  handleQuickSwitch: (providerId: string) => Promise<void>;

  // Agent tab
  personality: AgentPersonality;
  setPersonality: (v: AgentPersonality | ((prev: AgentPersonality) => AgentPersonality)) => void;
  handleSavePersonality: () => Promise<void>;

  // Capabilities
  capabilities: Capability[];
  handleToggleCapability: (name: string) => Promise<void>;

  // Advanced
  maxTokens: string;
  setMaxTokens: (v: string) => void;
  maxHistory: string;
  setMaxHistory: (v: string) => void;
  maxRounds: string;
  setMaxRounds: (v: string) => void;
  searxngUrl: string;
  setSearxngUrl: (v: string) => void;
  searchProvider: string;
  setSearchProvider: (v: string) => void;
  tavilyKey: string;
  setTavilyKey: (v: string) => void;
  braveKey: string;
  setBraveKey: (v: string) => void;
  hasTavily: boolean;
  hasBrave: boolean;
  githubKey: string;
  setGithubKey: (v: string) => void;
  hasGithub: boolean;
  routerEnabled: boolean;
  setRouterEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  cacheEnabled: boolean;
  setCacheEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleSaveAdvanced: () => Promise<void>;
  handleExportAgent: () => Promise<void>;
  handleImportAgent: () => Promise<void>;
  saveWebKey: (name: "tavily" | "brave" | "github", value: string) => Promise<void>;
  deleteWebKey: (name: "tavily" | "brave" | "github") => Promise<void>;

  // Knowledge
  docs: DocItem[];
  docTitle: string;
  setDocTitle: (v: string) => void;
  docContent: string;
  setDocContent: (v: string) => void;
  docPath: string;
  setDocPath: (v: string) => void;
  folders: string[];
  folderSyncing: boolean;
  vaults: string[];
  vaultSyncing: boolean;
  handleAddDoc: () => Promise<void>;
  handleIngestFile: () => Promise<void>;
  handleDeleteDoc: (id: string) => Promise<void>;
  handleAddFolder: () => Promise<void>;
  handleRemoveFolder: (path: string) => Promise<void>;
  handleSyncFolders: () => Promise<void>;
  handleAddVault: () => Promise<void>;
  handleRemoveVault: (path: string) => Promise<void>;
  handleSyncVaults: () => Promise<void>;

  // Connectors
  connectors: ConnectorStatus[];
  refreshConnectors: () => Promise<void>;
  tgToken: string;
  setTgToken: (v: string) => void;
  dcToken: string;
  setDcToken: (v: string) => void;
  hasTg: boolean;
  hasDc: boolean;
  slackAppToken: string;
  setSlackAppToken: (v: string) => void;
  slackBotToken: string;
  setSlackBotToken: (v: string) => void;
  hasSlack: boolean;
  matrixHomeserver: string;
  setMatrixHomeserver: (v: string) => void;
  matrixToken: string;
  setMatrixToken: (v: string) => void;
  hasMatrix: boolean;
  emailImapHost: string;
  setEmailImapHost: (v: string) => void;
  emailSmtpHost: string;
  setEmailSmtpHost: (v: string) => void;
  emailUser: string;
  setEmailUser: (v: string) => void;
  emailPass: string;
  setEmailPass: (v: string) => void;
  hasEmail: boolean;
  saveConnectorToken: (platform: string, value: string) => Promise<void>;
  deleteConnectorToken: (platform: string) => Promise<void>;
  connectPlatform: (platform: string) => Promise<void>;
  disconnectPlatform: (platform: string) => Promise<void>;

  // SSH
  sshHosts: SshHost[];
  sshForm: { name: string; host: string; user: string; port: string; key_path: string };
  setSshForm: (v: { name: string; host: string; user: string; port: string; key_path: string }) => void;
  sshEditingId: string | null;
  setSshEditingId: (v: string | null) => void;
  sshTesting: string | null;
  saveSshHost: () => Promise<void>;
  editSshHost: (h: SshHost) => void;
  deleteSshHost: (id: string) => Promise<void>;
  testSshHost: (h: SshHost) => Promise<void>;

  // Learning
  expEnabled: boolean;
  setExpEnabled: (v: boolean) => void;
  correctionEnabled: boolean;
  setCorrectionEnabled: (v: boolean) => void;
  evalEnabled: boolean;
  setEvalEnabled: (v: boolean) => void;
  experiences: Experience[];
  setExperiences: (v: Experience[] | ((prev: Experience[]) => Experience[])) => void;
  corrections: Correction[];
  setCorrections: (v: Correction[] | ((prev: Correction[]) => Correction[])) => void;
  lastEval: Evaluation | null;
  corrForm: { trigger_context: string; rule: string };
  setCorrForm: (v: { trigger_context: string; rule: string }) => void;
  promptVersions: PromptVersion[];
  setPromptVersions: (v: PromptVersion[] | ((prev: PromptVersion[]) => PromptVersion[])) => void;
  optimizing: boolean;
  optimizeSkipReason: string | null;
  setOptimizeSkipReason: (v: string | null) => void;
  runOptimize: () => Promise<void>;
  acceptProposal: (id: string) => Promise<void>;
  rejectProposal: (id: string) => void;

  // Context
  contextFiles: ContextFile[];
  setContextFiles: (v: ContextFile[] | ((prev: ContextFile[]) => ContextFile[])) => void;
  autoExtract: boolean;
  setAutoExtract: (v: boolean) => void;
  saveContext: () => Promise<void>;

  // Logs
  logs: LogLine[];
  logsAuto: boolean;
  setLogsAuto: (v: boolean) => void;
  logFilter: string;
  setLogFilter: (v: string) => void;
  refreshLogs: () => Promise<void>;
  handleClearLogs: () => Promise<void>;

  // Shared
  showMsg: (text: string) => void;
  reloadConfig: () => Promise<void>;
}

const SettingsContext = createContext<SettingsCtx | null>(null);

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------
export function SettingsProvider({ children }: { children: ReactNode }) {
  // ---- Provider ----
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedProviders, setSavedProviders] = useState<string[]>([]);
  const [changingProvider, setChangingProvider] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [changingModel, setChangingModel] = useState(false);
  const [models, setModels] = useState<{ id: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");

  // ---- Agent ----
  const [personality, setPersonality] = useState<AgentPersonality>({ name: "", role: "", tone: "", language: "", instructions: "" });

  // ---- Advanced ----
  const [maxTokens, setMaxTokens] = useState("");
  const [maxHistory, setMaxHistory] = useState("");
  const [maxRounds, setMaxRounds] = useState("");
  const [searxngUrl, setSearxngUrl] = useState("");
  const [searchProvider, setSearchProvider] = useState("auto");
  const [tavilyKey, setTavilyKey] = useState("");
  const [braveKey, setBraveKey] = useState("");
  const [hasTavily, setHasTavily] = useState(false);
  const [hasBrave, setHasBrave] = useState(false);
  const [githubKey, setGithubKey] = useState("");
  const [hasGithub, setHasGithub] = useState(false);
  const [routerEnabled, setRouterEnabled] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(false);

  // ---- Connectors ----
  const [tgToken, setTgToken] = useState("");
  const [dcToken, setDcToken] = useState("");
  const [hasTg, setHasTg] = useState(false);
  const [hasDc, setHasDc] = useState(false);
  const [slackAppToken, setSlackAppToken] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");
  const [hasSlack, setHasSlack] = useState(false);
  const [matrixHomeserver, setMatrixHomeserver] = useState("");
  const [matrixToken, setMatrixToken] = useState("");
  const [hasMatrix, setHasMatrix] = useState(false);
  const [emailImapHost, setEmailImapHost] = useState("");
  const [emailSmtpHost, setEmailSmtpHost] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [hasEmail, setHasEmail] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);

  // ---- Context ----
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [autoExtract, setAutoExtract] = useState(false);

  // ---- Knowledge ----
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docPath, setDocPath] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [folderSyncing, setFolderSyncing] = useState(false);
  const [vaults, setVaults] = useState<string[]>([]);
  const [vaultSyncing, setVaultSyncing] = useState(false);

  // ---- Logs ----
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logsAuto, setLogsAuto] = useState(true);
  const [logFilter, setLogFilter] = useState("");

  // ---- SSH ----
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  const [sshForm, setSshForm] = useState({ name: "", host: "", user: "", port: "22", key_path: "" });
  const [sshEditingId, setSshEditingId] = useState<string | null>(null);
  const [sshTesting, setSshTesting] = useState<string | null>(null);

  // ---- Learning ----
  const [expEnabled, setExpEnabled] = useState(false);
  const [correctionEnabled, setCorrectionEnabled] = useState(true);
  const [evalEnabled, setEvalEnabled] = useState(false);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [lastEval, setLastEval] = useState<Evaluation | null>(null);
  const [corrForm, setCorrForm] = useState({ trigger_context: "", rule: "" });
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeSkipReason, setOptimizeSkipReason] = useState<string | null>(null);

  // ---- Capabilities ----
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  // ---- Message toast ----
  const [msg, setMsg] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Helper: flash message
  // ---------------------------------------------------------------------------
  function showMsg(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  }

  // ---------------------------------------------------------------------------
  // Load all config
  // ---------------------------------------------------------------------------
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
      setMaxRounds(all["agent.maxRounds"] ?? "");
      setSearxngUrl(all["web.searxngUrl"] ?? "");
      setSearchProvider(all["web.searchProvider"] ?? "auto");
      setHasTavily(await secureHas("api_key_tavily"));
      setHasBrave(await secureHas("api_key_brave"));
      setHasGithub(await secureHas("api_key_github"));
      setHasTg(await secureHas("api_key_telegram"));
      setHasDc(await secureHas("api_key_discord"));
      setHasSlack(await secureHas("api_key_slack"));
      setHasMatrix(await secureHas("api_key_matrix"));
      setHasEmail(await secureHas("api_key_email"));
      const saved: string[] = [];
      for (const p of PROVIDERS) {
        if (p.authType === "local") { saved.push(p.id); continue; }
        if (await secureHas(`api_key_${p.id}`)) saved.push(p.id);
      }
      setSavedProviders(saved);
      const conn = await invoke<{ connectors: ConnectorStatus[] }>("connector_status").catch(() => ({ connectors: [] }));
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
      const pv = await invoke<{ versions: PromptVersion[] }>("engine_rpc", { method: "optimize.list", params: { limit: 10 } }).catch(() => ({ versions: [] }));
      setPromptVersions(pv.versions ?? []);
      const ctx = await invoke<{ files: ContextFile[] }>("engine_rpc", { method: "context.list", params: {} }).catch(() => ({ files: [] }));
      setContextFiles(ctx.files ?? []);
      setAutoExtract(all["memory.autoExtract"] !== "false");
      setRouterEnabled(all["router.enabled"] === "true");
      setCacheEnabled(all["cache.enabled"] === "true");
      await loadDocs();
      try {
        const caps = await invoke<{ categories: Capability[] }>("engine_rpc", {
          method: "tools.capabilities.get", params: {},
        });
        setCapabilities(caps.categories);
      } catch { /* ignore */ }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  useEffect(() => { loadConfig(); }, []);

  // ---------------------------------------------------------------------------
  // Provider handlers
  // ---------------------------------------------------------------------------
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

  async function handleSelectNewProvider(p: ProviderInfo) {
    setSelectedProvider(p);
    if (p.authType === "local") {
      await fetchModels(p.baseUrl, "");
      setChangingModel(true);
    } else {
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
      // Tell the chat UI (a live overlay, never unmounted) to re-read the now-current
      // provider/model so its header + model picker reflect the change immediately.
      void emit("provider-changed").catch(() => {});
      showMsg(`Switched to ${selectedProvider.name} / ${model}`);
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  async function handleQuickSwitch(providerId: string) {
    const p = PROVIDERS.find(x => x.id === providerId);
    if (!p) return;
    setSaving(true);
    try {
      const keepModel = config?.provider === providerId ? config.model : "";
      await invoke("provider_set", { provider: p.id, model: keepModel || "default", baseUrl: p.baseUrl });
      setConfig({ provider: p.id, model: keepModel || "default", baseUrl: p.baseUrl });
      setHasKey(await secureHas(`api_key_${p.id}`));
      setSelectedProvider(p);
      await fetchModels(p.id, p.baseUrl);
      setChangingModel(true);
      showMsg(`Switched to ${p.name} — pick a model`);
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  // ---------------------------------------------------------------------------
  // Agent handlers
  // ---------------------------------------------------------------------------
  async function handleSavePersonality() {
    setSaving(true);
    try {
      await invoke("engine_rpc", { method: "agent.personality.set", params: { ...personality } });
      showMsg("Agent settings saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  async function handleToggleCapability(name: string) {
    const updated = capabilities.map(c => c.name === name ? { ...c, enabled: !c.enabled } : c);
    setCapabilities(updated);
    const disabled = updated.filter(c => !c.enabled).map(c => c.name);
    try {
      await invoke("engine_rpc", { method: "tools.capabilities.set", params: { disabled } });
      showMsg("Capabilities updated!");
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  // ---------------------------------------------------------------------------
  // Advanced handlers
  // ---------------------------------------------------------------------------
  async function handleSaveAdvanced() {
    setSaving(true);
    try {
      await invoke("engine_rpc", { method: "settings.set", params: { key: "model.maxTokens", value: maxTokens.trim() } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "chat.maxHistory", value: maxHistory.trim() } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "agent.maxRounds", value: maxRounds.trim() } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "web.searxngUrl", value: searxngUrl.trim() } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "web.searchProvider", value: searchProvider } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "router.enabled", value: routerEnabled ? "true" : "false" } });
      await invoke("engine_rpc", { method: "settings.set", params: { key: "cache.enabled", value: cacheEnabled ? "true" : "false" } });
      showMsg("Advanced settings saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
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

  async function saveWebKey(name: "tavily" | "brave" | "github", value: string) {
    if (!value.trim()) return;
    try {
      await secureSet(`api_key_${name}`, value.trim());
      if (name === "tavily") { setHasTavily(true); setTavilyKey(""); }
      else if (name === "brave") { setHasBrave(true); setBraveKey(""); }
      else { setHasGithub(true); setGithubKey(""); }
      showMsg("Key saved!");
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  async function deleteWebKey(name: "tavily" | "brave" | "github") {
    await secureDelete(`api_key_${name}`);
    if (name === "tavily") setHasTavily(false); else if (name === "brave") setHasBrave(false); else setHasGithub(false);
    showMsg("Key deleted");
  }

  // ---------------------------------------------------------------------------
  // Knowledge handlers
  // ---------------------------------------------------------------------------
  async function loadDocs() {
    const res = await invoke<{ documents: DocItem[] }>("engine_rpc", { method: "documents.list", params: {} }).catch(() => ({ documents: [] }));
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

  // ---------------------------------------------------------------------------
  // Connector handlers
  // ---------------------------------------------------------------------------
  async function refreshConnectors() {
    const r = await invoke<{ connectors: ConnectorStatus[] }>("connector_status").catch(() => ({ connectors: [] }));
    setConnectors(r.connectors ?? []);
  }

  const CONNECTOR_HAS_SETTERS: Record<string, (v: boolean) => void> = {
    telegram: setHasTg, discord: setHasDc, slack: setHasSlack, matrix: setHasMatrix, email: setHasEmail,
  };

  async function saveConnectorToken(platform: string, value: string) {
    if (!value.trim()) return;
    try {
      await secureSet(`api_key_${platform}`, value.trim());
      CONNECTOR_HAS_SETTERS[platform]?.(true);
      if (platform === "telegram") setTgToken(""); else if (platform === "discord") setDcToken("");
      showMsg("Saved!");
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  async function deleteConnectorToken(platform: string) {
    await invoke("connector_stop", { platform }).catch(() => {});
    await secureDelete(`api_key_${platform}`);
    CONNECTOR_HAS_SETTERS[platform]?.(false);
    refreshConnectors();
    showMsg("Removed");
  }

  async function connectPlatform(platform: string) {
    if (!config) { showMsg("Set up a provider first"); return; }
    try {
      await invoke("connector_start", { platform, provider: config.provider, model: config.model, baseUrl: config.baseUrl });
      showMsg(`${platform} connecting…`);
      setTimeout(refreshConnectors, 1500);
    } catch (e) { showMsg(`Error: ${e}`); }
  }

  async function disconnectPlatform(platform: string) {
    await invoke("connector_stop", { platform }).catch(() => {});
    setTimeout(refreshConnectors, 300);
  }

  // ---------------------------------------------------------------------------
  // SSH handlers
  // ---------------------------------------------------------------------------
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
      const r = await invoke<{ output: string; error?: string }>("engine_rpc", {
        method: "tools.execute", params: { name: "ssh_exec", arguments: { host: h.name, command: "echo ok" } },
      });
      if (r.error) showMsg(`Connection failed: ${r.error}`);
      else showMsg(r.output?.includes("ok") ? "Connected successfully ✓" : `Connected: ${r.output?.slice(0, 60)}`);
    } catch (e) { showMsg(`Connection failed: ${e}`); } finally { setSshTesting(null); }
  }

  // ---------------------------------------------------------------------------
  // Learning handlers
  // ---------------------------------------------------------------------------
  async function runOptimize() {
    if (!config || optimizing) return;
    setOptimizing(true);
    setOptimizeSkipReason(null);
    try {
      const result = await invoke<{ proposal: PromptVersion | null; skippedReason?: string; failureCount: number }>(
        "optimize_prompt",
        { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
      );
      if (result.proposal) {
        setPromptVersions(prev => [result.proposal!, ...prev]);
        showMsg("Optimizer proposed a new instructions variant — review it below");
      } else {
        setOptimizeSkipReason(result.skippedReason ?? "No proposal generated.");
      }
    } catch (e) {
      showMsg(`Optimize failed: ${e}`);
    } finally {
      setOptimizing(false);
    }
  }

  async function acceptProposal(id: string) {
    try {
      const r = await invoke<{ version: PromptVersion }>("engine_rpc", { method: "optimize.apply", params: { id } });
      setPromptVersions(prev => prev.map(v => v.id === id ? r.version : v));
      const pers = await invoke<AgentPersonality>("agent_personality_get");
      setPersonality(pers);
      showMsg("Applied — instructions updated");
    } catch (e) {
      showMsg(`Apply failed: ${e}`);
    }
  }

  function rejectProposal(id: string) {
    setPromptVersions(prev => prev.filter(v => v.id !== id));
  }

  // ---------------------------------------------------------------------------
  // Context handlers
  // ---------------------------------------------------------------------------
  async function saveContext() {
    setSaving(true);
    try {
      for (const f of contextFiles) {
        await invoke("engine_rpc", { method: "context.set", params: { name: f.name, content: f.content } });
      }
      showMsg("Context saved!");
    } catch (e) { showMsg(`Error: ${e}`); } finally { setSaving(false); }
  }

  // ---------------------------------------------------------------------------
  // Log handlers
  // ---------------------------------------------------------------------------
  async function refreshLogs() {
    const r = await invoke<{ lines: LogLine[] }>("engine_rpc", { method: "logs.get", params: { limit: 500 } }).catch(() => ({ lines: [] }));
    setLogs(r.lines ?? []);
  }

  async function handleClearLogs() {
    await invoke("engine_rpc", { method: "logs.clear", params: {} }).catch(() => {});
    setLogs([]);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const ctx: SettingsCtx = {
    config, setConfig, hasKey, setHasKey, newApiKey, setNewApiKey, saving, savedProviders, setSavedProviders,
    changingProvider, setChangingProvider, selectedProvider, setSelectedProvider,
    changingModel, setChangingModel, models, modelsLoading, modelsError, customModel, setCustomModel,
    handleSaveApiKey, handleDeleteApiKey, handleSelectNewProvider, handleProviderApiKeySubmit,
    fetchModels, handleSelectModel, handleQuickSwitch,
    personality, setPersonality, handleSavePersonality,
    capabilities, handleToggleCapability,
    maxTokens, setMaxTokens, maxHistory, setMaxHistory, maxRounds, setMaxRounds,
    searxngUrl, setSearxngUrl, searchProvider, setSearchProvider,
    tavilyKey, setTavilyKey, braveKey, setBraveKey, hasTavily, hasBrave,
    githubKey, setGithubKey, hasGithub, routerEnabled, setRouterEnabled, cacheEnabled, setCacheEnabled,
    handleSaveAdvanced, handleExportAgent, handleImportAgent, saveWebKey, deleteWebKey,
    docs, docTitle, setDocTitle, docContent, setDocContent, docPath, setDocPath,
    folders, folderSyncing, vaults, vaultSyncing,
    handleAddDoc, handleIngestFile, handleDeleteDoc,
    handleAddFolder, handleRemoveFolder, handleSyncFolders,
    handleAddVault, handleRemoveVault, handleSyncVaults,
    connectors, refreshConnectors,
    tgToken, setTgToken, dcToken, setDcToken, hasTg, hasDc,
    slackAppToken, setSlackAppToken, slackBotToken, setSlackBotToken, hasSlack,
    matrixHomeserver, setMatrixHomeserver, matrixToken, setMatrixToken, hasMatrix,
    emailImapHost, setEmailImapHost, emailSmtpHost, setEmailSmtpHost,
    emailUser, setEmailUser, emailPass, setEmailPass, hasEmail,
    saveConnectorToken, deleteConnectorToken, connectPlatform, disconnectPlatform,
    sshHosts, sshForm, setSshForm, sshEditingId, setSshEditingId, sshTesting,
    saveSshHost, editSshHost, deleteSshHost, testSshHost,
    expEnabled, setExpEnabled, correctionEnabled, setCorrectionEnabled, evalEnabled, setEvalEnabled,
    experiences, setExperiences, corrections, setCorrections, lastEval,
    corrForm, setCorrForm, promptVersions, setPromptVersions, optimizing, optimizeSkipReason, setOptimizeSkipReason,
    runOptimize, acceptProposal, rejectProposal,
    contextFiles, setContextFiles, autoExtract, setAutoExtract, saveContext,
    logs, logsAuto, setLogsAuto, logFilter, setLogFilter, refreshLogs, handleClearLogs,
    showMsg, reloadConfig: loadConfig,
  };

  return (
    <SettingsContext.Provider value={ctx}>
      {children}
      {msg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-nexus-border bg-nexus-surface px-4 py-2 text-xs text-nexus-accent animate-toast z-50">
          {msg}
        </div>
      )}
    </SettingsContext.Provider>
  );
}
