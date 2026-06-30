# Nexus — Skills & Cost-Control UI: contracts & future work

> **Status (2026-06-29):** Task 1 (Skills browse tab) and Task 2 (chat transparency chips)
> below are **now implemented** — Settings → **Skills** tab + ✦/↘/↺ chips in chat. This doc
> remains the source of truth for the contracts and the still-open **future work**
> (per-skill disable, custom skills, semantic matching). **Theme:** [`DESIGN.md`](../DESIGN.md)
> (real gold `#c8a24e`, not yellow).

This doc gives exact contracts for the Skills + Cost Control (v0.4) features so any agent can
extend the UI without reverse-engineering the engine.

---

## Conventions you must follow

- **Call the engine:** `invoke("engine_rpc", { method, params })`. Dozens of examples in
  `src/components/settings/Settings.tsx`. (Some dedicated Rust commands also exist:
  `provider_get`, `agent_personality_get`, `secure_*`, etc.)
- **Receive engine notifications:** the engine pushes events as a Tauri `"engine-event"`
  with payload `{ method, params }`. Subscribe with one listener per method and return the
  unlisten in cleanup:
  ```ts
  const un = listen<{ method: string; params: ... }>("engine-event", (e) => {
    if (e.payload.method !== "chat.skills") return;
    // ...update state, keyed on the current streaming message id...
  });
  return () => { un.then(f => f()).catch(() => {}); };
  ```
  Canonical examples: `src/hooks/useChat.ts:108+` (`chat.delta`, `chat.tool_call`,
  `chat.tool_result`, `chat.tool_approval`).
- **Theme tokens:** `nexus-bg / surface / elevated / border / fg / muted`; gold =
  `nexus-gold` (= `nexus-accent`). Utilities `.text-gold-foil`, `.bg-gold-sheen`,
  `.border-gold-faint`. Fonts `--font-sans` (Inter), `--font-display` (Playfair). See `DESIGN.md`.
- **Settings tab pattern:** the `TABS` array + `tab === "..."` blocks in `Settings.tsx`.
  For toggles, copy the **Smart model routing** / **Semantic cache** markup in the Advanced tab.

---

## Task 1 — Skills browse UI (primary)

Engine is ready: **60 built-in skills**, auto-applied per message (the chosen model is
"agent auto-picks" — skills are **not** manually launched, so this UI is for *browsing /
enabling*, not for starting a skill).

**Data contract** — `invoke("engine_rpc", { method: "skills.list", params: {} })` →
```ts
{ skills: Skill[] }
interface Skill { id: string; name: string; category: string; description: string; triggers: string[]; instructions: string; }
```
Categories (8): Writing & Communication · Research & Analysis · Productivity & Planning ·
Coding · Learning & Education · Life & Personal · Business & Marketing · Creative.

**Master setting** — `skills.enabled` = `"true"`/`"false"`. **Default ON** (unset = on; the
engine treats only the literal `"false"` as off). Read via `settings.getAll`, write via
`settings.set` — identical to the router/cache toggles.

**Recommended UX**
- Add a **"Skills" tab to Settings** (add to `TABS` with an icon, e.g. `IconZap`/`IconBook`)
  — lighter and more consistent than a new sidebar surface.
- A master toggle bound to `skills.enabled` ("Auto-apply skills").
- A searchable, **category-grouped grid** of skill cards (name + description; reveal
  `triggers` on hover/expand). Read-only is fine for v1 — these are built-in.
- **Out of scope for now (future):** per-skill enable/disable, user-defined custom skills,
  a semantic-matching toggle. If you add per-skill disable, persist a setting
  `skills.disabled` (JSON `string[]` of ids) **and** teach the engine to honor it in
  `engine/src/skills/skills.ts` (`matchSkills`/`listSkills` currently have no filter).

**Files:** new section/tab in `src/components/settings/Settings.tsx` (mirror the **Knowledge**
tab). No engine change needed for read-only browse + master toggle.

---

## Task 2 — Transparency chips in chat (small, high-signal)

The engine **already emits** these during a chat; nothing consumes them yet:

| Event (`method`) | `params` | Meaning | Suggested chip |
|---|---|---|---|
| `chat.skills` | `{ skills: string[] }` | skills auto-applied this turn | ✨ `{names}` |
| `chat.routed` | `{ model, complexity, from }` | router picked a cheaper model | ↘ `{model}` (tooltip: routed from `{from}`, `{complexity}`) |
| `chat.cached` | `{}` | answer served from the semantic cache | ⚡ cached |

**Wiring (mirror `useChat.ts`):** add three `listen("engine-event", ...)` blocks, each
filtering its method, and attach the info to the **current streaming assistant message**
(key on `streamingId.current`). Extend the message model with an optional
`meta?: { skills?: string[]; routedModel?: string; cached?: boolean }`, then render a small
chip row under the assistant bubble in `ChatConsole.tsx` using `border-gold-faint` /
`text-nexus-muted`. Persisting is optional (ephemeral is fine; or save into the stored
message metadata if you want them after reload).

---

## Task 3 — Already done (don't rebuild)

In **Settings → Advanced**: **Smart model routing** (`router.enabled`) and **Semantic cache**
(`cache.enabled`) toggles already exist and persist. Use their markup as the template for the
skills master toggle.

---

## Acceptance

- `cd nexus && npx tsc --noEmit` clean; `npm run build` clean.
- Verify visually with the **Claude_Preview** MCP (`preview_start` → `preview_screenshot`):
  theme is gold (not yellow) with the right fonts; the Skills tab lists ~60 cards grouped by
  category; the master toggle persists across reload; chips appear when you send "write an
  email" (skills), enable routing + send "hi" (routed), or send the same standalone question
  twice with cache on (cached).
- The exe runs the engine **from source**, so engine features are already live; run
  `npm run tauri build -- --no-bundle` only when you want the new **frontend** inside
  `Nexus.exe` (the UI is embedded at build time).

---

## Pointers

- **Engine skills:** `engine/src/skills/{builtin.ts, skills.ts}` · RPC: `engine/src/ipc/rpc.ts`
  (`skills.list`) · stream wiring + event emits: `engine/src/ipc/stream.ts`
  (`matchSkills`/`injectSkills`, `chat.skills` / `chat.routed` / `chat.cached`).
- **Cost-control engine:** `engine/src/tokens/{router.ts, semanticCache.ts, budget.ts, usage.ts}`.
- **UI examples:** Settings → `src/components/settings/Settings.tsx`; chat events →
  `src/hooks/useChat.ts`; chat render → `src/components/chat/ChatConsole.tsx`.
- **Theme:** `nexus/DESIGN.md`. **Build gotchas:** `nexus/AGENTS.md`. **Progress log:**
  digital-brain wiki `projects/ai-agent-builder/nexus-rebuild.md`.
