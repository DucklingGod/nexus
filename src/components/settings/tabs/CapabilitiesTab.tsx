import { useSettings } from "../SettingsContext";
import { IconGlobe, IconFolder, IconTerminal, IconClipboard, IconBrain, IconWrench } from "../../icons";

const CATEGORY_META: Record<string, { label: string; icon: React.FC<{ size?: number }>; desc: string }> = {
  web: { label: "Web", icon: IconGlobe, desc: "Search the web, fetch URLs" },
  file: { label: "Files", icon: IconFolder, desc: "Read, write, search files" },
  system: { label: "System", icon: IconTerminal, desc: "Terminal, process management" },
  code: { label: "Code", icon: IconTerminal, desc: "Execute Python/Node scripts" },
  utility: { label: "Utility", icon: IconClipboard, desc: "Task management, notes" },
  knowledge: { label: "Knowledge", icon: IconBrain, desc: "Save/search facts about you" },
};

export default function CapabilitiesTab() {
  const { capabilities, handleToggleCapability } = useSettings();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-nexus-muted">Toggle tool categories on/off. Disabled tools won't be available to the agent.</p>
      {capabilities.map(cap => {
        const meta = CATEGORY_META[cap.name] ?? { label: cap.name, icon: IconWrench, desc: "" };
        const Icon = meta.icon;
        return (
          <div key={cap.name} className="flex items-center justify-between rounded-xl border border-nexus-border bg-nexus-surface p-4">
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
  );
}
