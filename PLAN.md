# Implementation Plan: Nexus AI Agent Platform

> Depends on: SPEC.md
> Created: 2026-06-28
> Last updated: 2026-06-30
> Status: In build — v0.1–v0.5 complete; v0.6 deferred; v0.7 (visual workflows) in progress

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
| v0.6 — First Public Release (Beta) | 25-28 | ⏸️ Deferred — chosen to be done after v0.7 (packaging/CI is easier once the feature surface settles) |
| v0.7 — Visual Workflows | 34-37 | 🚧 Task 34 (canvas) done — block config + execution (35-37), template library, Hermes skill import, context files remain |
| v0.8 — Observability + Power Tools | 38-40, 42-44 | ⬜ Not started |
| v0.9 — Extensibility + Multi-Agent + Self-Improvement | 41, 45-49 | 🚧 Only Task 48 (Skill Synthesizer) started |
| v1.0 — Complete Platform (Knowledge + MCP) | 50-55 | ⬜ Not started |

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
