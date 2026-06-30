import { useState } from "react";
import { secureSet } from "../../lib/secure";
import type { ProviderInfo } from "../../lib/providers";

interface Props {
  provider: ProviderInfo;
  onComplete: (data: { apiKey: string; baseUrl?: string }) => void;
  onBack: () => void;
}

export function ApiKeyInput({ provider, onComplete, onBack }: Props) {
  const isLocal = provider.authType === "local";
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);

  async function handleTest() {
    setTesting(true);
    setError(null);

    if (isLocal) {
      // Test local connection by hitting /models
      try {
        const res = await fetch(`${baseUrl}/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setTested(true);
      } catch (e) {
        setError(`Cannot connect to ${baseUrl} — is ${provider.name} running?`);
      } finally {
        setTesting(false);
      }
    } else {
      if (!apiKey.trim()) {
        setError("Please enter an API key");
        setTesting(false);
        return;
      }
      try {
        await secureSet(`api_key_${provider.id}`, apiKey.trim());
        setTested(true);
      } catch (e) {
        setError(`Failed to save: ${e}`);
      } finally {
        setTesting(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isLocal ? (
        <div>
          <label className="mb-2 block text-sm text-neutral-400">
            {provider.name} Base URL
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => { setBaseUrl(e.target.value); setTested(false); }}
            placeholder="http://localhost:1234/v1"
            className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-nexus-accent"
          />
          <p className="mt-1 text-xs text-neutral-600">
            Default: {provider.baseUrl} — change port if needed
          </p>
        </div>
      ) : (
        <div>
          <label className="mb-2 block text-sm text-neutral-400">
            {provider.name} API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setTested(false); }}
            placeholder={`Enter your ${provider.name} API key`}
            className="w-full rounded-lg border border-nexus-border bg-nexus-surface px-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-nexus-accent"
          />
          {provider.envVar && (
            <p className="mt-1 text-xs text-neutral-600">Env: {provider.envVar}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {tested && (
        <p className="text-xs text-nexus-accent">
          {isLocal ? "Connection successful" : "Key saved securely in OS keychain"}
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-neutral-400 hover:bg-nexus-surface">
          Back
        </button>
        <button
          onClick={handleTest}
          disabled={testing || (isLocal ? !baseUrl.trim() : !apiKey.trim())}
          className="rounded-lg border border-nexus-border px-4 py-2 text-sm text-neutral-400 hover:bg-nexus-surface disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test & Save"}
        </button>
        <button
          onClick={() => onComplete({ apiKey: isLocal ? "" : apiKey.trim(), baseUrl: isLocal ? baseUrl : undefined })}
          disabled={!tested}
          className="rounded-lg bg-nexus-accent px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
