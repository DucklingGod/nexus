# Implementation Plan: Nexus AI Agent Platform

> Depends on: SPEC.md
> Created: 2026-06-28
> Last updated: 2026-07-02 (v1.0 mostly done — Obsidian + Unified Search + MCP Marketplace done; Notion deferred)
> Repo: github.com/DucklingGod/nexus (canonical standalone repo "Nexus-App"; flattened layout — engine/ src/ src-tauri/ at root)
> Status: In build — v0.1–v0.5, v0.7, v0.8, v0.9 complete; v0.6 deferred; v1.0 mostly done (Notion connector deferred)

---

## Progress vs Plan (as of 2026-06-30)

This document is the **original plan**, kept as the canonical roadmap (the full task
breakdown is unchanged below). Current status against it:

| Milestone | Tasks | Status |
|-----------|-------|--------|
| v0.1 — Wedge | 1-6 | ✅ Complete |
| v0.2 — Real Agent | 7-12 | ✅ Complete |
| v0.3 — Make It Yours | 13-18 | ✅ Complete (projects/workspaces UI still optional) |
| v0.4 — Cost Control | 29-33 | ✅ Complete |
| v0.5 — Reach + Polish | 19-24 | ✅ Complete — governance (21), UI polish (22), error handling (23), about (24), landing+docs (24B), **and Telegram + Discord connectors (19-20)** |
| v0.6 — First Public Release (Beta) | 25-28 | ⏸️ Deferred — to be done once the feature surface settles (packaging/CI) |
| v0.7 — Visual Workflows | 34-37 (+37B/37C) | ✅ Complete — canvas, per-block config, execution engine, templates, Hermes skill import, persistent context files (auto-extract) |
| v0.8 — Observability + Power Tools | 38-40, 42-44 | ✅ Complete — per-reply observability (38), export/import (39), prompt assistant (42), A/B testing (43); Ollama/LM Studio (40) + usage analytics (44) already covered |
| v0.9 — Extensibility + Multi-Agent + Self-Improvement | 41, 45-49 | ✅ Complete — **sub-agent orchestrator (41)** + **plugin system (45-46)** + **skill synthesizer (48)** + **experience collector (47)** + **correction memory + self-evaluation (49)** |
| v1.0 — Complete Platform (Knowledge + MCP) | 50-55 | 🚧 Mostly done — **local file connector (50)** + **MCP client (54)** + **Obsidian (52)** + **unified search (53)** + **MCP marketplace (55)** done; **Notion (51) deferred** (OAuth + paid integration-token flow). **Also added (beyond plan):** full host machine control (file tools accept absolute paths) + SSH remote control + multi-provider hot-swap + factory reset + streamable-HTTP MCP transport + live MCP registry marketplace. |
| v1.1 — Beyond Hermes (Surpass) | 56-63 | 🚧 In progress — **56 (agentskills.io ecosystem absorption) done**, **57 (Slack/Matrix/Email gateways) done**, **58 (vision input) done**, **59 (Mixture-of-Agents) done**, **60 (vLLM/llama.cpp presets) done**, **61 (prompt optimizer) done**; **62 (clean installer) researched — bun single-binary compile ruled out with verified evidence (native `better-sqlite3` binding can't resolve inside a compiled binary), recommended path documented, not yet implemented (needs a clean machine to verify)**; 63 (amplify) remains, each written up as a **detailed implementer handoff** in the "Beyond Hermes" section below (built for another agent, e.g. Sonnet 5, to execute task-by-task). Grounded in the 2026-07 competitive analysis (wiki `nexus-vs-hermes`). |

> **The first public release is `v0.6` (beta), NOT v1.0.** The product isn't feature-complete
> until the full 55-task vision ships — **v1.0 = everything done** (through the knowledge
> connectors + MCP). v0.6–v1.0 sequence the remaining unfinished tasks (25-28, 34-55).

**Pulled forward (originally a later milestone):** the **Skill Synthesizer (Task 48, now in v0.9)**
shipped early — 60 built-in skills + procedural-memory auto-matching + the agent self-creating
skills from finished tasks (opt-in). **Multi-provider web search** (DuckDuckGo free / Tavily /
Brave / SearXNG) was also added.

**Distributable note:** a current double-clickable `Nexus.exe` exists, but it runs the
TS engine from source via the sidecar (needs Node on the machine). A clean-machine
installer — bundling Node + the engine, or compiling the sidecar to a single binary — is
the open packaging task before v1.0.

---

## Beyond Hermes — v1.1 Surpass Plan (detailed implementer handoff)

Grounded in the **2026-07 competitive analysis** (wiki `nexus-vs-hermes`). Hermes's moat is its
**ecosystem** (Nous brand + 750+ community skills on the agentskills.io open standard + 16 gateways),
not its code. Strategy: **absorb the ecosystem via the open standard, close the pure-engineering gaps,
and leapfrog on the axes Hermes structurally can't win (non-technical UX, cost, privacy, visual building).**

> **This section is written to be executed by another agent (e.g. Claude Sonnet 5) task-by-task with
> minimal extra context.** Read "For the implementer" first, then do one task per commit. Tasks 57, 58, 60
> are independent and can be done in any order; 59 depends on the orchestrator; 61 depends on 47/49 (done).

| # | Task | Status |
|---|------|--------|
| 56 | agentskills.io ecosystem absorption (discovery + GUI + auth token + resource bundling) | ✅ done (`8edaa4d` `c8f701a` `abc50af`) |
| 57 | Messaging gateways (Slack, Email, Matrix; WhatsApp/Signal harder) | ✅ done (`9498b2e`) — 5 gateways total (Telegram, Discord, Slack, Matrix, Email) |
| 58 | Vision input (multimodal images) | ✅ done (`9cc1d11`) |
| 59 | MoA (Mixture-of-Agents) | ✅ done (`4f4d3d7`) |
| 60 | Local backend presets (vLLM, llama.cpp) | ✅ done (`5cba9e5`) |
| 61 | DSPy/GEPA-style prompt optimizer | ✅ done (`2af51a9`) |
| 62 | Clean-machine installer (bundle Node / compile sidecar) | ⬜ |
| 63 | Amplify wins (cost dashboard flagship, templates, privacy messaging) | ⬜ |

### For the implementer (read first)

**Repo:** `C:\Users\iHC\Desktop\Nexus-App` (flattened: `engine/` TS sidecar, `src/` React UI, `src-tauri/` Rust shell). Canonical remote `github.com/DucklingGod/nexus` (branch `master`). A Mac clone at `/Users/euromoods/Desktop/Nexus-App` syncs via GitHub — see memory `nexus-cross-machine-sync`.

**Architecture:** React WebView ⇄ Rust (Tauri commands, keychain broker) ⇄ TS engine sidecar over newline-delimited JSON-RPC 2.0 on stdio. UI calls either a dedicated Rust command (`invoke("chat_send", …)`) or the generic passthrough (`invoke("engine_rpc", { method, params })` → engine `rpc.ts` case dispatch). Chat streams via the `chat.send` path in `engine/src/ipc/stream.ts`.

**Key-file map:**
- Connectors: `engine/src/connectors/{manager.ts, telegram.ts, discord.ts, session.ts, agent.ts}`
- Providers/LLM: `engine/src/providers/{client.ts (chat + chatStream + adapters), types.ts (ChatMessage, ProviderConfig, PROVIDER_PRESETS), embed.ts}`
- Tools: `engine/src/tools/*.ts` registered via `registry.ts`; agent tools get schemas from `listToolsForLLM()`; run via `executeTool()`
- Sub-agents: `engine/src/orchestrator/subagent.ts` (`runSubAgent`, `TOOLSET_PRESETS`), `engine/src/tools/delegate.ts`
- Self-improvement: `engine/src/selfImprove/{experience.ts, correction.ts, evaluate.ts}`
- RPC dispatch: `engine/src/ipc/rpc.ts`; chat loop: `engine/src/ipc/stream.ts`
- Rust: `src-tauri/src/commands/mod.rs` (Tauri commands + keychain brokering), `src-tauri/src/lib.rs` (register new commands in `invoke_handler![…]`), `src-tauri/src/secure.rs` (keychain: `secure_set/has/delete`, internal `get_key`)
- Frontend: `src/components/settings/Settings.tsx` (keys + connectors + web tools), `src/components/chat/ChatConsole.tsx` (chat input), `src/components/mcp/MarketplaceView.tsx`, `src/components/onboarding/ProviderPicker.tsx`; secret helper `src/lib/secure.ts` (`secureSet/secureHas/secureDelete`).

**Secret handling (NON-NEGOTIABLE):** every credential lives in the OS keychain as `api_key_<name>`, saved from the UI via `secureSet("api_key_<name>", value)`, and is **brokered by Rust** (`secure::get_key` in `mod.rs`) into engine params — it must **never** appear in the settings DB, logs, exports, or be readable by the WebView (there is no `secureGet`). Pattern to copy: the GitHub token (Task 56) — `mod.rs` `chat_send` + `engine_rpc` read `api_key_github` and inject it; `engine/src/skills/import.ts` has `setGithubToken` (chat path) + a token arg (RPC path).

**Safety (NON-NEGOTIABLE):** remote/connector messages may use **safe tools only** — see `connectors/agent.ts` `safeTools()` (excludes dangerous tools + all delegation). Dangerous tools (`terminal`, `code`, `file_write`, `patch`, `process`) always require the approval gate. Sub-agents must never delegate again.

**Build & verify (Windows; `cargo` is NOT on PATH by default):**
- Engine tests: `cd engine && npx vitest run` — keep all green; add tests for new logic (mock `fetch` via `vi.stubGlobal`, see `engine/src/skills/import.test.ts`).
- Engine types: `cd engine && npx tsc --noEmit` — **ignore only the pre-existing `browser.ts` / `puppeteer-core` errors**; everything else must be 0.
- Frontend: `npm run build` (runs `tsc && vite build`) from repo root.
- Rust: `cd src-tauri && export PATH="$HOME/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin:$PATH" && cargo check`.
- Full app (needed only for frontend/Rust changes): from repo root `export PATH="$HOME/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin:$PATH" && npm run tauri build`, then `cp src-tauri/target/release/Nexus.exe ./Nexus.exe` (stage as `Nexus-new.exe` if the app is running). **Engine-only changes need no rebuild** — they're live on app restart (sidecar runs from source).

**Per-task workflow:** implement → verify (tests + tsc + build as applicable) → `git add <specific files>` (never the `Nexus.exe` artifact) → `git commit -m "feat: … (Task NN)"` ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` → `git push origin master` → update the wiki (`C:\Users\iHC\digital-brain\projects\ai-agent-builder\nexus-rebuild.md` v1.1 table + `nexus-vs-hermes.md` checklist) and push the `obsidian_wiki` repo.

---

### Task 56 — agentskills.io ecosystem absorption ✅ DONE
Discovery (`searchSkillRepos` + `search_skills` tool + `skills.search` RPC → GitHub `agent-skills` topic), GUI browse/install tab in `MarketplaceView.tsx`, keychain-brokered GitHub token in both paths (`engine_rpc` + `chat_send`), and `scripts/`/`references/`/`assets/` bundling to `~/.nexus/skills/<name>/`. Reference implementation for keychain-token brokering + GitHub API use.

### Task 57 — Messaging gateways ✅ DONE (`9498b2e`)
Added Slack (Socket Mode, raw WebSocket), Matrix (`/sync` long-poll, plain HTTPS), and Email (imapflow + nodemailer + mailparser) — 5 gateways total. Credentials for the three new platforms are a JSON blob in one keychain entry (`api_key_slack`/`matrix`/`email`) since each needs more than one field; `connector_start` in Rust already brokers generically, so no Rust changes were needed. `session.ts`'s conv-id prefix is now a lookup map, not a telegram/discord ternary. WhatsApp/Signal deferred (no desktop-friendly Live-mode path). 80 engine tests pass.

**Goal:** raise gateways from 2 (Telegram, Discord) toward Hermes's 16. Add **Email (IMAP/SMTP)**, **Slack (Socket Mode)**, **Matrix** — all work in desktop "Live mode" (no public URL). *WhatsApp and Signal are deliberately deferred: neither has a desktop-friendly official path (WhatsApp Cloud API needs a public webhook; Signal needs the external `signal-cli` process) — note this, don't fake it.*

**Recipe to add a platform `X` (mirror `telegram.ts`):**
1. Create `engine/src/connectors/X.ts` exporting `startX(token, config, log): () => void` that connects, listens for inbound messages, and for each calls `handleConnectorMessage("X", chatKey, title, text, config)` then sends the returned reply. Show a "typing"/presence indicator while working if the platform supports it. Return a stop function.
2. Register in `engine/src/connectors/manager.ts`: import `startX`, add `else if (platform === "X") entry.stop = startX(...)` in `startConnector`, and add `"X"` to the array in `connectorStatus()`.
3. **Generalize `session.ts`:** it currently hardcodes the conv-id prefix `platform === "telegram" ? "tg" : "dc"` and types `platform` as `"telegram" | "discord"`. Change to a `string` platform with a prefix map (`{ telegram:"tg", discord:"dc", slack:"sk", email:"em", matrix:"mx" }`) so new platforms persist as conversations correctly. Also widen the `platform` type in `agent.ts`/`session.ts`.
4. **Rust needs no change** — `connector_start` already brokers `api_key_<platform>` generically. Just save the token from the UI as `api_key_X`.
5. **Settings UI** (`Settings.tsx` connectors section, near Telegram/Discord): add a token/credentials field saving `api_key_X` via `secureSet`, plus Start/Stop wired to `invoke("connector_start"/"connector_stop", { platform:"X", … })` and status from `connector_status`.

**Per-platform notes:**
- **Email**: poll IMAP for unseen messages, reply via SMTP (add deps `imapflow` + `nodemailer` to `engine/package.json`). Config needs host/port/user/app-password — store as a JSON blob in one keychain entry `api_key_email` (or a small structured secret). Poll loop like Telegram's; `chatKey` = sender address; reply as a threaded email.
- **Slack**: use **Socket Mode** (app-level token `xapp-…` + bot token `xoxb-…`, both via `apps.connections.open` → WebSocket) so no public URL is needed. Add `@slack/socket-mode` + `@slack/web-api` or hit the WS directly. Handle `message` events, post replies with `chat.postMessage`.
- **Matrix**: `matrix-js-sdk` sync loop (homeserver URL + access token). Desktop-friendly. `chatKey` = room id.

**Gotchas:** keep replies under each platform's length cap (Telegram 4096, Slack 40k, Discord 2000 — Discord already handles this). Never expose tokens to the WebView. Connector agent already uses safe tools only — don't change that.

**Verify:** engine `tsc` + tests; manual: save a token, Start, message the bot, confirm a reply + the conversation appears in the left panel grouped by source. **Done when** at least Email + Slack connect, reply, and persist as conversations.

### Task 58 — Vision input (multimodal images) ✅ DONE (`9cc1d11`)
Implemented narrower than originally sketched below, for a deliberate YAGNI reason: rather than widening `ChatMessage.content` to `string | ContentPart[]` (which would have forced changes across ~15 call sites in skills/orchestrator/budget/memory that only ever handle plain text), `content` stays a plain string and a new optional `images?: ImagePart[]` sibling field carries attachments — every existing text-only consumer needed zero changes. `client.ts` gained `toOpenAIMessage`/`toAnthropicMessage`/`toGoogleParts` mapping a message's images into each API's multipart format (only when present); a new `tools/attachments.ts` (`readImageBase64`, pure Node `fs`, no new Rust/Tauri fs-plugin dep — confirmed `chat_send`'s `messages: Vec<Value>` already passes through opaque JSON) backs a `image.readBase64` RPC; the UI got an attach-image button, pending-attachment thumbnails, and sent-message thumbnails (session-only, not persisted to SQLite). 85 engine tests pass (12 new).

**Original spec (superseded by the leaner design above — kept for context):**
**Goal:** let users attach images to a chat message; send them to vision-capable models.
**Files:** `engine/src/providers/types.ts` (`ChatMessage.content`), `engine/src/providers/client.ts` (request building — OpenAI path around the `messages` map + `content: msg?.content ?? ""`; Anthropic path `nonSystem.map(m => ({ role, content: m.content }))`), `src/components/chat/ChatConsole.tsx` (attach button), `chat_send` in `mod.rs` (no key change; images ride in `messages`).
**Steps:**
1. Widen `ChatMessage.content` to `string | ContentPart[]` where `ContentPart = { type:"text", text } | { type:"image", data /*base64*/, mediaType }` (Nexus-internal shape).
2. In `client.ts`, when a message's content is an array, emit provider-specific formats:
   - OpenAI-compatible: `content:[{type:"text",text}, {type:"image_url", image_url:{ url:"data:<mediaType>;base64,<data>" }}]`.
   - Anthropic: `content:[{type:"text",text}, {type:"image", source:{ type:"base64", media_type:mediaType, data }}]`.
   - Keep the string path unchanged for text-only (back-compat).
3. UI: add an attach-image button in `ChatConsole.tsx` input (wire the existing "+" import placeholder), read the file as base64, attach as an image part; render a thumbnail in the sent message.
**Gotchas:** cap image size/count; only send images when the selected model supports vision (gate on a capability flag like Task 56's `supportsTools`, or just try and surface provider errors). **Done when** an image + question returns a grounded answer on a vision model (e.g. gpt-4o / claude).

### Task 59 — MoA (Mixture-of-Agents) ✅ DONE (`4f4d3d7`)
Implemented as spec'd: `orchestrator/moa.ts` (`runMoA`) fans a query out to ≤5 deduped models via plain `chat()` calls (no tools — MoA's value is diverse model perspectives, not independent tool work), then one aggregator call (defaults to `models[0]`) synthesizes them. Per-model failures are captured as candidate errors rather than aborting the run; a single surviving candidate short-circuits the aggregator call. Exposed as the `mixture_of_agents` tool (`tools/moa.ts`) and added to the existing "no recursive delegation" exclusion lists in `subagent.ts` + `connectors/agent.ts` (also fixed a pre-existing gap there — `delegate_task` wasn't excluded in `subagent.ts`'s list). No UI/RPC wrapper yet (no consumer planned) — agent-tool only. 93 engine tests pass (8 new).

**Original spec (for context):**
**Goal:** fan the same query out to N models/agents, then synthesize one answer (Hermes "MoA").
**Base:** `engine/src/orchestrator/subagent.ts` (`runSubAgent`) + `engine/src/tools/delegate.ts` (`delegate_batch` already runs ≤5 sub-agents in parallel).
**Steps:** add `moa(query, models[], aggregatorModel, options)` in the orchestrator that runs the query across each model in parallel (reuse `runSubAgent`/`chat`), collects the candidate answers, then makes a final "aggregator" LLM call that critiques + synthesizes them into one response. Expose as a new tool `mixture_of_agents` in `delegate.ts` (non-dangerous; disallowed for sub-agents, like delegation) and/or an `moa.run` RPC for a future UI button.
**Gotchas:** bound N (≤5) and total tokens; track usage; the aggregator prompt should ask for a synthesis, not a vote-only. **Done when** `mixture_of_agents` returns a synthesized answer with per-model candidates available.

### Task 60 — Local backend presets (vLLM, llama.cpp) ✅ DONE (`5cba9e5`)
Added both to the frontend's `src/lib/providers.ts` (the actual single source of truth for the UI — not engine's `PROVIDER_PRESETS`, which is unused/dead). vLLM `:8000`, llama.cpp `:8080` (verified against each project's docs). Zero other changes needed: `key_for_local_aware` (Rust) already skips key brokering for any localhost baseUrl, `listModels()`'s generic OpenAI-compat fallback already works, and every UI surface reads `PROVIDERS`/`LOCAL_PROVIDERS` generically (confirmed no hardcoded per-id branching elsewhere).

**Original spec (for context):**
**Goal:** first-class presets for the remaining local backends (Ollama + LM Studio already covered).
**Files:** `engine/src/providers/types.ts` `PROVIDER_PRESETS` (Ollama is `http://localhost:11434/v1`). These are OpenAI-compatible → **no adapter needed**, just presets + they'll flow through the existing OpenAI-compat path.
**Steps:** add `{ id:"vllm", name:"vLLM (local)", baseUrl:"http://localhost:8000/v1", defaultModel:"" }` and `{ id:"llamacpp", name:"llama.cpp (local)", baseUrl:"http://localhost:8080/v1", defaultModel:"" }` (confirm default ports); ensure `ProviderPicker.tsx` renders them (it reads the presets). Local providers get no keychain key (`key_for_local_aware` already returns "" for localhost). **Done when** both appear in onboarding + provider switch and can list models / chat against a running local server.

### Task 61 — DSPy/GEPA-style prompt optimizer ✅ DONE (`2af51a9`)
Implemented as spec'd (LLM-judge branch, not full re-execution A/B — an explicitly acceptable MVP per the spec below): `selfImprove/optimize.ts`'s `runOptimization` collects thumbs-down/failed experiences (skips below 3 — not enough real signal), proposes 2-3 candidate replacements for the personality's `instructions` field, judges every candidate plus the current text as a baseline, and stores the best one as an unapplied proposal only if it beats the baseline. New `prompt_versions` table gives version history + revert (re-apply an old version). New Rust `optimize_prompt` command brokers the key (mirrors `complete_once`); Settings → Learning tab got an "Optimize instructions" button + a proposal card with judge scores, before/after diff, and explicit Accept/Reject — never auto-applied. 99 engine tests pass (6 new), cargo check clean.

**Original spec (for context):**
**Goal:** close the self-evolution gap — improve the agent's system prompt / a skill's instructions from logged experience.
**Base:** `engine/src/selfImprove/{experience.ts (logExperience), evaluate.ts (evaluateSession), correction.ts}`; A/B testing already exists (`complete_once`).
**MVP (GEPA = reflective mutation + Pareto selection, kept lean):** collect low-scoring experiences for a target prompt, make an LLM "reflect on these failures and propose an improved instruction" call to generate 2-3 candidate prompts, A/B them against recent tasks (or an LLM judge), keep the winner as a new prompt version (store versions + let the user revert). Expose via an "Optimize" action in the relevant Settings/agent screen.
**Gotchas:** never auto-apply silently — show the diff + require opt-in; keep a version history. **Done when** the optimizer produces a measurably-preferred prompt variant the user can accept/reject.

### Task 62 — Clean-machine installer (the real shippability gap) 🔬 RESEARCHED, NOT IMPLEMENTED
**Goal:** the app must run without a dev Node install (today the sidecar runs from source via Node, spawned by `sidecar.rs`'s `find_node()` which searches the system for an installed `node`). Also the deferred v0.6 packaging task.

**Verified finding (this session) — `bun build --compile` does NOT work, and shouldn't be retried:** tried compiling `engine/src/main.ts` to a single exe via `bun build --compile`. It bundles and produces a binary, but **crashes on startup** — `better-sqlite3`'s native-binding loader (`bindings` package) walks up from the binary's *virtual* bundle path (`B:/~BUN/root/nexus-engine.exe`) looking for a real `package.json`/`node_modules` to locate its prebuilt `.node` file, and fails: `Could not find module root given file: "B:/~BUN/root/nexus-engine.exe"`. Tried a second variant — `--external better-sqlite3` (keep it a real dependency, ship `node_modules/better-sqlite3` next to the exe) — same class of failure: `Cannot find package 'better-sqlite3' from 'B:/~BUN/root/nexus-engine2.exe'`. Bun's compiled-binary module resolution doesn't map back to real filesystem paths on disk at all, in either mode. **Conclusion: any single-file-executable compile approach (bun, likely also Node SEA / deno compile, which have the same class of native-addon issue) needs deep, unverified extra work to solve — do not retry this path without first solving native-addon resolution, e.g. by testing whether the target tool has a documented sqlite-native workaround.**

**Recommended path instead — bundle a portable Node + the engine as real files (my plan's other original option), not single-file compilation:**
1. Bundle a portable Node runtime (e.g. an official Node binary for each target OS) as a Tauri `externalBin` resource.
2. Ship the engine as real files (`engine/src` + its `node_modules`, including `better-sqlite3`'s prebuilt native binaries) via `tauri.conf.json`'s `bundle.resources` — NOT compiled to one file, so native addons keep their normal directory-relative resolution (this fixes the exact problem hit above, since nothing needs virtual-path resolution).
3. Update `sidecar.rs`: `find_node()` needs a new first-priority branch that checks a resource path relative to the *installed app's* directory (Tauri exposes this via its resource resolver API) before falling back to a system-installed Node; the `engine` path (currently `CARGO_MANIFEST_DIR`-baked, dev-only) needs the same production-vs-dev branch.
4. Then code-signing/notarization (macOS) + Windows signing for a clean install.

**Why this wasn't implemented in this session:** wiring `tauri.conf.json` resources + `sidecar.rs`'s path resolution is a real, multi-file change to the packaging pipeline, and the entire point of Task 62 — "does it truly run standalone with zero Node install" — can only be genuinely verified on a clean machine (or fresh VM) with no dev Node install, which isn't available here. Landing an unverified change to the app's core launch path risked leaving it broken with no way to confirm or fix it in-session. The bounded research above is real, reproducible evidence that de-risks whoever picks this up next — it rules out one whole approach with actual error messages instead of guesswork.

**Done when:** a fresh machine (no Node) installs from the `.msi`/`.dmg` and runs — still open.

### Task 63 — Amplify the wins (protect the axes we already lead)
**Goal:** make Nexus's structural advantages obvious. **Cost dashboard as flagship** (surface the existing usage analytics prominently, add savings-from-cache/routing figures), **non-technical templates** (ship agent + workflow presets for common jobs), **privacy/local-first messaging** (onboarding + landing copy: "your keys/data never leave your machine"). Mostly UI/UX + copy; no new engine surface. **Done when** cost savings and privacy are front-and-center in the UI.

> **Honest framing:** capability parity-plus is a bounded roadmap (57-63 are mostly well-scoped engineering),
> but *ecosystem/community* is earned over quarters, not out-coded. Winning position = **decisively better on
> UX+cost+privacy+visual, at parity on capability, standards-compatible so their ecosystem feeds us.**

---

## Overview

Build Nexus from scratch as a Tauri 2.x desktop app with a React UI and a TypeScript agent engine that runs as a Node/Bun sidecar. The project replaces the existing AI Agent Builder (Next.js RAG chatbot) — but **ports** its TypeScript RAG, document-extraction, embeddings, and LINE-connector code rather than rewriting it.

**Strategy:** Vertical slicing — build one complete feature path at a time, each leaving the app in a working state.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | **Tauri 2.x** | 10MB vs Electron's 200MB, Rust security, native perf |
| Frontend | **React 18 + TypeScript + Tailwind** | Matches user's existing UI preferences (dark #0a0a0a, green #4ade80) |
| Agent engine | **TypeScript sidecar (Node/Bun)** | One language with the UI, mature AI SDKs, reuses existing TS code; talks to Rust via JSON-RPC over stdio |
| Database | **SQLite (via `better-sqlite3` in the sidecar)** | Zero-config, portable, single-user; same driver the current app already uses |
| Vector store | **`sqlite-vec` (same SQLite file)** | No second store, native-speed search, transactional; LanceDB optional later |
| Embeddings | **Provider API (BYO-key)** | Nothing to bundle; local embeddings (transformers.js) optional for offline |
| API key storage | **OS Keychain (Tauri keychain plugin)** | Never plaintext in config |
| Packaging | **Tauri bundler** | Native .msi/.deb/.dmg |

---

## Release Milestones (Realistic Scope)

The 55 tasks are a **multi-month roadmap, not a one-month sprint.** The original "~30-38 days" figure treated L-scoped tasks (visual workflow builder, plugin system, multi-agent, MCP, knowledge connectors, self-improvement) as if each were a day's work — each is realistically days to weeks. The fix is not to cut the vision but to **sequence it into releases and ship the smallest real product first.**

**Guiding rule:** every milestone is independently usable and shippable. Ship the **v0.6 public beta** and get real users before investing in v0.7→v1.0; **v1.0 is the finished 55-task platform, not the first release.**

### v0.1 — The Wedge *(Tasks 1-6)*
The smallest thing that proves the thesis: a non-technical user goes from download to a working, streaming local agent in under 2 minutes. 3-click onboarding (1-2 providers) → streaming chat → conversations saved → settings. No tools yet, no vector memory yet. **This is the hardest milestone** — it is the entire integration spine (Tauri + TS sidecar + keychain + streaming IPC). Ship it, demo it, get feedback.

### v0.2 — A Real Agent *(Tasks 7-12)*
Now it *acts*: sandboxed tools (web, file, terminal, code-exec per SPEC §15), tool-approval UI, episodic + semantic memory (sqlite-vec), provider fallback / self-healing, token tracking. This is what separates Nexus from a chat window.

### v0.3 — Make It Yours *(Tasks 13-18)*
The SME persona's payoff: agent builder (personality, capabilities), document upload + RAG (**ports the existing TS pipeline**), conversation history, full settings page, quick actions.

### v0.4 — Cost Control *(Tasks 29-33)*
Prompt cache, semantic cache, smart routing, compression, token dashboard. Slot before or after v0.3 depending on how much real usage is hurting on cost.

### v0.5 — Reach + Polish *(Tasks 19-24)*
Telegram (Live mode first, per SPEC §4.7), governance / audit dashboard, dark-theme polish, comprehensive error handling, branding, **landing page + docs (GitHub Pages / Vercel)**.

### v0.6 — First Public Release (Beta) *(Tasks 25-28)*
Integration tests, docs, **signed** cross-platform installers (signing / notarization is its own task), and a GitHub release. This is the first build you put in front of strangers — shipped as a **public beta**, *not* a finished 1.0. Also needs the **clean-machine installer** (bundle Node + the engine, or compile the sidecar to a single binary) so it runs without a dev environment.

### v0.7 — Visual Workflows + Hermes Skill Import + Context Files *(Tasks 34-37 + extras)*
The no-code automation payoff: drag-and-drop workflow **canvas (34)**, **block types (35)**, **execution engine (36)**, and a **template library (37)** so non-technical users assemble agents visually. **Plus:** Hermes skill import — SKILL.md parser → Nexus custom skills, auto-scan `~/AppData/Local/hermes/skills/`, support linked files (references/templates/scripts). ทำให้ Nexus เข้าถึง **1000+ Hermes skills** ได้ทันที. **Plus:** Persistent context files (`user.md`, `memory.md`, `soul.md`, `context.md`) — transparent, user-editable `.md` layer ครอบ SQLite semantic memory เดิม → ได้ทั้ง Hermes-style transparency + Nexus vector search scale.

### v0.8 — Observability + Power Tools *(Tasks 38-40, 42-44)*
**Observability dashboard (38)**, **export/import agent configs (39)**, **offline mode via Ollama (40)**, **prompt-engineering assistant (42)**, **A/B testing (43)**, **usage analytics (44)**. Power-user reach without new core architecture.

### v0.9 — Extensibility + Multi-Agent + Self-Improvement *(Tasks 41, 45-49)*
**Multi-agent visual workflows (41)**, **plugin system + marketplace (45-46)**, and the self-improvement loop: **experience collector (47)**, **pattern detector + skill synthesizer (48 — already started)**, **correction memory + self-evaluation (49)**.

### v1.0 — Complete Platform: Knowledge + MCP *(Tasks 50-55)*
The full vision shipped: knowledge connectors — **local files (50)**, **Notion (51)**, **Obsidian (52)**, **unified search (53)** — plus the **MCP client (54)** and **MCP marketplace (55)**. With all 55 tasks done, **this** is v1.0.

> Each of these later milestones is a multi-task mini-project. Sequence by what users actually ask for, but the destination is the same: **v1.0 is the finished platform, not the first release.**

---

## Phase 1: Foundation (Tasks 1-6)

> Goal: Empty app shell that launches, shows UI, and can talk to an LLM.

### Task 1: Project Scaffolding
- **Description:** Initialize Tauri 2.x project with React + TypeScript + Tailwind. Set up folder structure per SPEC.md.
- **Acceptance:**
  - `npm run tauri dev` launches a window with "Nexus" title
  - Tailwind works (dark theme applied)
  - Folder structure matches SPEC.md Section 6
- **Verify:** App launches, shows blank dark window with Nexus branding
- **Files:** `package.json`, `tauri.conf.json`, `src-tauri/Cargo.toml`, `src/App.tsx`, `tailwind.config.js`
- **Scope:** M (5-8 files)
- **Dependencies:** None

### Task 2: Rust Core — IPC Router + Sidecar Manager
- **Description:** Set up Tauri commands for IPC. Create the sidecar manager that starts/stops the TypeScript agent engine (Node/Bun) and exchanges JSON-RPC over stdio.
- **Acceptance:**
  - Rust can spawn the TS engine process
  - Rust can send JSON-RPC messages to the engine and receive responses
  - Engine prints "Nexus Engine Ready" on startup
- **Verify:** `cargo test` passes, dev mode shows "Engine connected" in console
- **Files:** `src-tauri/src/commands/mod.rs`, `src-tauri/src/sidecar.rs`, `engine/src/main.ts`
- **Scope:** M
- **Dependencies:** Task 1

### Task 3: Settings Storage + API Key Encryption
- **Description:** Implement settings persistence (SQLite) and API key encryption via OS keychain.
- **Acceptance:**
  - Settings saved to SQLite on change
  - API keys encrypted in OS keychain (not in any file)
  - Settings loaded on app startup
- **Verify:** Add API key → restart app → key still there → check no plaintext in files
- **Files:** `src-tauri/src/db/`, `src-tauri/src/crypto.rs`, `src/hooks/useConfig.ts`
- **Scope:** M
- **Dependencies:** Task 2

### Task 4: Onboarding Wizard UI
- **Description:** Build the 3-step onboarding flow: Provider Picker → API Key Input → Agent Setup.
- **Acceptance:**
  - Step 1: Grid of providers (OpenAI, Anthropic, Google, OpenRouter, Ollama)
  - Step 2: Secure input field + "Test Connection" button
  - Step 3: Agent name + personality selector
  - "Test Connection" actually validates the API key
  - On completion → navigate to Chat Console
- **Verify:** Full flow works end-to-end, API key stored encrypted
- **Files:** `src/components/onboarding/` (4 files), `src-tauri/src/commands/config.rs`
- **Scope:** L (8+ files, but UI-heavy)
- **Dependencies:** Task 3

### Task 5: TypeScript Agent Engine — Provider Router
- **Description:** Build the model router that handles multiple providers (OpenAI, Anthropic, Google, OpenRouter). Supports streaming responses.
- **Acceptance:**
  - Can connect to OpenAI, Anthropic, Google, OpenRouter with API key
  - Streaming responses work (token-by-token)
  - Model selection via config
  - Provider fallback chain (primary → secondary → tertiary)
- **Verify:** Send "Hello" → get streaming response from each provider
- **Files:** `engine/src/router/` (3 files)
- **Scope:** M
- **Dependencies:** Task 2

### Task 6: Chat Console UI
- **Description:** Build the main chat interface with streaming message display.
- **Acceptance:**
  - Messages display with markdown rendering (code blocks, bold, etc.)
  - Streaming responses render token-by-token with cursor
  - Input field with send button
  - Scroll to bottom on new message
  - System status bar (model name, token count)
- **Verify:** Type message → see streaming response → markdown renders correctly
- **Files:** `src/components/chat/` (4 files), `src/hooks/useChat.ts`
- **Scope:** M
- **Dependencies:** Task 4, Task 5

### ✅ Checkpoint 1: Foundation
- [ ] App launches with dark theme
- [ ] Onboarding wizard works (3-click setup)
- [ ] Chat console shows streaming responses
- [ ] API keys encrypted in OS keychain
- [ ] Provider fallback chain works

---

## Phase 2: Core Agent Capabilities (Tasks 7-12)

> Goal: Agent can use tools, remember things, and handle errors gracefully.

### Task 7: Tool Registry + Sandbox
- **Description:** Build the tool registration system with sandboxed execution. Implement web search, file ops, and terminal tools.
- **Acceptance:**
  - Tools registered with metadata (name, description, parameters)
  - Each tool runs in isolated subprocess
  - Destructive tools require approval (via IPC → UI confirmation)
  - Tool execution logged with timing
- **Verify:** Agent can search web, read file, run command — all sandboxed
- **Files:** `engine/src/tools/` (5 files)
- **Scope:** L
- **Dependencies:** Task 6

### Task 8: Tool Execution UI
- **Description:** Show tool executions in the chat console (what tool ran, result, timing).
- **Acceptance:**
  - Tool calls shown as collapsible cards in chat
  - Shows tool name, arguments, result, execution time
  - Destructive tool approval modal in UI
  - Success/failure indicators
- **Verify:** See tool executions in chat when agent uses tools
- **Files:** `src/components/chat/ToolExecution.tsx`, `src/hooks/useToolApproval.ts`
- **Scope:** S
- **Dependencies:** Task 7

### Task 9: Memory System — Episodic
- **Description:** Implement conversation history storage with sqlite-vec vector search.
- **Acceptance:**
  - All conversations stored in SQLite + sqlite-vec
  - Semantic search across past conversations
  - Auto-retrieval of relevant context before LLM calls
  - Conversation summary generation for old chats
- **Verify:** Start new session → ask about something from old session → agent finds it
- **Files:** `engine/src/context/` (3 files)
- **Scope:** M
- **Dependencies:** Task 5

### Task 10: Memory System — Semantic
- **Description:** Auto-extract and store user preferences and facts.
- **Acceptance:**
  - Agent automatically extracts facts from conversations
  - Facts stored with timestamps and confidence
  - Facts injected into context when relevant
  - User can view/edit/delete stored facts in UI
- **Verify:** Tell agent "I prefer Thai language" → new session → agent responds in Thai
- **Files:** `engine/src/context/semantic.ts`, `src/components/settings/MemoryViewer.tsx`
- **Scope:** M
- **Dependencies:** Task 9

### Task 11: Self-Healing Engine
- **Description:** Implement auto-retry, provider fallback, and error recovery.
- **Acceptance:**
  - On provider error → auto-switch to next provider
  - On rate limit → exponential backoff + retry
  - On tool crash → restart subprocess + retry once
  - On context overflow → auto-compress old messages
  - All recovery actions logged
- **Verify:** Kill primary provider mid-conversation → agent continues with fallback
- **Files:** `engine/src/healing/` (2 files)
- **Scope:** M
- **Dependencies:** Task 5, Task 7

### Task 12: Token Budget System
- **Description:** Track token usage per turn, show real-time costs, warn before limits.
- **Acceptance:**
  - Real-time token counter in status bar
  - Cost estimation per message (based on model pricing)
  - Daily/weekly/monthly usage tracking
  - Warning when approaching context limit
  - Auto-compress when budget exceeded
- **Verify:** Send 50 messages → see accurate token count + cost estimate
- **Files:** `engine/src/context/tokenBudget.ts`, `src/components/StatusBar.tsx`
- **Scope:** S
- **Dependencies:** Task 6

### ✅ Checkpoint 2: Core Capabilities
- [ ] Agent uses tools (web, file, terminal) with approval UI
- [ ] Memory persists across sessions (episodic + semantic)
- [ ] Self-healing works (provider fallback, auto-retry)
- [ ] Token budget tracked and displayed
- [ ] All tool executions visible in chat

---

## Phase 3: Agent Builder + Knowledge (Tasks 13-18)

> Goal: Users can customize agents, upload documents, and connect platforms.

### Task 13: Agent Builder — Personality
- **Description:** Visual agent customization (name, role, tone, custom instructions).
- **Acceptance:**
  - UI form for all personality settings
  - Changes applied in real-time to agent behavior
  - Settings persisted to database
- **Verify:** Change agent name/tone → new chat reflects changes
- **Files:** `src/components/agent-builder/PersonalityConfig.tsx`
- **Scope:** S
- **Dependencies:** Task 6

### Task 14: Agent Builder — Capabilities Toggle
- **Description:** Enable/disable agent capabilities through UI.
- **Acceptance:**
  - Toggle switches for each capability (web, file, terminal, memory, etc.)
  - Disabled capabilities hidden from agent's tool list
  - Changes take effect on next message
- **Verify:** Disable "Web Search" → agent no longer attempts web searches
- **Files:** `src/components/agent-builder/CapabilitiesToggle.tsx`
- **Scope:** S
- **Dependencies:** Task 7

### Task 15: Document Upload + RAG
- **Description:** Upload documents, extract text, chunk, embed, and search.
- **Acceptance:**
  - Drag-and-drop upload zone
  - Supports PDF, DOCX, XLSX, TXT, MD
  - Text extraction + chunking (~500 chars)
  - Embedding via provider's embedding model
  - Vector search across uploaded docs
  - Agent uses relevant chunks in responses
- **Verify:** Upload PDF → ask question about its content → agent answers from document
- **Files:** `engine/src/knowledge/` (3 files), `src/components/agent-builder/KnowledgeBase.tsx`
- **Scope:** L
- **Dependencies:** Task 9, Task 14

### Task 16: Conversation History Sidebar
- **Description:** Browse, search, and resume past conversations.
- **Acceptance:**
  - Sidebar shows list of past conversations
  - Search across all conversations
  - Click to resume any conversation
  - Delete conversations
- **Verify:** Have 5+ conversations → search finds correct one → click resumes it
- **Files:** `src/components/chat/ConversationSidebar.tsx`
- **Scope:** M
- **Dependencies:** Task 9

### Task 17: Settings Page
- **Description:** Full settings page (providers, security, advanced).
- **Acceptance:**
  - Provider management (add/remove/test keys)
  - Security settings (approval mode, audit log viewer)
  - Advanced settings (model params, context length)
  - All changes persisted and applied
- **Verify:** Add new provider key → test it → use it in chat
- **Files:** `src/components/settings/` (4 files)
- **Scope:** M
- **Dependencies:** Task 3

### Task 18: Quick Actions Bar
- **Description:** Pre-configured action buttons for common tasks.
- **Acceptance:**
  - Buttons: Browse, Code, Files, Search, Analyze
  - Each button inserts a pre-defined prompt
  - Customizable in settings
- **Verify:** Click "Search" → agent performs web search
- **Files:** `src/components/chat/QuickActions.tsx`
- **Scope:** S
- **Dependencies:** Task 6

### ✅ Checkpoint 3: Agent Builder
- [ ] Agent personality customizable via UI
- [ ] Capabilities toggled on/off
- [ ] Document upload + RAG works
- [ ] Conversation history browsable
- [ ] Settings page complete

---

## Phase 4: Platform Connectors + Polish (Tasks 19-24)

> Goal: Connect to messaging platforms, polish UI, prepare for release.

### Task 19: Platform Connector — Telegram
- **Description:** One-click Telegram bot setup with guided wizard.
- **Acceptance:**
  - Guided setup (copy token from BotFather → paste → test)
  - Agent responds to Telegram messages
  - Message history synced
  - Disconnect/reconnect supported
- **Verify:** Create Telegram bot → connect → send message → get response
- **Files:** `engine/src/platforms/telegram.ts`, `src/components/agent-builder/PlatformConnectors.tsx`
- **Scope:** M
- **Dependencies:** Task 6

### Task 20: Platform Connector — Discord
- **Description:** One-click Discord bot setup.
- **Acceptance:**
  - Guided setup wizard
  - Agent responds in Discord channels
  - Slash command support
- **Verify:** Create Discord bot → connect → test in channel
- **Files:** `engine/src/platforms/discord.ts`
- **Scope:** M
- **Dependencies:** Task 19 (shared base class)

### Task 21: Governance Dashboard
- **Description:** Approval workflows and audit log viewer.
- **Acceptance:**
  - Audit log shows all tool executions with details
  - Filter by tool type, date, success/failure
  - Approval queue for pending actions
  - Export audit log
- **Verify:** Run several tool calls → see them in audit log → filter works
- **Files:** `src/components/settings/AuditLog.tsx`, `src/components/settings/ApprovalQueue.tsx`
- **Scope:** M
- **Dependencies:** Task 7

### Task 22: UI Polish — Dark Theme Refined
- **Description:** Refine the dark theme, animations, transitions, responsive layout.
- **Acceptance:**
  - Consistent dark theme (#0a0a0a base, #4ade80 accent)
  - Smooth transitions between views
  - Responsive layout (min 800px width)
  - Loading states and skeletons
  - Empty states with helpful messages
- **Verify:** Visual review of all screens
- **Files:** `src/styles/globals.css`, various components
- **Scope:** M
- **Dependencies:** All previous tasks

### Task 23: Error Handling + User Feedback
- **Description:** Comprehensive error handling with user-friendly messages.
- **Acceptance:**
  - Network errors → "Check your connection" with retry button
  - API key errors → "Invalid key" with setup link
  - Tool errors → clear error message in chat
  - Crash recovery → app restarts with last state
- **Verify:** Simulate errors → see user-friendly messages
- **Files:** `src/components/common/ErrorToast.tsx`, `engine/src/healing/userFacing.ts`
- **Scope:** M
- **Dependencies:** Task 11

### Task 24: App Icons + Branding
- **Description:** App icon, splash screen, about page, version display.
- **Acceptance:**
  - Custom app icon (all platforms)
  - Splash screen on startup
  - About page with version, license, credits
  - Auto-update checker (optional)
- **Verify:** Build → install → see branding
- **Files:** `src-tauri/icons/`, `src/components/About.tsx`
- **Scope:** S
- **Dependencies:** None (can parallel)

### Task 24B: Landing Page + Documentation Site *(added 2026-06-29)*
- **Description:** Create a Vercel-deployable landing page (`index.html`) and full documentation site (`docs.html`) for the Nexus open-source project. Landing page features dark theme (#0a0a0a + gold #c8a24e), sparkle star background with shooting comets, SVG line icons (no emoji), "Build Your AI Army" hero, 9 sections (Hero, Stats, Features, How It Works, Skills, Architecture, Providers, Testimonials, FAQ), animations (reveal on scroll, counter, floating particles, glow hover). Documentation site has Hermes-style sidebar navigation, 22 sections covering Getting Started, Using Nexus, Features, Architecture, and Reference, with syntax-highlighted code blocks, callout boxes, parameter tables, and copy-to-clipboard.
- **Acceptance:**
  - Landing page: responsive, dark theme, gold accents, sparkle/comets background, SVG icons, all sections render correctly
  - Docs page: sidebar navigation, 22 sections with real Nexus content, code blocks with copy, callout boxes, parameter tables
  - Cross-linking: landing page nav has "Docs" link + hero has "Read the Docs" button; docs page has "Home" link + "Landing Page" in footer
  - Deployable to Vercel (vercel.json included)
  - Files committed to repo root (will be pushed with v0.5 release)
- **Verify:** Open index.html and docs.html in browser → all sections render, links work, responsive on mobile
- **Files:** `nexus/index.html`, `nexus/docs.html`, `nexus/vercel.json`
- **Scope:** M
- **Dependencies:** None (can parallel)
- **Status:** ✅ เสร็จแล้ว (2026-06-29) — เขียนโดย Alice (Hermes), เนื้อหา 84KB, 22 sections, deploy-ready

### ✅ Checkpoint 4: Release Ready
- [ ] Telegram + Discord connectors work
- [ ] Audit log visible and functional
- [ ] UI polished (dark theme, animations, empty states)
- [ ] Error handling comprehensive
- [ ] Branding complete

---

## Phase 5: Testing + Release — v0.6 beta *(Tasks 25-28)*

> Goal: Test everything, write docs, build cross-platform installers via GitHub Actions CI, prepare for open-source release.
>
> **Strategy: Option A — GitHub Actions CI.** Push tag → auto-build Windows (.exe) + macOS (.dmg) + Linux (.deb/.AppImage). macOS runner มี Xcode + Rust พร้อม ไม่ต้องมี Mac จริง. **ยังไม่ sign** (ไม่ต้อง Apple Developer $99/ปี) — user macOS ต้อง right-click→Open ครั้งแรก ค่อย sign ใน v1.0.
>
> **Prerequisite:** Bundle Node + engine sidecar ให้ install บน clean machine ได้ (ตอนนี้ `Nexus.exe` ยังต้องมี Node บนเครื่อง target). Options: (1) Bun single executable, (2) Tauri resources bundling, (3) pkg/sea. **ต้องทำก่อน Task 27.**

### Task 25: Integration Tests
- **Description:** End-to-end tests for critical flows.
- **Acceptance:**
  - Onboarding flow tested
  - Chat + tool execution tested
  - Provider fallback tested
  - Memory persistence tested
- **Verify:** `npm run test` (UI) + `cd engine && npm test` (engine) all pass
- **Files:** `e2e/`, `engine/tests/`
- **Scope:** L
- **Dependencies:** All previous tasks

### Task 26: README + Documentation
- **Description:** Comprehensive README, user guide, contributing guide.
- **Acceptance:**
  - README with screenshots, features, install instructions
  - User guide for each feature
  - Contributing guide for open-source
  - API documentation for engine
- **Verify:** New user can follow README to install and use
- **Files:** `README.md`, `docs/USER_GUIDE.md`, `docs/CONTRIBUTING.md`
- **Scope:** M
- **Dependencies:** All previous tasks

### Task 27: Build + Package — Cross-platform CI
- **Description:** Set up GitHub Actions CI to auto-build installers for Windows, macOS, Linux on tag push. **Prerequisite: Node bundling** — engine sidecar ต้องรันได้โดยไม่ต้องมี Node บนเครื่อง target.
- **Acceptance:**
  - GitHub Actions workflow (`.github/workflows/release.yml`) triggered on `v*` tag
  - Windows: `.exe` (via `tauri build --no-bundle` or `.msi` bundler)
  - macOS: `.dmg` / `.app` (via macOS runner, unsigned → right-click→Open)
  - Linux: `.deb` + `.AppImage`
  - All < 50MB (with bundled Node/engine)
  - Artifacts uploaded to GitHub Release automatically
- **Node bundling sub-task (blocking):**
  - Option 1: Bun single executable (best if native modules compatible)
  - Option 2: Tauri resources bundling (copy node + engine into app resources)
  - Option 3: pkg / Node SEA (single binary)
  - ต้อง verify: `better-sqlite3` + `sqlite-vec` native modules ทำงานใน bundled environment
- **CI matrix:**
  ```
  jobs:
    build:
      strategy:
        matrix:
          - os: windows-latest    → .exe
          - os: macos-latest      → .dmg (x86_64 + aarch64 universal)
          - os: ubuntu-latest     → .deb + .AppImage
  ```
- **Verify:** Push `v0.6.0` tag → 3 installers appear in GitHub Releases → clean machine install works
- **Files:** `.github/workflows/release.yml`, `src-tauri/tauri.conf.json` (bundle config)
- **Scope:** L
- **Dependencies:** Task 25, Node bundling sub-task

### Task 28: GitHub Release
- **Description:** Prepare GitHub repo for public release.
- **Acceptance:**
  - MIT License
  - Clean commit history
  - GitHub Actions CI (build + test)
  - First release tagged v0.1.0
- **Verify:** Clone → build → all tests pass
- **Files:** `.github/workflows/`, `LICENSE`
- **Scope:** M
- **Dependencies:** Task 27

---

## Phase 2B: Token Optimization (Tasks 29-33)

> Goal: 70-85% cost reduction through smart caching, routing, and compression.

### Task 29: Prompt Caching Engine
- **Description:** Implement provider-native prompt caching with automatic cache marker insertion.
- **Acceptance:**
  - Static system prompt cached across turns
  - Tool schemas cached (not re-sent each turn)
  - Cost reduction visible in token counter
  - Works with Anthropic (explicit) and OpenAI (automatic)
- **Verify:** Send 10 messages → see cached token count > 0 → cost reduced
- **Files:** `engine/src/context/promptCache.ts`
- **Scope:** M
- **Dependencies:** Task 5

### Task 30: Semantic Cache
- **Description:** Implement application-level semantic caching with sqlite-vec.
- **Acceptance:**
  - Embed and store recent Q&A pairs
  - Before LLM call, check for similar cached query
  - Configurable similarity threshold (default 0.95)
  - Cache hit rate displayed in status bar
- **Verify:** Ask same question twice → second time returns instantly + $0 cost
- **Files:** `engine/src/context/semanticCache.ts`
- **Scope:** M
- **Dependencies:** Task 9

### Task 31: Smart Model Router
- **Description:** Classify task complexity and route to cheapest capable model.
- **Acceptance:**
  - Task classifier (simple/medium/complex) works
  - Router selects appropriate model based on classification
  - User can override per-message or set preference
  - Cost comparison shown (what you saved vs using premium model)
- **Verify:** Send simple "hello" → routed to mini model → cost $0.0001
- **Files:** `engine/src/router/modelRouter.ts`
- **Scope:** L
- **Dependencies:** Task 5

### Task 32: Context Compression Pipeline
- **Description:** Implement the 5-step compression pipeline (tool results, old turns, system prompt, aggressive, emergency).
- **Acceptance:**
  - Tool results auto-summarized when > 500 chars
  - Old turns summarized when > 20 turns
  - System prompt minified when > 2K tokens
  - User notified on compression
  - All summaries stored for future reference
- **Verify:** Have 30-turn conversation → see compression happen → no data lost
- **Files:** `engine/src/context/compressor.ts`
- **Scope:** M
- **Dependencies:** Task 9

### Task 33: Token Budget Dashboard
- **Description:** Real-time token usage visualization in UI.
- **Acceptance:**
  - Per-message cost shown after each response
  - Daily/weekly/monthly charts
  - Cost by model breakdown
  - Savings from caching + routing shown
  - Budget alerts configurable
- **Verify:** Use for a day → see accurate cost tracking
- **Files:** `src/components/settings/TokenDashboard.tsx`
- **Scope:** M
- **Dependencies:** Task 6

### ✅ Checkpoint 2B: Token Optimization
- [ ] Prompt caching reduces input token cost by 60%+
- [ ] Semantic cache skips ~30% of LLM calls
- [ ] Model router routes simple tasks to cheap models
- [ ] Context compression prevents overflow
- [ ] Token dashboard shows real-time costs + savings

---

## Phase 6: Advanced Features (Tasks 34-43)

> Goal: Visual workflow, templates, observability, multi-agent, and ecosystem features.

### Task 34: Visual Workflow Builder — Canvas
- **Description:** Build the drag-and-drop canvas for visual workflow creation.
- **Acceptance:**
  - Canvas with zoom/pan
  - Drag blocks from palette to canvas
  - Connect blocks with lines (output → input)
  - Delete/select/move blocks
  - Save workflow as JSON
- **Verify:** Drag 3 blocks → connect them → save → reload → still there
- **Files:** `src/components/workflow/` (5 files)
- **Scope:** L
- **Dependencies:** Task 6

### Task 35: Visual Workflow Builder — Block Types
- **Description:** Implement all block types (trigger, action, logic, output, agent).
- **Acceptance:**
  - Trigger blocks: message, schedule, webhook, manual
  - Action blocks: search, file, code, API, message
  - Logic blocks: if/else, loop, delay, parallel
  - Output blocks: reply, save, notify
  - Agent blocks: call another agent
- **Verify:** Create workflow with each block type → execute → see results
- **Files:** `src/components/workflow/blocks/` (8 files), `engine/src/workflow/` (3 files)
- **Scope:** L
- **Dependencies:** Task 34

### Task 36: Visual Workflow Builder — Execution Engine
- **Description:** Build the workflow execution engine with real-time status updates.
- **Acceptance:**
  - Execute workflow step by step
  - Real-time status updates (success/fail/running)
  - Error handling (retry, skip, abort)
  - Execution history (log of all runs)
- **Verify:** Create workflow → run → see step-by-step execution in UI
- **Files:** `engine/src/workflow/executor.ts`
- **Scope:** L
- **Dependencies:** Task 35

### Task 37: Template Library
- **Description:** Build template system with pre-built agent templates.
- **Acceptance:**
  - Template gallery UI with categories
  - 5+ pre-built templates (support, research, trading, content, dev)
  - One-click "Use Template" → creates agent with all settings
  - Create custom template from existing agent
  - Import template from file
- **Verify:** Select "Customer Support" template → agent ready in 30 seconds
- **Files:** `src/components/templates/` (3 files), `engine/src/templates/` (2 files)
- **Scope:** M
- **Dependencies:** Task 13, Task 34

### Task 37B: Hermes Skill Import *(added 2026-06-30)*
- **Description:** Import [Hermes Agent](https://github.com/NousResearch/hermes-agent) skills (SKILL.md format, agentskills.io spec) into Nexus as custom skills. Hermes has **1000+ skills** across 40+ categories — importing them gives Nexus instant access to the largest AI agent skill ecosystem.
- **Acceptance:**
  - **SKILL.md parser:** Read YAML frontmatter (`name`, `description`, `tags`, `metadata`) + markdown body → convert to Nexus custom skill (name, triggers, procedure text)
  - **Import RPC:** `skills.import` — accepts file path or directory → parses SKILL.md → creates custom skill in SQLite
  - **Bulk import:** Scan directory (default `~/AppData/Local/hermes/skills/`) → import all SKILL.md files → skip duplicates (by normalized name)
  - **Auto-scan (opt-in):** Setting `skills.hermesAutoScan` — on session start, scan Hermes skills dir → import new/updated skills
  - **File watcher (optional):** Watch Hermes skills dir for changes → auto-update imported skills
  - **Linked files support:** Parse `references/`, `templates/`, `scripts/` subdirectories → store as skill metadata (don't execute scripts, just index)
  - **UI:** "Import Hermes Skills" button in SkillsView → file picker or auto-detect Hermes install path → show import progress + results (imported/skipped/errors)
  - **Conflict resolution:** If Nexus custom skill exists with same name → skip (don't overwrite user-created skills) or prompt
- **Verify:** Install 10 Hermes skills → import → search "hermes" in SkillsView → all 10 appear with correct name/description/triggers
- **Files:** `engine/src/skills/hermes-import.ts` (parser + import logic), `src/components/skills/ImportSkills.tsx` (UI), `src/components/skills/SkillsView.tsx` (add import button)
- **Scope:** M
- **Dependencies:** Task 10 (semantic memory / custom_skills table)

### Task 37C: Persistent Context Files *(added 2026-06-30)*
- **Description:** Add transparent, user-editable `.md` context files (like Hermes MEMORY.md / USER.md) that inject into the system prompt every turn. These form a **transparency layer** over the existing SQLite semantic memory — users see and edit what the agent knows, while the engine still benefits from vector search underneath.
- **Why:** Nexus has auto-extraction + vector search (better scale) but lacks the transparency + user control that makes Hermes's `.md` files powerful. User can't see "what does my agent know about me?" or manually add facts. This bridges the gap.
- **Files to create:**
  - **`user.md`** — User profile: name, role, preferences, language, tone, projects, interests. Auto-generated from onboarding data on first run. User can edit anytime.
  - **`memory.md`** — Persistent facts: environment details, conventions, lessons learned, tool quirks. Agent can auto-append (like Hermes memory tool). User can edit/clean.
  - **`soul.md`** — Agent identity: agent name, personality, tone, rules, boundaries, "who am I". Auto-generated from agent builder settings. User can customize deeply.
  - **`context.md`** (per-project, optional) — Project-specific instructions: tech stack, build commands, conventions, warnings. Loaded when working in that project directory.
  - **`rules.md`** — User-defined hard rules: "never do X", "always use Y format", "don't touch Z files", "ask before deleting". Injected after soul.md (high priority) — agent ต้องทำตามทุกข้อ ไม่มีข้อยกเว้น.
- **Acceptance:**
  - **Storage:** `~/.nexus/profiles/default/*.md` (plain text, user-editable with any text editor)
  - **System prompt injection:** Engine reads all `.md` files at session start → concat → prepend to system prompt (truncated if too long, priority: rules > soul > user > memory > context)
  - **GUI editor:** Settings → "Context Files" tab — markdown editor with preview for each file, save button, auto-save on blur
  - **Auto-generation:** On first run: `user.md` ← onboarding data, `soul.md` ← agent builder personality/role/custom instructions
  - **Agent auto-update:** Agent can propose updates to `memory.md` (e.g., "User prefers Thai language") — shows diff preview → user approves → file updated. Uses `memory_update` tool call (new tool).
  - **Sync with SQLite:** When `.md` file is edited (by user or agent), re-embed and update SQLite semantic memory too → vector search still works
  - **Context budget:** Total `.md` injection capped at ~2000 tokens (configurable). Truncation: soul.md (never truncated) → user.md → memory.md (most truncated) → context.md
  - **Multi-profile support:** Each profile gets its own set of `.md` files
- **Verify:** Create `user.md` with "I prefer Thai casual language" → new session → agent responds in Thai casual. Edit `soul.md` to change agent name → agent introduces itself with new name.
- **Files:** `engine/src/context/md-files.ts` (read/inject logic), `engine/src/tools/memory-update.ts` (agent auto-update tool), `src/components/settings/ContextFiles.tsx` (GUI editor), `src/hooks/useContextFiles.ts` (CRUD hooks)
- **Scope:** L
- **Dependencies:** Task 10 (semantic memory), Task 13 (agent builder)

### Task 38: Observability Dashboard
- **Description:** Real-time agent execution visualization.
- **Acceptance:**
  - Live execution timeline (steps, timing, status)
  - Token budget visualization (progress bar)
  - Cost per turn display
  - Model routing decisions shown
  - Cache hit/miss indicators
  - Thinking process (chain of thought) display
- **Verify:** Send message → see live timeline update → see token usage
- **Files:** `src/components/observability/` (4 files)
- **Scope:** M
- **Dependencies:** Task 6, Task 12

### Task 39: Export/Import Agent Configs
- **Description:** Export and import agent configurations.
- **Acceptance:**
  - Export as .nexus (full), .json (config), .workflow (workflow only)
  - Import via drag-and-drop or file picker
  - API keys excluded from export (security)
  - Import validates config structure
  - Version tracking
- **Verify:** Export agent → import on another instance → agent works (after adding API key)
- **Files:** `src/components/settings/ExportImport.tsx`, `engine/src/io/` (2 files)
- **Scope:** M
- **Dependencies:** Task 13

### Task 40: Offline Mode (Ollama)
- **Description:** Implement Ollama integration with auto-switch on internet loss.
- **Acceptance:**
  - Auto-detect Ollama running on localhost:11434
  - List available local models
  - Auto-switch: internet lost → use Ollama
  - Auto-switch: internet restored → use cloud
  - Manual override in settings
  - Status indicator (online/offline/local)
- **Verify:** Stop internet → agent continues with Ollama → restore internet → back to cloud
- **Files:** `engine/src/router/ollama.ts`, `src/components/settings/OfflineSettings.tsx`
- **Scope:** M
- **Dependencies:** Task 5

### Task 41: Multi-Agent Visual Workflow
- **Description:** Extend workflow builder for multi-agent collaboration.
- **Acceptance:**
  - Agent palette (research, analysis, writing, custom)
  - Visual agent-to-agent connections
  - Parallel execution (agents run simultaneously)
  - Sequential pipelines (A → B → C)
  - Shared memory pool between agents
  - Per-agent cost tracking
  - Failure isolation
- **Verify:** Create 3-agent workflow → run → see parallel execution → combined output
- **Files:** `src/components/workflow/MultiAgentCanvas.tsx`, `engine/src/workflow/multiAgent.ts`
- **Scope:** L
- **Dependencies:** Task 36, Task 37

### Task 42: Prompt Engineering Assistant
- **Description:** Help users write better prompts with suggestions.
- **Acceptance:**
  - Analyze user prompt and suggest improvements
  - Show improved version with explanations
  - Tips for prompt engineering
  - Template prompts for common tasks
- **Verify:** Type vague prompt → see improved suggestion → apply → better response
- **Files:** `src/components/chat/PromptAssistant.tsx`
- **Scope:** S
- **Dependencies:** Task 6

### Task 43: A/B Testing
- **Description:** Test different prompts/models on the same task.
- **Acceptance:**
  - Create A/B test with 2+ variants
  - Each variant: different model + prompt combination
  - Run test on same input
  - Compare results side-by-side
  - User rates quality
  - Apply winner to production
- **Verify:** Create test → run → see side-by-side results → rate → apply winner
- **Files:** `src/components/testing/ABTest.tsx`, `engine/src/testing/ab.ts`
- **Scope:** M
- **Dependencies:** Task 5

### Task 44: Usage Analytics Dashboard
- **Description:** Track usage patterns, costs, and optimization metrics.
- **Acceptance:**
  - Daily/weekly/monthly usage charts
  - Cost breakdown by model
  - Top tasks breakdown
  - Cache hit rate tracking
  - Savings from routing + caching
  - Export analytics data
- **Verify:** Use for a day → see accurate analytics → export data
- **Files:** `src/components/analytics/` (3 files)
- **Scope:** M
- **Dependencies:** Task 12, Task 38

### Task 45: Plugin System — Architecture
- **Description:** Build plugin architecture for extending Nexus.
- **Acceptance:**
  - Plugin manifest format (nexus-plugin.json)
  - Plugin loader (scan + load plugins)
  - Plugin sandbox (iframe isolation)
  - Plugin API (TypeScript SDK)
  - Plugin settings UI
- **Verify:** Create test plugin → load → see it appear in UI → use it
- **Files:** `src/lib/pluginSdk.ts`, `engine/src/plugins/` (2 files)
- **Scope:** L
- **Dependencies:** Task 6

### Task 46: Plugin System — Marketplace UI
- **Description:** Plugin marketplace with browse, install, rate features.
- **Acceptance:**
  - Browse plugins by category
  - Install with one click
  - Rate and review plugins
  - Verified badge for trusted plugins
  - Auto-update notifications
- **Verify:** Browse marketplace → install plugin → use it → rate it
- **Files:** `src/components/plugins/` (3 files)
- **Scope:** M
- **Dependencies:** Task 45

### ✅ Checkpoint 6: Advanced Features
- [ ] Visual workflow builder works (drag-and-drop + execution)
- [ ] Template library has 5+ templates
- [ ] Observability shows live execution timeline
- [ ] Export/import works (.nexus format)
- [ ] Offline mode works (Ollama auto-switch)
- [ ] Multi-agent workflow executes correctly
- [ ] Prompt assistant suggests improvements
- [ ] A/B testing compares variants
- [ ] Analytics dashboard shows usage data
- [ ] Plugin system loads and runs plugins

---

## Phase 7: Self-Improvement + Knowledge + MCP (Tasks 47-55)

> Goal: Agent learns from experience, connects to any knowledge source, and extends via MCP.

### Task 47: Self-Improvement — Experience Collector
- **Description:** Log every task execution with full context for pattern analysis.
- **Acceptance:**
  - Every interaction logged (input, steps, output, success/fail, timing)
  - User feedback captured (thumbs up/down, corrections)
  - Experience stored in SQLite with vector embeddings
  - Searchable experience history
- **Verify:** Run 5 tasks → see all logged in experience DB → search works
- **Files:** `engine/src/selfImprove/experience.ts`
- **Scope:** M
- **Dependencies:** Task 9

### Task 48: Self-Improvement — Pattern Detector + Skill Synthesizer
- **Description:** Analyze experience history to detect patterns and auto-create skills.
- **Acceptance:**
  - Detect recurring tasks (same task 3+ times)
  - Detect tool fallback patterns (X fail → Y work)
  - Detect user correction patterns
  - Auto-generate SKILL.md with trigger conditions, steps, pitfalls
  - Store generated skills in local skill library
- **Verify:** Do same task 3 times → auto-skill created → can be reused
- **Files:** `engine/src/selfImprove/pattern.ts`, `engine/src/selfImprove/synthesizer.ts`
- **Scope:** L
- **Dependencies:** Task 47

### Task 49: Self-Improvement — Correction Memory + Self-Evaluation
- **Description:** Learn from user corrections and self-evaluate after sessions.
- **Acceptance:**
  - Capture when user corrects agent behavior
  - Extract rules from corrections ("don't do X, do Y instead")
  - Inject relevant rules into context on similar situations
  - Self-evaluation score after each session (completion, satisfaction, efficiency)
  - Score influences future strategy
- **Verify:** Correct agent twice → third time agent doesn't repeat mistake
- **Files:** `engine/src/selfImprove/correction.ts`, `engine/src/selfImprove/evaluate.ts`
- **Scope:** M
- **Dependencies:** Task 47

### Task 50: Knowledge Base — Local File Connector
- **Description:** Connect local folders with file watching and auto-indexing.
- **Acceptance:**
  - Add/remove watched folders via UI
  - File watcher (inotify/FSEvents) for real-time changes
  - Extract text from PDF, DOCX, XLSX, TXT, MD, CSV, JSON
  - Chunk and embed into sqlite-vec
  - Unified search across all connected folders
  - File change → auto re-index
- **Verify:** Add folder → upload PDF → search finds content → edit file → search updates
- **Files:** `engine/src/knowledge/local.ts`, `src/components/knowledge/LocalConnector.tsx`
- **Scope:** M
- **Dependencies:** Task 9

### Task 51: Knowledge Base — Notion Connector
- **Description:** Connect Notion workspace and sync pages/databases.
- **Acceptance:**
  - OAuth2 or token authentication
  - Select pages/databases to sync
  - Full sync on connect + incremental sync every 5 min
  - Extract page content (blocks → markdown)
  - Extract database rows as separate chunks
  - Properties/metadata preserved
- **Verify:** Connect Notion → select pages → search finds Notion content
- **Files:** `engine/src/knowledge/notion.ts`, `src/components/knowledge/NotionConnector.tsx`
- **Scope:** M
- **Dependencies:** Task 9

### Task 52: Knowledge Base — Obsidian Connector
- **Description:** Connect Obsidian vault with wikilink and tag awareness.
- **Acceptance:**
  - Point to vault folder (local file system)
  - File watcher for real-time changes
  - Extract markdown + frontmatter + wikilinks + tags
  - Wikilink resolution (follow links for deeper context)
  - Graph-based relevance (connected notes score higher)
  - Multiple vault support
- **Verify:** Connect vault → search finds notes → wikilinks resolved → tags work
- **Files:** `engine/src/knowledge/obsidian.ts`, `src/components/knowledge/ObsidianConnector.tsx`
- **Scope:** M
- **Dependencies:** Task 50

### Task 53: Knowledge Base — Unified Search UI
- **Description:** Single search interface across ALL knowledge sources.
- **Acceptance:**
  - Search bar that queries all connected sources
  - Results show source (Local/Notion/Obsidian) with relevance score
  - Filter by source, date, type
  - Click result → open in context
  - Search suggestions/autocomplete
- **Verify:** Connect all 3 sources → search → results from all 3 with source labels
- **Files:** `src/components/knowledge/UnifiedSearch.tsx`
- **Scope:** M
- **Dependencies:** Task 50, Task 51, Task 52

### Task 54: MCP Integration — Client Core
- **Description:** Implement MCP client with stdio and HTTP/SSE transports.
- **Acceptance:**
  - stdio transport (spawn subprocess, JSON-RPC 2.0)
  - HTTP/SSE transport (fetch + EventSource)
  - Tool discovery (tools/list)
  - Tool execution (tools/call)
  - Resource access (resources/read)
  - Health monitoring (ping every 30s)
  - Auto-restart on crash
- **Verify:** Add MCP filesystem server → tools appear in tool list → execute tool → works
- **Files:** `engine/src/mcp/` (4 files)
- **Scope:** L
- **Dependencies:** Task 7

### Task 55: MCP Integration — UI + Marketplace
- **Description:** MCP server management UI and marketplace.
- **Acceptance:**
  - Add/remove MCP servers via UI
  - Configure transport (stdio/HTTP)
  - View connected servers + available tools
  - Enable/disable individual tools
  - Marketplace: browse popular MCP servers
  - One-click install from marketplace
- **Verify:** Browse marketplace → install server → tools appear → use tool in chat
- **Files:** `src/components/mcp/` (3 files)
- **Scope:** M
- **Dependencies:** Task 54

### ✅ Checkpoint 7: Self-Improvement + Knowledge + MCP
- [ ] Agent auto-creates skills from repeated tasks
- [ ] Agent learns from user corrections
- [ ] Local file connector watches and indexes folders
- [ ] Notion connector syncs pages and databases
- [ ] Obsidian connector resolves wikilinks and tags
- [ ] Unified search works across all sources
- [ ] MCP client connects to stdio and HTTP servers
- [ ] MCP marketplace browsable and installable

---

## Summary (Honest Estimates)

Estimates are in **focused build-days** — a solid day of real work (Claude generating most code; you verifying the GUI/installers and tuning quality-sensitive features). They are **not** calendar days. L-scoped tasks (workflow builder, plugins, multi-agent, MCP, knowledge connectors, self-improvement) are each multi-day to multi-week — which the original ~30-38-day figure badly underestimated.

| Milestone | Phase / Tasks | Focus | Build-days |
|-----------|---------------|-------|-----------|
| **v0.1 — Wedge** | 1 / Tasks 1-6 | Onboarding + streaming chat + settings (the integration spine) | 8-14 |
| **v0.2 — Real agent** | 2 / Tasks 7-12 | Tools + sandbox + memory + healing | 10-16 |
| **v0.3 — Make it yours** | 3 / Tasks 13-18 | Builder + RAG + history + settings | 8-12 |
| **v0.4 — Cost control** | 2B / Tasks 29-33 | Caching + routing + compression | 6-10 |
| **v0.5 — Reach + polish** | 4 / Tasks 19-24 | Telegram + governance + polish | 7-11 |
| **v0.6 — First public release (beta)** | 5 / Tasks 25-28 | Tests + docs + signed & clean-machine installers + release | 6-10 |
| **→ Subtotal to v0.6 beta** | Tasks 1-33 (v0.1→v0.6) | **A real, shippable beta** | **45-73** |
| **v0.7 — Visual workflows** | 6 / Tasks 34-37 | Canvas + blocks + executor + templates | 18-30 |
| **v0.8 — Observability + power tools** | 6 / Tasks 38-40, 42-44 | Observability + export + offline + prompt asst + A/B + analytics | 16-28 |
| **v0.9 — Extensibility + multi-agent + self-improve** | 6-7 / Tasks 41, 45-49 | Multi-agent + plugins + self-improvement loop | 28-50 |
| **v1.0 — Complete platform** | 7 / Tasks 50-55 | Knowledge connectors + unified search + MCP | 22-40 |
| **Total (full 55-task vision = v1.0)** | **55 tasks** | **Finished platform** | **~135-235** |

**Calendar reality (solo):** at a sustainable part-time pace (~3 focused days/week), the **first public beta (v0.6) is ~4-6 months** of total work from scratch; the **finished v1.0 (all 55 tasks) is ~12-18 months**. Full-time, roughly half that. This is normal — Hermes and OpenClaw didn't launch feature-complete either. **Ship the v0.6 beta, get real users, and let their feedback decide the order of v0.7 → v1.0.**

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rust ↔ TS sidecar IPC | Medium | Plain JSON-RPC over stdio; validate in Task 2. Far simpler than a cross-language (Rust↔Python) boundary |
| Sidecar process stability | Medium | Robust error handling + auto-restart; a single Node/Bun process |
| Embedding quality / cost | Medium | Provider embeddings by default; allow local (transformers.js) fallback; tune chunking |
| Provider API changes | Medium | Abstract provider interface (Vercel AI SDK), easy to update |
| Cross-platform packaging | Medium | Test on Windows first (primary); the compiled sidecar avoids Python packaging entirely |
| Visual workflow complexity | High | Start simple (linear), add branches later |
| Multi-agent coordination | High | Begin with sequential, add parallel later |
| Plugin security | High | Sandbox all plugins, verify before marketplace |

---

## What to Hand to Claude Code

Give Claude Code these files:
1. `SPEC.md` — Full specification
2. `PLAN.md` — This implementation plan
3. Build in **milestone order** (see Release Milestones): finish **v0.1 (Tasks 1-6)** before anything else — do not start advanced features until v0.1 runs
4. Each task has clear acceptance criteria and verification steps
5. Run `npm run tauri dev` after each task to verify; ship/demo at each milestone boundary

**Claude Code prompt template:**
```
Read SPEC.md and PLAN.md. Implement Task [N]: [task name].
Follow the acceptance criteria exactly.
After implementation, run the verification step.
If verification fails, fix before moving to next task.
```
