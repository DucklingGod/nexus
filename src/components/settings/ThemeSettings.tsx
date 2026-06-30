import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SpaceFxSettings {
  starsEnabled: boolean;
  starDensity: number;      // 50-500
  starBrightness: number;   // 0.2-1.0
  starGoldRatio: number;    // 0-50%
  cometsEnabled: boolean;
  cometFrequency: number;   // 1-15 seconds between comets
  cometSpeed: number;       // 1-20
  canvasOpacity: number;    // 0.3-1.0
  glowEnabled: boolean;
}

const DEFAULTS: SpaceFxSettings = {
  starsEnabled: true,
  starDensity: 350,
  starBrightness: 0.85,
  starGoldRatio: 25,
  cometsEnabled: true,
  cometFrequency: 5,
  cometSpeed: 8,
  canvasOpacity: 0.85,
  glowEnabled: true,
};

function key(k: keyof SpaceFxSettings) { return `theme.spaceFx.${k}`; }

export function useSpaceFxSettings(): SpaceFxSettings {
  const [settings, setSettings] = useState<SpaceFxSettings>(DEFAULTS);

  useEffect(() => {
    invoke<Record<string, string>>("engine_rpc", { method: "settings.get_all", params: {} })
      .then(all => {
        const s = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS) as (keyof SpaceFxSettings)[]) {
          const v = all[key(k)];
          if (v !== undefined && v !== null && v !== "") {
            if (typeof DEFAULTS[k] === "boolean") (s as any)[k] = v === "true";
            else (s as any)[k] = Number(v) || DEFAULTS[k];
          }
        }
        setSettings(s);
      })
      .catch(() => {});
  }, []);

  return settings;
}

interface Props {
  onSettingsChange?: () => void;
}

export function ThemeSettings({ onSettingsChange }: Props) {
  const [s, setS] = useState<SpaceFxSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<Record<string, string>>("engine_rpc", { method: "settings.get_all", params: {} })
      .then(all => {
        const loaded = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS) as (keyof SpaceFxSettings)[]) {
          const v = all[key(k)];
          if (v !== undefined && v !== null && v !== "") {
            if (typeof DEFAULTS[k] === "boolean") (loaded as any)[k] = v === "true";
            else (loaded as any)[k] = Number(v) || DEFAULTS[k];
          }
        }
        setS(loaded);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function update<K extends keyof SpaceFxSettings>(k: K, value: SpaceFxSettings[K]) {
    const next = { ...s, [k]: value };
    setS(next);
    await invoke("engine_rpc", {
      method: "settings.set",
      params: { key: key(k), value: String(value) },
    }).catch(() => {});
    onSettingsChange?.();
    window.dispatchEvent(new Event("nexus-theme-changed"));
  }

  function Slider({ label, k, min, max, step, unit }: {
    label: string; k: keyof SpaceFxSettings; min: number; max: number; step: number; unit?: string;
  }) {
    return (
      <div className="flex items-center justify-between gap-4">
        <label className="w-32 shrink-0 text-xs text-neutral-400">{label}</label>
        <input
          type="range"
          min={min} max={max} step={step}
          value={s[k] as number}
          onChange={e => update(k, Number(e.target.value) as any)}
          className="flex-1 accent-nexus-gold"
        />
        <span className="w-14 text-right text-xs text-nexus-muted font-mono">
          {typeof s[k] === "number" ? (s[k] as number).toFixed(step < 1 ? 2 : 0) : ""}{unit}
        </span>
      </div>
    );
  }

  function Toggle({ label, k, description }: {
    label: string; k: keyof SpaceFxSettings; description?: string;
  }) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <label className="text-xs text-neutral-400">{label}</label>
          {description && <p className="text-[10px] text-neutral-600 mt-0.5">{description}</p>}
        </div>
        <button
          onClick={() => update(k, !(s[k]) as any)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            s[k] ? "bg-nexus-gold" : "bg-nexus-border"
          }`}
        >
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            s[k] ? "left-[18px]" : "left-0.5"
          }`} />
        </button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-nexus-accent border-t-transparent" />
        <span className="text-sm text-neutral-500">Loading theme settings...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stars */}
      <div className="rounded-lg border border-nexus-border bg-nexus-surface/30 p-4 space-y-3">
        <h3 className="text-sm font-medium text-nexus-fg flex items-center gap-2">
          <span className="text-nexus-gold">✦</span> Sparkle Stars
        </h3>
        <Toggle label="Enable Stars" k="starsEnabled" />
        {s.starsEnabled && (
          <>
            <Slider label="Density" k="starDensity" min={50} max={600} step={10} unit=" stars" />
            <Slider label="Brightness" k="starBrightness" min={0.2} max={1.0} step={0.05} />
            <Slider label="Gold Ratio" k="starGoldRatio" min={0} max={50} step={5} unit="%" />
            <Toggle label="Glow Effect" k="glowEnabled" description="Soft glow around larger stars" />
          </>
        )}
      </div>

      {/* Comets */}
      <div className="rounded-lg border border-nexus-border bg-nexus-surface/30 p-4 space-y-3">
        <h3 className="text-sm font-medium text-nexus-fg flex items-center gap-2">
          <span className="text-nexus-gold">☄</span> Comets
        </h3>
        <Toggle label="Enable Comets" k="cometsEnabled" />
        {s.cometsEnabled && (
          <>
            <Slider label="Frequency" k="cometFrequency" min={1} max={15} step={1} unit="s" />
            <Slider label="Speed" k="cometSpeed" min={2} max={20} step={1} />
          </>
        )}
      </div>

      {/* Global */}
      <div className="rounded-lg border border-nexus-border bg-nexus-surface/30 p-4 space-y-3">
        <h3 className="text-sm font-medium text-nexus-fg flex items-center gap-2">
          <span className="text-nexus-gold">◐</span> Global
        </h3>
        <Slider label="Canvas Opacity" k="canvasOpacity" min={0.2} max={1.0} step={0.05} />
      </div>

      {/* Reset */}
      <button
        onClick={() => {
          for (const k of Object.keys(DEFAULTS) as (keyof SpaceFxSettings)[]) {
            update(k, DEFAULTS[k]);
          }
        }}
        className="text-xs text-neutral-600 hover:text-neutral-400 transition"
      >
        Reset to defaults
      </button>
    </div>
  );
}
