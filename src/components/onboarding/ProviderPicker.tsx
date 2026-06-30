import { MAJOR_PROVIDERS, MORE_PROVIDERS, LOCAL_PROVIDERS, type ProviderInfo } from "../../lib/providers";

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

export function ProviderPicker({ onSelect, selected }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-neutral-400">Popular</h3>
        <div className="grid grid-cols-3 gap-3">
          {MAJOR_PROVIDERS.map(p => (
            <ProviderCard key={p.id} provider={p} selected={selected === p.id} onClick={() => onSelect(p)} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-neutral-400">More Providers</h3>
        <div className="grid grid-cols-3 gap-3">
          {MORE_PROVIDERS.map(p => (
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
