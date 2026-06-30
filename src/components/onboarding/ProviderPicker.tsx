import { DIRECT_PROVIDERS, HUB_PROVIDERS, LOCAL_PROVIDERS, type ProviderInfo } from "../../lib/providers";

interface Props {
  onSelect: (provider: ProviderInfo) => void;
  selected?: string;
}

function ProviderCard({ provider, selected, onClick }: { provider: ProviderInfo; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-all hover:border-nexus-accent hover:bg-nexus-surface ${
        selected ? "border-nexus-accent bg-nexus-surface" : "border-nexus-border bg-transparent"
      }`}
    >
      <span className="font-medium text-neutral-200">{provider.name}</span>
      <span className="text-xs text-neutral-500">{provider.models}</span>
      <span className="text-xs text-neutral-600">{provider.description}</span>
    </button>
  );
}

function HubCard({ provider, selected, onClick }: { provider: ProviderInfo; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-all hover:border-emerald-500/50 hover:bg-nexus-surface ${
        selected ? "border-emerald-500/50 bg-nexus-surface" : "border-emerald-500/20 bg-emerald-500/5"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="font-medium text-neutral-200">{provider.name}</span>
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">FREE TIER</span>
      </span>
      <span className="text-xs text-neutral-400">{provider.models}</span>
      <span className="text-xs text-neutral-600">{provider.description}</span>
    </button>
  );
}

export function ProviderPicker({ onSelect, selected }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Hub — OpenRouter */}
      {HUB_PROVIDERS.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-emerald-400/80">Provider Hub — Access All Models with One Key</h3>
          <div className="grid grid-cols-1 gap-3">
            {HUB_PROVIDERS.map(p => (
              <HubCard key={p.id} provider={p} selected={selected === p.id} onClick={() => onSelect(p)} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">Includes free models — no credit card required to start</p>
        </div>
      )}

      {/* Direct providers */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-neutral-400">Direct Providers — Your Own API Key</h3>
        <div className="grid grid-cols-3 gap-3">
          {DIRECT_PROVIDERS.filter(p => p.tier === "major").map(p => (
            <ProviderCard key={p.id} provider={p} selected={selected === p.id} onClick={() => onSelect(p)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-neutral-400">Specialized Providers</h3>
        <div className="grid grid-cols-3 gap-3">
          {DIRECT_PROVIDERS.filter(p => p.tier === "specialized").map(p => (
            <ProviderCard key={p.id} provider={p} selected={selected === p.id} onClick={() => onSelect(p)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-neutral-400">Local Models</h3>
        <div className="grid grid-cols-3 gap-3">
          {LOCAL_PROVIDERS.map(p => (
            <ProviderCard key={p.id} provider={p} selected={selected === p.id} onClick={() => onSelect(p)} />
          ))}
        </div>
      </div>
    </div>
  );
}
