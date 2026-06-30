import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProviderInfo } from "../../lib/providers";

interface Props {
  provider: ProviderInfo;
  onComplete: (model: string) => void;
  onBack: () => void;
}

interface ModelInfo {
  id: string;
  name?: string;
}

export function ModelSelector({ provider, onComplete, onBack }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    async function fetchModels() {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<{ models: ModelInfo[]; error?: string }>("provider_list_models", {
          provider: provider.id,
          baseUrl: provider.baseUrl,
        });
        setModels(result.models ?? []);
        if (result.error) {
          setError(`Provider returned an error (${result.error}). You can still type a model name manually.`);
        } else if (result.models?.length === 1) {
          setSelected(result.models[0].id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchModels();
  }, [provider]);

  function handleComplete() {
    const model = useCustom ? customModel.trim() : selected;
    if (!model) return;
    onComplete(model);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-400">
        Available models from <span className="text-nexus-accent">{provider.name}</span>
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
          <span className="text-sm text-neutral-500">Fetching models...</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3">
          <p className="text-xs text-red-400">{error}</p>
          <p className="mt-1 text-xs text-neutral-600">You can enter a model name manually below.</p>
        </div>
      )}

      {!loading && models.length > 0 && !useCustom && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-nexus-border">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-all hover:bg-nexus-surface ${
                selected === m.id
                  ? "bg-nexus-surface text-nexus-accent"
                  : "text-neutral-300 border-b border-nexus-border last:border-b-0"
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${selected === m.id ? "bg-nexus-accent" : "bg-nexus-border"}`} />
              {m.id}
            </button>
          ))}
        </div>
      )}

      {/* Custom model input */}
      {(useCustom || error || models.length === 0) && !loading && (
        <div>
          <label className="mb-2 block text-xs text-neutral-500">Model name</label>
          <input
            type="text"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
            placeholder="e.g. gpt-4o, claude-sonnet-4-20250514, ornith-1.0-9b"
            className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-nexus-accent"
          />
        </div>
      )}

      {!useCustom && models.length > 0 && (
        <button
          onClick={() => setUseCustom(true)}
          className="text-xs text-neutral-600 hover:text-neutral-400"
        >
          Enter model name manually →
        </button>
      )}

      {useCustom && (
        <button
          onClick={() => setUseCustom(false)}
          className="text-xs text-neutral-600 hover:text-neutral-400"
        >
          ← Back to model list
        </button>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-neutral-400 hover:bg-nexus-surface">
          Back
        </button>
        <button
          onClick={handleComplete}
          disabled={useCustom ? !customModel.trim() : !selected}
          className="rounded-lg bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
