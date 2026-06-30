// Per-request agent runtime config (v0.9 / Task 41). streamChat stashes the
// active provider config + model here so background helpers — like the
// `delegate` tool's sub-agent — can run their own LLM/tool loop with the same
// provider, without re-brokering the key.

import type { ProviderConfig } from "../providers/types.ts";

export type ActiveConfig = ProviderConfig & { model: string };

let active: ActiveConfig | null = null;

export function setActiveConfig(config: ActiveConfig | null): void {
  active = config;
}

export function getActiveConfig(): ActiveConfig | null {
  return active;
}
