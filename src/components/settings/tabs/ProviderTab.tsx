import { useSettings } from "../SettingsContext";
import { PROVIDERS } from "../../../lib/providers";

export default function ProviderTab() {
  const {
    config, hasKey, newApiKey, setNewApiKey, saving, savedProviders,
    setChangingProvider, setSelectedProvider, setChangingModel, fetchModels,
    handleSaveApiKey, handleDeleteApiKey, handleQuickSwitch,
    changingProvider, selectedProvider, changingModel,
    models, modelsLoading, modelsError, customModel, setCustomModel,
    handleSelectNewProvider, handleProviderApiKeySubmit, handleSelectModel,
  } = useSettings();

  // --- Change Provider: Model Selection (full page overlay) ---
  if (changingModel && selectedProvider) {
    return (
      <div className="flex flex-col gap-4">
        {modelsLoading && (
          <div className="flex items-center gap-2 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
            <span className="text-sm text-nexus-muted">Fetching models...</span>
          </div>
        )}
        {!modelsLoading && models.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-nexus-border">
            {models.map(m => (
              <button key={m.id} onClick={() => handleSelectModel(m.id)}
                className="flex w-full items-center gap-2 border-b border-nexus-border px-4 py-2.5 text-left text-sm text-nexus-fg last:border-b-0 hover:bg-nexus-surface hover:text-nexus-accent"
              >{m.id}</button>
            ))}
          </div>
        )}
        {!modelsLoading && modelsError && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-3">
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
                className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
              <button onClick={() => handleSelectModel(customModel.trim())} disabled={!customModel.trim() || saving}
                className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Use"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Change Provider: API Key Input ---
  if (changingProvider && selectedProvider) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-nexus-muted">Enter your {selectedProvider.name} API key</p>
        <input type="password" value={newApiKey} onChange={e => setNewApiKey(e.target.value)}
          placeholder={`Enter your ${selectedProvider.name} API key`}
          className="w-full rounded-xl border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
        <div className="flex gap-3">
          <button onClick={() => { setChangingProvider(false); setSelectedProvider(null); }}
            className="rounded-xl border border-nexus-border px-4 py-2 text-sm text-nexus-muted hover:bg-nexus-surface">Cancel</button>
          <button onClick={handleProviderApiKeySubmit} disabled={!newApiKey.trim()}
            className="rounded-xl bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
            Continue → Select Model
          </button>
        </div>
      </div>
    );
  }

  // --- Change Provider: Provider Picker ---
  if (changingProvider && !selectedProvider) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => handleSelectNewProvider(p)}
              className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-all hover:border-nexus-accent hover:bg-nexus-surface ${
                config?.provider === p.id ? "border-nexus-accent bg-nexus-surface" : "border-nexus-border"
              }`}>
              <span className="font-medium text-nexus-fg">{p.name}</span>
              <span className="text-xs text-nexus-muted">{p.models}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Main Provider Tab ---
  if (!config) return null;
  const providerInfo = PROVIDERS.find(p => p.id === config.provider);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-nexus-fg">Current Provider</h3>
          <button onClick={() => { setChangingProvider(true); setSelectedProvider(null); }}
            className="rounded border border-nexus-border px-3 py-1 text-xs text-nexus-muted hover:bg-nexus-surface hover:text-nexus-accent">
            Change Provider
          </button>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-surface p-4">
          <p className="text-sm text-nexus-fg">{providerInfo?.name ?? config.provider}</p>
          <p className="mt-1 text-xs text-nexus-muted">Base URL: {config.baseUrl}</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-xs text-nexus-muted">Model: <span className="text-nexus-fg">{config.model}</span></p>
            <button onClick={() => { fetchModels(config.provider, config.baseUrl); setChangingModel(true); setSelectedProvider(providerInfo ?? null); }}
              className="text-xs text-nexus-muted hover:text-nexus-accent">(change)</button>
          </div>
        </div>
      </div>
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
            className="flex-1 rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2 text-sm text-nexus-fg placeholder-nexus-muted outline-none focus:border-nexus-accent" />
          <button onClick={handleSaveApiKey} disabled={saving || !newApiKey.trim()}
            className="rounded-xl bg-nexus-accent px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
