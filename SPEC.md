# Spec: Nexus — Open-Source AI Agent Desktop Platform

> **Codename:** Nexus
> **Version:** 0.1.0 (MVP)
> **Date:** 2026-06-28
> **Author:** Alice (AI) + Euro (Human)

---

## 1. Objective

### What

Nexus is an **open-source desktop AI agent platform** that lets non-technical users run powerful AI agents — comparable to or better than Hermes Agent and OpenClaw — without writing a single line of code.

### Why

Both Hermes Agent and OpenClaw are powerful but share critical UX problems:

| Problem | Hermes | OpenClaw | Nexus Solution |
|---------|--------|----------|----------------|
| Setup complexity | 100+ config options | Requires developer | **3-click setup** (pick provider → enter API key → start) |
| No visual UI | Terminal-only | Terminal-only | **Full desktop GUI** with visual agent builder |
| Context loss | Compaction destroys info | No compression | **Smart context engine** with automatic memory |
| Token waste | 10-15K tokens/turn overhead | No optimization | **Token budget system** with auto-optimization |
| Error recovery | Retry same way | Manual debug | **Self-healing** with auto-fallback |
| Security | Manual approval | No governance | **Built-in governance** with approval workflows |
| Skill sprawl | 150+ confusing skills | 100+ unverified skills | **Curated marketplace** with sandbox + ratings |
| Multi-platform | Gateway config needed | Not built-in | **One-click platform connect** (Telegram, Discord, LINE) |

### Who is the User

- **Primary:** Non-technical users (SMEs, freelancers, creators) who want AI agents but can't code
- **Secondary:** Developers who want a visual layer on top of agent capabilities
- **Tertiary:** Teams who need governed, auditable AI agents

### What Does Success Look Like

1. User downloads Nexus → opens app → picks OpenAI/Anthropic/etc → enters API key → has a working AI agent in < 2 minutes
2. Agent can browse web, read/write files, run code, connect to messaging platforms — all configured through UI
3. Agent remembers context across sessions, learns from interactions, and improves over time
4. Other users adopt Nexus as their primary AI agent tool

### Core Design Principles (Non-Negotiable)

These five principles define what Nexus *is* and constrain every feature decision below. They are also **how a zero-budget, open-source project can realistically compete with Hermes and OpenClaw**: the same local-first economics that let those tools scale to many users at no operating cost.

1. **Local-first.** Everything runs on the user's own machine — UI, agent engine, database (SQLite), and vector store (sqlite-vec). There is no Nexus-operated backend, account system, or cloud sync required to use the product.

2. **Bring-your-own-key (BYO).** The user supplies their own provider API key (or runs a local model via Ollama) and pays the LLM provider directly. Nexus never proxies model traffic and never pays for a user's inference.

3. **Zero marginal hosting cost.** Because of (1) and (2), each additional user costs the project **$0** in infrastructure. Nexus can scale to unlimited users with no servers to fund — the same model as Hermes, OpenClaw, Ollama, and LM Studio.

4. **Privacy by default.** User data (conversations, documents, memory, API keys) never leaves the device unless the user explicitly connects an external source. This is a feature, not a side effect.

5. **No always-on promise from the project.** Any capability that needs a continuously running, publicly reachable server (e.g. inbound messaging webhooks for a 24/7 bot) is **not** offered as a hosted service. Such features run while the app is open, or are self-hosted by the user on their own always-on machine. See §4.7.

**Implication for monetization:** the free product must cost nothing to operate. Revenue, if any, comes from *optional* paid conveniences that fund their own costs (e.g. a managed always-on relay, §4.7) — never from subsidizing free users' compute.

---

## 2. Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Desktop Shell** | Tauri 2.x (Rust + WebView) | Much smaller than Electron, lower idle RAM, native performance, secure Rust backend |
| **Frontend** | React 18 + TypeScript + Tailwind CSS | Mature ecosystem, fast UI development |
| **Agent Engine** | TypeScript sidecar (Node/Bun) | Same language as the UI; mature AI SDKs (Vercel AI SDK, official Anthropic/OpenAI SDKs, MCP TS SDK); reuses the existing TS codebase |
| **Database** | SQLite via `better-sqlite3` (in the TS sidecar) | Zero-config, portable, single-user; the same driver the current app already uses |
| **Vector Store** | `sqlite-vec` (vectors in the same SQLite file) | No second store to run; native-speed search; transactional with all other data. LanceDB optional if scale demands it |
| **Embeddings** | Provider API (BYO-key) | Consistent with the BYO-key model; nothing to bundle. Local embeddings (transformers.js) optional, for offline only |
| **IPC** | Tauri commands (Rust ↔ WebView) + sidecar JSON-RPC over stdio (Rust ↔ TS engine) | One toolchain end-to-end; no cross-language marshalling |
| **Packaging** | Tauri bundler → .msi / .deb / .dmg | Native installers per platform |

### Why NOT Electron

- Electron bundles Chromium = 150-200MB installer *before* any app code
- Tauri uses the system WebView = ~5-10MB shell; with a compiled TypeScript sidecar (no embedded Python, no bundled model) the full build stays lean — see §12 Success Criteria — and well under an equivalent Electron build
- Tauri Rust backend is memory-efficient (critical for AI workloads)
- Better security model (Rust sandbox vs Node.js)

### Why NOT Hermes architecture (Python-only)

- Hermes = CLI + Python = no visual UI
- Nexus needs a proper GUI layer
- Tauri gives us native desktop feel with web UI flexibility
- The agent engine runs as a TypeScript sidecar (Node/Bun) that the Rust core spawns and talks to over JSON-RPC/stdio — one language shared with the UI, nothing extra to ship

### Why a TypeScript sidecar (not Python) for the engine

- **One language end-to-end.** UI and engine share TypeScript types and tooling — no context-switching, no duplicated models across a language boundary.
- **Deletes the two highest-risk items in PLAN.md.** No Rust↔Python marshalling and no embedded-Python cross-platform packaging (PyInstaller, notarization, AV false positives). The Rust core simply spawns a Node/Bun process and exchanges JSON.
- **Reuses existing code.** The current app's RAG, document extraction (`pdf-parse`, `mammoth`, `xlsx`), embeddings, and LINE connector are already TypeScript — they port instead of being rewritten in Python.
- **Performance is API-bound.** For a cloud, BYO-key agent the latency is the model round-trip; the engine is orchestration + I/O, where Node/Bun is more than fast enough and DB/vector work runs at native speed via `better-sqlite3` / `sqlite-vec`.
- **Mature AI ecosystem.** Vercel AI SDK (streaming, tool calls, multi-provider), official Anthropic/OpenAI SDKs, and a first-class MCP TypeScript SDK.

> If the product later centers on heavy **local** compute (local embedding models + very large local vector search, offline-first), revisit a Rust engine — it is the only faster option, at a higher build cost.

---

## 2B. Supported Providers (20+ Providers — Full Parity with Hermes)

Nexus supports **every provider Hermes supports**, plus Ollama for offline mode.

### Tier 1: Major Providers (API Key)

| Provider | Models | Auth | Env Var | Notes |
|----------|--------|------|---------|-------|
| **OpenAI** | GPT-4o, GPT-4o-mini, o3, o4-mini | API key | `OPENAI_API_KEY` | Default for most users |
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 3.5 | API key | `ANTHROPIC_API_KEY` | Best for coding |
| **Google Gemini** | Gemini 2.5 Pro, Flash, Ultra | API key | `GOOGLE_API_KEY` | Cheapest option |
| **DeepSeek** | DeepSeek V3, R1 | API key | `DEEPSEEK_API_KEY` | Budget reasoning |
| **OpenRouter** | 300+ models (meta-router) | API key | `OPENROUTER_API_KEY` | Access all models |

### Tier 2: Specialized Providers

| Provider | Models | Auth | Env Var | Notes |
|----------|--------|------|---------|-------|
| **xAI / Grok** | Grok-3, Grok-3-mini | API key | `XAI_API_KEY` | Real-time info |
| **Hugging Face** | Open models via HF Inference | Token | `HF_TOKEN` | Open-source models |
| **Z.AI / GLM** | GLM-4 series | API key | `GLM_API_KEY` | Chinese market |
| **MiniMax** | MiniMax-Text-01 | API key | `MINIMAX_API_KEY` | Long context |
| **MiniMax CN** | MiniMax CN models | API key | `MINIMAX_CN_API_KEY` | China region |
| **Kimi / Moonshot** | Kimi K2 | API key | `KIMI_API_KEY` | Long context |
| **Alibaba / DashScope** | Qwen3 series | API key | `DASHSCOPE_API_KEY` | Chinese market |
| **Xiaomi MiMo** | MiMo-V2.5 series | API key | `XIAOMI_API_KEY` | Coding specialist |

### Tier 3: Code-Focused Providers

| Provider | Models | Auth | Env Var | Notes |
|----------|--------|------|---------|-------|
| **OpenAI Codex** | Codex models | OAuth | `hermes auth` | Code generation |
| **GitHub Copilot** | Copilot models | Token | `COPILOT_GITHUB_TOKEN` | IDE integration |
| **GitHub Copilot ACP** | Copilot via ACP | External | `COPILOT_CLI_PATH` | CLI integration |
| **Kilo Code** | Kilo models | API key | `KILOCODE_API_KEY` | Code specialist |
| **OpenCode Zen** | OpenCode models | API key | `OPENCODE_ZEN_API_KEY` | Code generation |
| **OpenCode Go** | OpenCode models | API key | `OPENCODE_GO_API_KEY` | Code generation |

### Tier 4: Enterprise / OAuth Providers

| Provider | Models | Auth | Notes |
|----------|--------|------|-------|
| **Nous Portal** | 300+ models | OAuth | Nous Research subscription |
| **Qwen OAuth** | Qwen3 series | OAuth | Alibaba Cloud account |

### Tier 5: Local / Self-Hosted

| Provider | Models | Auth | Notes |
|----------|--------|------|-------|
| **Ollama** | Any GGUF model | None (local) | Auto-detected on localhost:11434 |
| **LM Studio** | Any GGUF model | None (local) | Custom endpoint |
| **vLLM** | Any HF model | None (local) | Custom endpoint |
| **Custom Endpoint** | Any OpenAI-compatible | Config | `base_url` + `api_key` |

### Provider UI (Onboarding)

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Choose Your AI Provider                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Popular ──────────────────────────────────────────────┐│
│  │                                                        ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐              ││
│  │  │  OpenAI  │ │Anthropic │ │  Google  │              ││
│  │  │  GPT-4o  │ │  Claude  │ │  Gemini  │              ││
│  │  └──────────┘ └──────────┘ └──────────┘              ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐              ││
│  │  │DeepSeek  │ │OpenRouter│ │  Ollama  │              ││
│  │  │  V3/R1   │ │ 300+ mod │ │  Local   │              ││
│  │  └──────────┘ └──────────┘ └──────────┘              ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ More Providers ───────────────────────────────────────┐│
│  │                                                        ││
│  │  [xAI/Grok] [HuggingFace] [MiniMax] [Kimi]           ││
│  │  [DashScope/Qwen] [Xiaomi MiMo] [Z.AI/GLM]           ││
│  │  [Nous Portal] [GitHub Copilot] [Kilo Code]           ││
│  │  [OpenCode] [Custom Endpoint]                          ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Local Models ─────────────────────────────────────────┐│
│  │                                                        ││
│  │  🏠 Ollama detected on localhost:11434                 ││
│  │  Available: llama3.2:8b, codellama:7b, gemma2:4b      ││
│  │  [Use Ollama]  [Configure LM Studio]  [Custom URL]    ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Multi-Provider Setup ─────────────────────────────────┐│
│  │                                                        ││
│  │  Add multiple providers for:                           ││
│  │  • Fallback chain (primary → secondary → tertiary)     ││
│  │  • Smart routing (cheap model for simple tasks)        ││
│  │  • Cost optimization (compare prices)                  ││
│  │                                                        ││
│  │  [Add Another Provider]                                ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Provider Features

| Feature | Description |
|---------|-------------|
| **Multi-Provider** | Add 2+ providers for fallback + routing |
| **Auto-Detect Local** | Ollama/LM Studio auto-detected on localhost |
| **Custom Endpoint** | Any OpenAI-compatible API (LM Studio, vLLM, etc.) |
| **Credential Pool** | Rotate across multiple API keys per provider |
| **Price Comparison** | Show cost per model across providers |
| **Health Check** | Test connection before saving |
| **Fallback Chain** | Primary → Secondary → Tertiary → Local |
| **Smart Routing** | Route simple tasks to cheap models |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│                   NEXUS DESKTOP                   │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │           REACT UI (WebView)              │   │
│  │                                           │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ │   │
│  │  │ Chat    │ │ Agent    │ │ Settings  │ │   │
│  │  │ Console │ │ Builder  │ │ & Config  │ │   │
│  │  └────┬────┘ └────┬─────┘ └─────┬─────┘ │   │
│  │       │           │             │         │   │
│  └───────┼───────────┼─────────────┼─────────┘   │
│          │  Tauri IPC Commands       │            │
│  ┌───────┼───────────┼─────────────┼─────────┐   │
│  │       ▼           ▼             ▼         │   │
│  │  ┌─────────────────────────────────────┐  │   │
│  │  │         RUST CORE (Tauri)           │  │   │
│  │  │                                     │  │   │
│  │  │  • IPC Router                       │  │   │
│  │  │  • SQLite DB Manager                │  │   │
│  │  │  • File System Watcher              │  │   │
│  │  │  • Process Manager (sidecar)        │  │   │
│  │  │  • Platform Connectors (TG/Discord) │  │   │
│  │  └──────────────┬──────────────────────┘  │   │
│  │                 │                          │   │
│  │  ┌──────────────▼──────────────────────┐  │   │
│  │  │     TYPESCRIPT ENGINE (sidecar)     │  │   │
│  │  │                                     │  │   │
│  │  │  ┌──────────┐  ┌────────────────┐  │  │   │
│  │  │  │ Router   │  │ Context Engine │  │  │   │
│  │  │  │ (model   │  │ (memory +      │  │  │   │
│  │  │  │  select) │  │  compression)  │  │  │   │
│  │  │  └──────────┘  └────────────────┘  │  │   │
│  │  │  ┌──────────┐  ┌────────────────┐  │  │   │
│  │  │  │ Tool     │  │ Skill Engine   │  │  │   │
│  │  │  │ Registry │  │ (discovery +   │  │  │   │
│  │  │  │ (sandbox)│  │  execution)    │  │  │   │
│  │  │  └──────────┘  └────────────────┘  │  │   │
│  │  │  ┌──────────┐  ┌────────────────┐  │  │   │
│  │  │  │ Provider │  │ Self-Healing   │  │  │   │
│  │  │  │ Pool     │  │ (auto-fallback │  │  │   │
│  │  │  │          │  │  + retry)      │  │  │   │
│  │  │  └──────────┘  └────────────────┘  │  │   │
│  │  └─────────────────────────────────────┘  │   │
│  │                 │                          │   │
│  │  ┌──────────────▼──────────────────────┐  │   │
│  │  │         LOCAL SERVICES              │  │   │
│  │  │                                     │  │   │
│  │  │  • sqlite-vec (vector store)        │  │   │
│  │  │  • Cron Scheduler                   │  │   │
│  │  │  • Log Aggregator                   │  │   │
│  │  │  • Update Checker                   │  │   │
│  │  └─────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 4. Core Components (MVP)

### 4.1 Onboarding Flow (3-Click Setup)

```
[Welcome Screen]
    │
    ▼
[Step 1: Pick Provider] ──→ See full provider list below
    │
    ▼
[Step 2: Enter API Key] ──→ Secure input field + "Test Connection" button
    │
    ▼
[Step 3: Name Your Agent] ──→ Default name + personality selector
    │
    ▼
[Dashboard] ──→ Agent is ready. Start chatting.
```

**Key design decisions:**
- API key stored encrypted in OS keychain (via Tauri plugin), NOT in config files
- "Test Connection" validates key works before proceeding
- Can add more providers later in Settings
- Local models (Ollama) auto-detected if running

### 4.2 Chat Console

The primary interface. Users interact with their agent here.

```
┌─────────────────────────────────────────────┐
│  Nexus Agent                          [⋯]  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ System Status Bar ──────────────────┐  │
│  │ Model: claude-sonnet-4 │ Tokens: 1.2K │  │
│  │ Memory: 3 entries │ Skills: 5 loaded │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌─ Chat Area (scrollable) ─────────────┐  │
│  │                                       │  │
│  │  [Agent]: Hello! I'm your AI agent.  │  │
│  │  How can I help today?               │  │
│  │                                       │  │
│  │  [You]: Research competitor pricing  │  │
│  │                                       │  │
│  │  [Agent]: 🔍 Searching...            │  │
│  │  Found 5 results. Here's a summary:  │  │
│  │  • Competitor A: $29/mo              │  │
│  │  • Competitor B: $49/mo              │  │
│  │  ...                                 │  │
│  │  [Tool: web_search] ✓ 1.2s           │  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Input Bar ──────────────────────────┐  │
│  │ [📎] Type a message...      [▶ Send] │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌─ Quick Actions ──────────────────────┐  │
│  │ [🌐 Browse] [💻 Code] [📁 Files]     │  │
│  │ [🔍 Search] [📊 Analyze] [⏰ Cron]   │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Features:**
- Real-time token usage display (cost awareness)
- Tool execution visibility (see what agent is doing)
- Quick action buttons for common tasks
- File attachment support (images, documents)
- Streaming responses
- Conversation history sidebar

### 4.3 Agent Builder (Visual)

No-code agent customization through UI:

```
┌─────────────────────────────────────────────┐
│  Agent Builder                         [←]  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ Personality ────────────────────────┐  │
│  │ Name: [My Assistant        ]         │  │
│  │ Role: [Customer Support    ▼]        │  │
│  │ Tone: [Professional     ▼]           │  │
│  │ Language: [Thai ▼]                   │  │
│  │ Custom Instructions:                  │  │
│  │ ┌─────────────────────────────────┐  │  │
│  │ │ You are a customer support rep  │  │  │
│  │ │ for a Thai restaurant...        │  │  │
│  │ └─────────────────────────────────┘  │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌─ Capabilities (toggle on/off) ───────┐  │
│  │ [✓] Web Browsing                     │  │
│  │ [✓] File Operations                  │  │
│  │ [✓] Code Execution                   │  │
│  │ [ ] Home Automation                  │  │
│  │ [✓] Memory (remembers conversations) │  │
│  │ [✓] Skills (reusable procedures)     │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌─ Knowledge Base ─────────────────────┐  │
│  │ [📤 Upload Documents]                │  │
│  │                                      │  │
│  │ 📄 product-info.pdf (2.3 MB) ✓ Ready │  │
│  │ 📄 faq.txt (12 KB) ✓ Ready          │  │
│  │ 📄 pricing.xlsx (45 KB) ✓ Ready     │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌─ Connected Platforms ────────────────┐  │
│  │ [Telegram] 🟢 Connected              │  │
│  │ [Discord]  ⚪ Not connected          │  │
│  │ [LINE]     ⚪ Not connected          │  │
│  │ [WhatsApp] ⚪ Not connected          │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  [Save Agent]                    [Test ▶]  │
└─────────────────────────────────────────────┘
```

### 4.4 Smart Context Engine (Solves Hermes/OpenClaw Context Loss)

**The biggest differentiator.** Unlike Hermes (which compresses and loses info) or OpenClaw (which has no compression):

```
┌─────────────────────────────────────────────┐
│           CONTEXT ENGINE                    │
│                                             │
│  Layer 1: Working Memory (in-context)       │
│  ├── Current conversation (last N turns)    │
│  ├── Active tool results                    │
│  └── System prompt + loaded skills          │
│                                             │
│  Layer 2: Episodic Memory (sqlite-vec)      │
│  ├── Past conversations (vector-indexed)    │
│  ├── Searchable by semantic similarity      │
│  └── Auto-summarized when old               │
│                                             │
│  Layer 3: Semantic Memory (sqlite-vec)      │
│  ├── User preferences (auto-extracted)      │
│  ├── Facts learned (auto-extracted)         │
│  └── Relationships (auto-extracted)         │
│                                             │
│  Layer 4: Procedural Memory (Skills)        │
│  ├── Reusable workflows                     │
│  ├── Tool usage patterns                    │
│  └── Error recovery procedures              │
│                                             │
│  Context Manager:                           │
│  ├── Token budget: tracks usage per turn    │
│  ├── Smart retrieval: fetch relevant memory │
│  ├── Auto-compression: summarize old stuff  │
│  └── Priority scoring: what to keep/discard │
└─────────────────────────────────────────────┘
```

**How it works:**
1. Before each LLM call, the engine retrieves relevant episodic + semantic memory
2. It fits them into the context window with a token budget
3. Old conversations are auto-summarized (not lost)
4. User preferences and facts are extracted automatically
5. Skills are loaded based on task similarity

### 4.5 Tool Registry (Sandboxed)

Unlike OpenClaw (no governance) or Hermes (manual approval):

```
┌─────────────────────────────────────────────┐
│           TOOL REGISTRY                     │
│                                             │
│  Built-in Tools (always available):         │
│  ├── 🌐 Web Search (DuckDuckGo/default)    │
│  ├── 📁 File Read/Write                     │
│  ├── 💻 Terminal (sandboxed)                │
│  ├── 📊 Code Execution (sandboxed JS)       │
│  └── 🔍 Web Page Extraction                 │
│                                             │
│  Optional Tools (enable in UI):             │
│  ├── 🖼️ Image Generation                    │
│  ├── 🎤 Voice (STT/TTS)                     │
│  ├── 🏠 Home Assistant                      │
│  └── 📱 Platform Connectors                 │
│                                             │
│  Community Skills (marketplace):            │
│  ├── ⭐ Verified (sandbox-tested)           │
│  ├── 🔒 Sandboxed (runs in isolation)       │
│  └── ⚠️ User ratings + audit logs           │
│                                             │
│  Security:                                  │
│  ├── All tools have approval levels         │
│  ├── Destructive ops require user confirm   │
│  ├── Audit log for every tool execution     │
│  └── Rate limiting per tool                 │
└─────────────────────────────────────────────┘
```

### 4.6 Self-Healing Engine (Solves Error Recovery)

```
┌─────────────────────────────────────────────┐
│           SELF-HEALING                      │
│                                             │
│  When a tool call fails:                    │
│  1. Log error with full context             │
│  2. Check if retry makes sense              │
│  3. If provider error → auto-switch         │
│  4. If tool error → try alternative tool    │
│  5. If persistent → notify user             │
│                                             │
│  Provider Fallback Chain:                   │
│  Primary (e.g., OpenAI)                     │
│    → Secondary (e.g., Anthropic)            │
│      → Tertiary (e.g., Google)              │
│        → Local (e.g., Ollama)               │
│                                             │
│  Auto-recovery patterns:                    │
│  • Rate limit → wait + retry with backoff   │
│  • API error → switch provider              │
│  • Tool crash → restart tool subprocess     │
│  • Context overflow → auto-compress         │
│  • Memory corruption → rebuild from backup  │
└─────────────────────────────────────────────┘
```

### 4.7 Platform Connectors (One-Click)

```
┌─────────────────────────────────────────────┐
│        PLATFORM CONNECTORS                  │
│                                             │
│  Each platform = guided setup wizard:       │
│                                             │
│  Telegram:                                  │
│  [1] Open @BotFather → /newbot → copy token │
│  [2] Paste token here → [Test Connection]   │
│  [3] Done! Agent is now on Telegram         │
│                                             │
│  Discord:                                   │
│  [1] Open Discord Developer Portal          │
│  [2] Create bot → copy token                │
│  [3] Paste token → [Test Connection]        │
│  [4] Done!                                  │
│                                             │
│  LINE:                                      │
│  [1] Open LINE Developers                   │
│  [2] Create Channel → copy credentials      │
│  [3] Paste here → [Test Connection]         │
│  [4] Done!                                  │
│                                             │
│  Supported: Telegram, Discord, LINE,        │
│  WhatsApp (via API), Slack, Email, Signal   │
└─────────────────────────────────────────────┘
```

> **⚠️ Always-on requires a server somebody pays for (local-first reality).** Receiving inbound messages 24/7 (LINE / Discord / Slack / WhatsApp webhooks) needs a continuously running, publicly reachable endpoint — which a desktop app on a sleeping laptop is not. Per Core Design Principle #5, Nexus does **not** host this for you. Platform connectors therefore run in one of three modes:
>
> - **Live mode (default):** the connector is active while Nexus is open on the user's PC. Zero setup cost; ideal for personal use, testing, and bots that don't need to be online overnight. Telegram fits here naturally (long-polling — no public URL required).
> - **Self-hosted relay (24/7):** export the connector to run on the user's *own* always-on box — an old PC left on, a Raspberry Pi, a ~$5/mo VPS, or a free tier (Oracle Cloud Free, Cloudflare Tunnel, fly.io). The hosting cost belongs to the user, not the project. This is the OpenClaw-style self-host path.
> - **Managed relay (future, optional, paid):** a premium convenience tier where Nexus operates the always-on endpoint on the user's behalf. It funds its own servers and is never required to use the product.
>
> **MVP scope:** Live mode + Telegram first. Self-hosted relay and the managed tier are post-MVP. The connectors list below is the long-term target, not the launch surface.

---

## 4.8 Visual Workflow Builder (KILLER FEATURE)

**Neither Hermes nor OpenClaw has this.** Drag-and-drop agent logic builder.

```
┌─────────────────────────────────────────────────────────────┐
│  Workflow Builder                                   [Save]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ TRIGGER  │───→│  SEARCH  │───→│ ANALYZE  │             │
│  │          │    │          │    │          │             │
│  │ Message  │    │ Web      │    │ GPT-4o   │             │
│  │ received │    │ Search   │    │ mini     │             │
│  └──────────┘    └────┬─────┘    └────┬─────┘             │
│                       │               │                     │
│                  ┌────▼─────┐    ┌────▼─────┐             │
│                  │  ERROR   │    │  REPLY   │             │
│                  │          │    │          │             │
│                  │ Retry x3 │    │ Send to  │             │
│                  │ → Notify │    │ platform │             │
│                  └──────────┘    └──────────┘             │
│                                                             │
│  [Block Palette]                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │Trigger │ │ Search │ │ Analyze│ │ Reply  │ │  If/   │  │
│  │        │ │        │ │        │ │        │ │  Else  │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │ Loop   │ │ Delay  │ │ Save   │ │ API    │ │ Custom │  │
│  │        │ │        │ │ to DB  │ │ Call   │ │ Block  │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Block Types:**
- **Trigger:** Message received, schedule (cron), webhook, manual
- **Action:** Search web, read file, run code, API call, send message
- **Logic:** If/else, loop, delay, parallel, merge
- **Output:** Reply, save to DB, send to platform, notify user
- **Agent:** Call another agent (multi-agent collaboration)

**Key Features:**
- Visual drag-and-drop canvas
- Real-time execution visualization (see data flow through blocks)
- Export/import workflows as JSON
- Version history (undo/redo)
- Template workflows (pre-built)

---

## 4.9 Template Library

Pre-built agent templates for instant deployment.

```
┌─────────────────────────────────────────────────────┐
│  Template Library                            [Search]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Popular ──────────────────────────────────────┐│
│  │                                                ││
│  │  🛒 Customer Support Bot    ⭐ 4.8 (2.3K uses) ││
│  │  Thai SME customer service, FAQ, order tracking ││
│  │  [Use Template]  [Preview]                     ││
│  │                                                ││
│  │  📊 Research Assistant      ⭐ 4.6 (1.8K uses) ││
│  │  Web search, summarize, cite sources           ││
│  │  [Use Template]  [Preview]                     ││
│  │                                                ││
│  │  💰 Trading Analyst        ⭐ 4.5 (1.2K uses) ││
│  │  Market data, chart analysis, alerts           ││
│  │  [Use Template]  [Preview]                     ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ Categories ───────────────────────────────────┐│
│  │ [Business] [Development] [Creative] [Education]││
│  │ [Finance] [Healthcare] [Real Estate] [Custom]  ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  [Create Custom Template]  [Import Template]        │
└─────────────────────────────────────────────────────┘
```

**Template Structure:**
```json
{
  "name": "Customer Support Bot",
  "description": "Thai SME customer service agent",
  "personality": { "role": "support", "tone": "friendly", "language": "th" },
  "tools": ["web_search", "file_ops"],
  "knowledge_base": ["faq.pdf", "product-catalog.xlsx"],
  "workflow": { /* Visual workflow JSON */ },
  "platforms": ["telegram", "line"],
  "model_preference": "cost-optimized"
}
```

---

## 4.10 Observability Dashboard

Real-time agent thinking visualization — superior to both Hermes and OpenClaw.

```
┌─────────────────────────────────────────────────────────────┐
│  Observability — Live                            [Pause]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Execution Timeline ──────────────────────────────────┐│
│  │                                                       ││
│  │  00:00.0  ┌─ User message received                   ││
│  │  00:00.1  ├─ Classifying intent...          ✓ 0.1s  ││
│  │  00:00.2  ├─ Model routed: GPT-4o-mini      ✓       ││
│  │  00:00.3  ├─ Checking semantic cache...      ✓ 0.2s  ││
│  │  00:00.5  │  Cache MISS — calling LLM                ││
│  │  00:00.6  ├─ LLM call (streaming)...        ⟳ ...   ││
│  │  00:01.8  │  Tool call: web_search          ⟳ ...   ││
│  │  00:03.0  │  Tool result: 5 results         ✓ 1.2s  ││
│  │  00:03.1  ├─ LLM call (with context)...     ⟳ ...   ││
│  │  00:04.5  │  Response generated             ✓ 1.4s  ││
│  │  00:04.6  └─ Saving to memory...            ✓ 0.1s  ││
│  │                                                       ││
│  └───────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Resource Usage ──────────────────────────────────────┐│
│  │                                                       ││
│  │  Token Budget: ████████░░ 82% (8,200/10,000)         ││
│  │  ├─ System: 1,200 (cached)                           ││
│  │  ├─ Memory: 800                                      ││
│  │  ├─ History: 3,200                                   ││
│  │  └─ Available: 1,800                                 ││
│  │                                                       ││
│  │  Cost This Turn: $0.003 (saved $0.008 via routing)   ││
│  │  Model: GPT-4o-mini → Claude Sonnet (fallback)       ││
│  │  Cache Hit Rate: 34% (session avg)                   ││
│  └───────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Thinking Process (Chain of Thought) ─────────────────┐│
│  │                                                       ││
│  │  1. User asks about competitor pricing                ││
│  │  2. Need to search web for current data               ││
│  │  3. Found 5 results — extracting pricing info         ││
│  │  4. Comparing: A=$29, B=$49, C=$39                    ││
│  │  5. User is in Thai market — convert to THB           ││
│  │  6. Generating summary table                          ││
│  │                                                       ││
│  └───────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 4.11 Export/Import Agent Configs

Share agent configurations between users.

```
Export Formats:
├── .nexus (full agent config + workflow + knowledge refs)
├── .json (config only, no knowledge base)
└── .workflow (workflow only)

Import:
├── Drag & drop .nexus file → agent ready
├── Import from URL (community shared)
└── Import from template library

Sharing:
├── Export → share link → others import
├── Publish to template library (community)
└── Version control (track config changes)
```

**Security:** API keys are NEVER exported. Keys must be re-entered on import.

---

## 4.12 Offline Mode (Ollama Auto-Switch)

Work without internet using local models.

```
┌─────────────────────────────────────────────────────┐
│  Connection Status                                  │
│                                                     │
│  ☁️ Online — Using: Claude Sonnet (API)             │
│  🏠 Offline — Using: Ollama (local)                 │
│  🔄 Auto-Switch: Enabled                            │
│                                                     │
│  Local Models Available:                            │
│  ├── llama3.2:8b (2.1 GB) — General purpose        │
│  ├── codellama:7b (1.8 GB) — Code generation       │
│  └── gemma2:4b (1.2 GB) — Fast + lightweight       │
│                                                     │
│  [Configure Ollama]  [Download Models]              │
└─────────────────────────────────────────────────────┘
```

**Auto-Switch Logic:**
1. Internet available → use cloud provider
2. Internet lost → auto-switch to Ollama
3. Internet restored → auto-switch back to cloud
4. User can force local mode in settings

---

## 4.13 Multi-Agent Visual Workflow

Run multiple agents collaborating on complex tasks.

```
┌─────────────────────────────────────────────────────────────┐
│  Multi-Agent Workflow                               [Run]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ AGENT A  │───→│ AGENT B  │───→│ AGENT C  │             │
│  │          │    │          │    │          │             │
│  │ Research │    │ Analyze  │    │ Write    │             │
│  │ Specialist│   │ Data     │    │ Report   │             │
│  │          │    │ Analyst  │    │ Writer   │             │
│  │ Model:   │    │ Model:   │    │ Model:   │             │
│  │ GPT-4o   │    │ Sonnet   │    │ GPT-4o   │             │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│       │               │               │                     │
│  ┌────▼─────┐    ┌────▼─────┐    ┌────▼─────┐             │
│  │ Search   │    │ Process  │    │ Generate │             │
│  │ 5 sources│    │ data     │    │ PDF      │             │
│  │ Web + DB │    │ Charts   │    │ Email    │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│                                                             │
│  [Agent Palette]                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
│  │Research│ │Analysis│ │Writing │ │Custom  │              │
│  │Agent   │ │Agent   │ │Agent   │ │Agent   │              │
│  └────────┘ └────────┘ └────────┘ └────────┘              │
│                                                             │
│  Execution Log:                                             │
│  Agent A: Searching "AI market 2026"... ✓ 3 results       │
│  Agent B: Processing data... ⟳ ...                         │
│  Agent C: Waiting for Agent B...                            │
└─────────────────────────────────────────────────────────────┘
```

**Multi-Agent Features:**
- Visual agent-to-agent connections
- Parallel execution (agents run simultaneously)
- Sequential pipelines (output of A → input of B)
- Shared memory pool (agents share context)
- Cost tracking per agent
- Failure isolation (one agent fails → others continue)

---

## 4.14 Prompt Engineering Assistant

Help users write better prompts.

```
┌─────────────────────────────────────────────────────┐
│  Prompt Assistant                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Your prompt:                                       │
│  "สร้าง bot ตอบคำถามลูกค้า"                         │
│                                                     │
│  Suggestions:                                       │
│  ┌─────────────────────────────────────────────────┐│
│  │ 💡 Improved prompt:                             ││
│  │                                                 ││
│  │ "You are a customer support agent for           ││
│  │ [บริษัท]. Always respond in Thai. Be friendly   ││
│  │ but professional. If you don't know the answer, ││
│  │ say 'ขอโทษค่ะ ต้องตรวจสอบข้อมูลก่อน' and        ││
│  │ escalate to human support. Never make up        ││
│  │ information about pricing or policies."         ││
│  │                                                 ││
│  │ [Use This]  [Customize]  [More Suggestions]     ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Tips:                                              │
│  • Specify language explicitly                      │
│  • Define fallback behavior                         │
│  • Set boundaries (what NOT to do)                  │
│  • Include examples of good responses               │
└─────────────────────────────────────────────────────┘
```

---

## 4.15 A/B Testing

Test different prompts/models on the same task.

```
┌─────────────────────────────────────────────────────┐
│  A/B Test: Customer Support Response                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Test Input: "สินค้ามี warranty กี่เดือน?"           │
│                                                     │
│  ┌─ Variant A ─────────────────────────────────────┐│
│  │ Model: GPT-4o-mini                              ││
│  │ Prompt: formal, professional                    ││
│  │ Response: "สินค้ามี warranty 12 เดือนค่ะ..."     ││
│  │ Tokens: 145 │ Cost: $0.0001 │ Time: 0.8s       ││
│  │ Quality: ⭐⭐⭐⭐ (user rated)                    ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ Variant B ─────────────────────────────────────┐│
│  │ Model: Claude Sonnet                            ││
│  │ Prompt: casual, friendly                        ││
│  │ Response: " warranty 1 ปีเลยค่ะ! ..."            ││
│  │ Tokens: 189 │ Cost: $0.003 │ Time: 1.2s        ││
│  │ Quality: ⭐⭐⭐⭐⭐ (user rated)                   ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Winner: Variant B (higher quality, acceptable cost)│
│  [Apply Winner to Production]                       │
└─────────────────────────────────────────────────────┘
```

---

## 4.16 Usage Analytics Dashboard

Track patterns, costs, and optimize usage.

```
┌─────────────────────────────────────────────────────┐
│  Analytics — Last 7 Days                    [Export]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Summary ───────────────────────────────────────┐│
│  │ Messages: 342        Total Cost: $4.20          ││
│  │ Avg Response: 2.1s   Tokens Used: 128K          ││
│  │ Cache Hit Rate: 34%  Savings: $12.40            ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ Cost Breakdown ────────────────────────────────┐│
│  │ GPT-4o-mini: 62% ($2.60) — saved $12.40        ││
│  │ Claude Sonnet: 31% ($1.30)                      ││
│  │ GPT-4o: 7% ($0.30)                              ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ Top Tasks ─────────────────────────────────────┐│
│  │ 1. Web search (45%)                             ││
│  │ 2. File operations (23%)                        ││
│  │ 3. Code execution (18%)                         ││
│  │ 4. Document analysis (14%)                      ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ Usage Chart ───────────────────────────────────┐│
│  │ $2 ┤                                            ││
│  │ $1 ┤    ██                                      ││
│  │ $0 ┤ ██ ██ ██ ██ ██ ██ ██                      ││
│  │    └─Mon─Tue─Wed─Thu─Fri─Sat─Sun─              ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

## 4.17 Plugin System (Extend Nexus)

Developers can extend Nexus itself.

```
Plugin Types:
├── 🎨 Theme Plugin — custom UI themes
├── 🔌 Provider Plugin — LM Studio, vLLM, custom endpoints
├── 🛠️ Tool Plugin — custom tools (API integrations)
├── 📱 Platform Plugin — custom messaging platforms
├── 🧩 Workflow Plugin — custom workflow blocks
└── 📊 Analytics Plugin — custom dashboards

Plugin API:
├── Nexus SDK (TypeScript)
├── Plugin manifest (nexus-plugin.json)
├── Sandboxed execution (iframe isolation)
├── Auto-update via marketplace
└── Version compatibility checks

Marketplace:
├── Browse plugins by category
├── Install with one click
├── Rate and review
└── Verified badge for trusted plugins
```

---

## 4.18 Self-Improvement Engine (MEMORY + SKILL AUTONOMY)

**The agent learns, reflects, and creates its own skills — like Hermes but automated.**

```
┌─────────────────────────────────────────────────────────────┐
│              SELF-IMPROVEMENT ENGINE                        │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ EXECUTE  │───→│ REFLECT  │───→│ EXTRACT  │             │
│  │          │    │          │    │          │             │
│  │ ทำ task  │    │ วิเคราะห์│    │ สกัด    │             │
│  │ ตามปกติ  │    │ ผลลัพธ์  │    │ procedure│             │
│  └──────────┘    └──────────┘    └────┬─────┘             │
│       ↑                               │                     │
│       │          ┌──────────┐    ┌────▼─────┐             │
│       │          │ CORRECT  │←───│  STORE   │             │
│       │          │          │    │          │             │
│       │          │ เรียนรู้ │    │ บันทึก  │             │
│       │          │ จาก纠错   │    │ เป็น skill│             │
│       └──────────┴──────────┘    └──────────┘             │
│                                                             │
│  Loop: Execute → Reflect → Extract → Store → Execute...   │
└─────────────────────────────────────────────────────────────┘
```

### 5 Sub-systems

**1. Experience Collector**
```
ทุก task execution → บันทึก:
├── Input (user request)
├── Steps taken (tool calls, decisions)
├── Output (result)
├── Success/failure
├── User feedback (ถ้ามี)
└── Timestamp + context
```

**2. Pattern Detector**
```
วิเคราะห์ experience history:
├── "User ขอสิ่งนี้ 3 ครั้งแล้ว" → สร้าง skill
├── "Tool X fail → Tool Y work" → บันทึก fallback pattern
├── "User แก้ไขแบบนี้เสมอ" → ปรับ behavior
└── "Task นี้ใช้ steps เดิมทุกครั้ง" → สร้าง procedure
```

**3. Skill Synthesizer**
```
เมื่อ pattern ชัดเจน:
├── สร้าง SKILL.md อัตโนมัติ
├── ใส่ trigger conditions
├── ใส่ numbered steps
├── ใส่ pitfalls (จาก errors ที่เคยเจอ)
└── ทดสอบ skill → ถ้า work → บันทึก
```

**4. Correction Memory**
```
เมื่อ user แก้ไข:
├── บันทึก: "สิ่งที่ผิด" + "สิ่งที่ถูก"
├── Extract rule: "อย่าทำ X, ให้ทำ Y แทน"
├── Inject rule ใน context เมื่อเจอ situation คล้ายๆ
└── Confidence เพิ่มขึ้นทุกครั้งที่ rule ถูก validate
```

**5. Self-Evaluation Score**
```
ทุก session จบ → ให้คะแนนตัวเอง:
├── Task completion rate
├── User satisfaction (จาก feedback)
├── Error rate
├── Token efficiency
└── Skill reuse rate

→ ใช้ score ปรับ strategy ครั้งถัดไป
```

### Auto-Skill Creation Rules

| Pattern Detected | Action |
|---|---|
| Same task done 3+ times | Create procedure skill |
| User correction repeated 2+ times | Create correction rule |
| Tool fallback pattern (X fail → Y work) | Create recovery skill |
| Multi-step task completed successfully | Create workflow skill |
| User praises a specific approach | Reinforce that pattern |

---

## 4.19 Knowledge Base — Universal Connectors

**Connect to ANY knowledge source — local files, Notion, Obsidian, Google Drive, and more.**

```
┌─────────────────────────────────────────────────────────────┐
│  Knowledge Sources                                  [+ Add] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Local Files ─────────────────────────────────────────┐│
│  │                                                        ││
│  │  📁 C:\Users\Euro\Documents        🟢 Connected       ││
│  │  📁 C:\Users\Euro\Desktop\projects 🟢 Connected       ││
│  │  📁 D:\Work                       🟢 Connected       ││
│  │                                                        ││
│  │  Auto-index: watches for file changes                  ││
│  │  Supported: PDF, DOCX, XLSX, TXT, MD, CSV, JSON      ││
│  │  [Add Folder]  [Configure Filters]                     ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Notion ──────────────────────────────────────────────┐│
│  │                                                        ││
│  │  🔗 Notion Workspace           🟢 Connected           ││
│  │  Pages: 142 indexed │ Databases: 8 indexed            ││
│  │  Last sync: 2 minutes ago                             ││
│  │                                                        ││
│  │  [Connect Notion]  [Select Pages]  [Sync Now]         ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Obsidian ────────────────────────────────────────────┐│
│  │                                                        ││
│  │  🔗 Vault: C:\Users\Euro\obsidian-vault  🟢 Connected ││
│  │  Notes: 320 indexed │ Tags: 45                         ││
│  │  Last sync: 5 minutes ago                             ││
│  │                                                        ││
│  │  [Connect Vault]  [Select Folders]  [Sync Now]        ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ More Sources ────────────────────────────────────────┐│
│  │                                                        ││
│  │  [Google Drive]  [GitHub]  [Confluence]  [Slack]       ││
│  │  [Airtable]  [Supabase]  [Custom API]  [MCP Server]   ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Unified Search ──────────────────────────────────────┐│
│  │                                                        ││
│  │  🔍 Search across ALL knowledge sources...             ││
│  │                                                        ││
│  │  Results:                                              ││
│  │  📄 Q3 Revenue Report (Notion) — relevance: 0.95      ││
│  │  📁 revenue-q3.xlsx (Local) — relevance: 0.92         ││
│  │  📝 Meeting Notes 2026-06-15 (Obsidian) — 0.88       ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Connector Architecture

```
┌─────────────────────────────────────────────────┐
│         KNOWLEDGE CONNECTOR ENGINE              │
│                                                 │
│  ┌─────────────┐  ┌─────────────┐              │
│  │ Local Files │  │  Notion API │              │
│  │ (watcher)   │  │  (sync)     │              │
│  └──────┬──────┘  └──────┬──────┘              │
│         │                │                      │
│  ┌──────▼──────┐  ┌──────▼──────┐              │
│  │ File        │  │ Notion      │              │
│  │ Extractor   │  │ Extractor   │              │
│  │ (PDF/DOCX/  │  │ (pages/DBs) │              │
│  │  XLSX/TXT)  │  │             │              │
│  └──────┬──────┘  └──────┬──────┘              │
│         │                │                      │
│  ┌──────▼────────────────▼──────┐              │
│  │      Unified Chunker         │              │
│  │  (text → chunks → embeddings)│              │
│  └──────────────┬───────────────┘              │
│                 │                                │
│  ┌──────────────▼───────────────┐              │
│  │    sqlite-vec Vector Store   │              │
│  │  (unified index across ALL   │              │
│  │   knowledge sources)         │              │
│  └──────────────────────────────┘              │
│                                                 │
│  ┌──────────────────────────────┐              │
│  │      Obsidian Connector      │              │
│  │  (vault path → read .md      │              │
│  │   files → preserve wikilinks │              │
│  │   → index tags + links)      │              │
│  └──────────────────────────────┘              │
└─────────────────────────────────────────────────┘
```

### Notion Connector Details

```
Authentication: OAuth2 or Internal Integration Token
Sync Strategy:
├── Full sync on connect (index all selected pages)
├── Incremental sync every 5 minutes (only changed pages)
└── Manual sync via "Sync Now" button

Data Extracted:
├── Page content (blocks → markdown)
├── Database rows (each row as separate chunk)
├── Properties/metadata (tags, dates, relations)
└── Comments (optional)

Limitations:
├── API rate limit: 3 requests/second
├── Max page size: 100 blocks per request
└── Files/images: metadata only (not content)
```

### Obsidian Connector Details

```
Authentication: Local file system access (no API key needed)
Sync Strategy:
├── File watcher (inotify/FSEvents) for real-time changes
├── Full re-scan on connect
└── Incremental updates on file save

Data Extracted:
├── Markdown content (.md files)
├── Frontmatter (YAML metadata)
├── Wikilinks ([[page-name]]) → graph relationships
├── Tags (#tag) → categorical index
├── Embeds (![[file]]) → referenced content
└── Folder structure → hierarchical organization

Special Features:
├── Wikilink resolution (follow links for deeper context)
├── Graph-based relevance (connected notes score higher)
├── Tag-based filtering
└── Vault switching (multiple vaults supported)
```

---

## 4.20 MCP (Model Context Protocol) Integration

**Connect to any MCP server for unlimited tool expansion.**

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Servers                                        [+ Add] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Connected Servers ────────────────────────────────────┐│
│  │                                                        ││
│  │  🟢 filesystem-server                                  ││
│  │     Type: stdio │ Tools: 8 │ Status: healthy          ││
│  │     [Configure] [Disconnect] [Test]                    ││
│  │                                                        ││
│  │  🟢 github-server                                      ││
│  │     Type: stdio │ Tools: 12 │ Status: healthy         ││
│  │     [Configure] [Disconnect] [Test]                    ││
│  │                                                        ││
│  │  🟢 postgres-server                                    ││
│  │     Type: stdio │ Tools: 6 │ Status: healthy          ││
│  │     [Configure] [Disconnect] [Test]                    ││
│  │                                                        ││
│  │  🔴 slack-server                                       ││
│  │     Type: HTTP │ Tools: 15 │ Status: disconnected     ││
│  │     [Reconnect] [Remove]                               ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Add MCP Server ──────────────────────────────────────┐│
│  │                                                        ││
│  │  Transport: [stdio ▼]  [HTTP/SSE ▼]                   ││
│  │                                                        ││
│  │  stdio:                                                ││
│  │  Command: [npx -y @modelcontextprotocol/server-... ]   ││
│  │  Args: [                                               ││
│  │  Env: [KEY=value                                       ]││
│  │                                                        ││
│  │  HTTP:                                                 ││
│  │  URL: [https://mcp-server.example.com/sse        ]    ││
│  │  Auth: [Bearer token ▼]                                ││
│  │                                                        ││
│  │  [Test Connection]  [Add Server]                       ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Tool Discovery ──────────────────────────────────────┐│
│  │                                                        ││
│  │  Available tools from connected servers:               ││
│  │                                                        ││
│  │  filesystem-server:                                    ││
│  │  ├── read_file (read file contents)                    ││
│  │  ├── write_file (write to file)                        ││
│  │  ├── list_directory (list folder contents)             ││
│  │  └── search_files (search by pattern)                  ││
│  │                                                        ││
│  │  github-server:                                        ││
│  │  ├── create_issue (create GitHub issue)                ││
│  │  ├── list_repos (list repositories)                    ││
│  │  └── create_pr (create pull request)                   ││
│  │                                                        ││
│  │  [Enable All]  [Enable Selected]  [Refresh]            ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─ Marketplace ─────────────────────────────────────────┐│
│  │                                                        ││
│  │  Popular MCP Servers:                                  ││
│  │  ├── @modelcontextprotocol/server-filesystem    ⭐ 4.9││
│  │  ├── @modelcontextprotocol/server-github        ⭐ 4.8││
│  │  ├── @modelcontextprotocol/server-postgres      ⭐ 4.7││
│  │  ├── @modelcontextprotocol/server-slack         ⭐ 4.6││
│  │  ├── @modelcontextprotocol/server-brave-search  ⭐ 4.5││
│  │  └── @modelcontextprotocol/server-memory        ⭐ 4.4││
│  │                                                        ││
│  │  [Browse All]  [Search]  [My Servers]                  ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### MCP Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP CLIENT (Nexus)                       │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  stdio      │  │  HTTP/SSE   │  │  Discovery  │        │
│  │  Transport  │  │  Transport  │  │  (auto-detect│        │
│  │  (subprocess)│ │  (fetch)    │  │   servers)  │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                 │
│  ┌──────▼────────────────▼────────────────▼──────┐        │
│  │              MCP Protocol Handler              │        │
│  │  • JSON-RPC 2.0 message framing               │        │
│  │  • Tool discovery (tools/list)                 │        │
│  │  • Tool execution (tools/call)                 │        │
│  │  • Resource access (resources/read)            │        │
│  │  • Prompt templates (prompts/get)              │        │
│  └──────────────────────┬────────────────────────┘        │
│                         │                                  │
│  ┌──────────────────────▼────────────────────────┐        │
│  │              Tool Registry Bridge              │        │
│  │                                                │        │
│  │  MCP tools → Nexus tool format → Agent can use │        │
│  │  • Auto-convert MCP schema to Nexus schema     │        │
│  │  • Sandbox MCP tools (like built-in tools)     │        │
│  │  • Rate limit per MCP server                   │        │
│  │  • Audit log all MCP tool calls                │        │
│  └────────────────────────────────────────────────┘        │
│                                                             │
│  ┌────────────────────────────────────────────────┐        │
│  │              MCP Server Manager                │        │
│  │                                                │        │
│  │  • Start/stop server processes                 │        │
│  │  • Health monitoring (ping every 30s)          │        │
│  │  • Auto-restart on crash                       │        │
│  │  • Connection pooling (HTTP)                   │        │
│  │  • Version compatibility check                 │        │
│  └────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### MCP Features

| Feature | Description |
|---|---|
| **Auto-Discovery** | Scan for MCP servers in config, npm global, PATH |
| **Hot-Reload** | Add/remove servers without restarting Nexus |
| **Tool Bridging** | MCP tools appear as native Nexus tools to the agent |
| **Sandbox** | MCP tool calls go through same sandbox as built-in tools |
| **Marketplace** | Browse and install popular MCP servers |
| **Health Check** | Monitor server status, auto-reconnect on failure |
| **Audit Log** | All MCP tool calls logged with full context |
| **Rate Limiting** | Per-server rate limits to prevent abuse |

### MCP vs Built-in Tools

```
Agent sees unified tool list:
├── Built-in: web_search, file_ops, terminal, code_exec
├── MCP: filesystem.read_file, github.create_issue, postgres.query
└── Plugin: custom_api_call, specialized_tool

→ Agent doesn't know/care which source provides the tool
→ All tools go through same sandbox + audit + approval system
```

---

## 5. What Makes Nexus Different

### vs Hermes Agent

| Feature | Hermes | Nexus |
|---------|--------|-------|
| Interface | Terminal CLI | **Desktop GUI** |
| Setup | config.yaml + .env + CLI | **3-click wizard** |
| Memory | 2.2K char limit | **Unlimited (local vectors, sqlite-vec)** |
| Context | Compaction (loses info) | **Smart retrieval + summarization** |
| Error recovery | Manual | **Auto-fallback chain** |
| Token tracking | Basic | **Real-time budget + alerts** |
| Platform setup | CLI config | **One-click wizards** |
| Security | Approval prompts | **Governance dashboard** |
| Workflow | Text-based prompts | **Visual drag-and-drop** |
| Multi-agent | delegate_task (code) | **Visual multi-agent canvas** |
| Templates | 150+ skills (confusing) | **Pre-built templates (30s setup)** |
| Observability | Basic logging | **Live execution timeline** |
| Offline | Not supported | **Ollama auto-switch** |
| Sharing | Config files | **Export/import .nexus** |
| Extensibility | Python skills | **Plugin marketplace** |
| Self-improvement | Manual skill creation | **Auto skill creation from experience** |
| Knowledge | Upload docs only | **Local + Notion + Obsidian + MCP** |
| MCP | Supported | **Built-in + marketplace** |

### vs OpenClaw

| Feature | OpenClaw | Nexus |
|---------|----------|-------|
| Interface | Terminal | **Desktop GUI** |
| Setup | npm install + configure | **Download + 3 clicks** |
| Security | None | **Built-in governance** |
| Skills | Unverified marketplace | **Sandboxed + rated** |
| Memory | None built-in | **4-layer memory system** |
| Reliability | You debug | **Self-healing** |
| Governance | None | **Approval workflows + audit** |
| Production | DIY | **Built-in monitoring** |
| Workflow | Text-based | **Visual builder** |
| Multi-agent | Manual orchestration | **Visual collaboration** |
| Templates | Community (unvetted) | **Curated + rated** |
| Cost control | None | **Token budget + routing** |
| Offline | Not supported | **Ollama auto-switch** |
| Observability | Console logs | **Live timeline** |
| A/B Testing | Not supported | **Built-in testing** |
| Self-improvement | None | **Auto skill creation** |
| Knowledge | Upload only | **Local + Notion + Obsidian + MCP** |
| MCP | Not supported | **Built-in + marketplace** |

---

## 6. Project Structure

```
nexus/
├── src-tauri/                    # Rust core (Tauri)
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── commands/             # IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── agent.rs          # Agent control commands
│   │   │   ├── config.rs         # Settings/config commands
│   │   │   ├── platform.rs       # Platform connector commands
│   │   │   └── skill.rs          # Skill management commands
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── models.rs         # Database models
│   │   │   └── migrations/       # SQL migrations
│   │   ├── crypto.rs             # API key encryption (OS keychain)
│   │   ├── sidecar.rs            # TS engine sidecar manager (spawn + JSON-RPC)
│   │   └── watcher.rs            # File system watcher
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                          # React UI
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── chat/
│   │   │   ├── ChatConsole.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ToolExecution.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── onboarding/
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── ProviderPicker.tsx
│   │   │   ├── ApiKeyInput.tsx
│   │   │   └── AgentSetup.tsx
│   │   ├── agent-builder/
│   │   │   ├── PersonalityConfig.tsx
│   │   │   ├── CapabilitiesToggle.tsx
│   │   │   ├── KnowledgeBase.tsx
│   │   │   └── PlatformConnectors.tsx
│   │   ├── settings/
│   │   │   ├── ProviderSettings.tsx
│   │   │   ├── SecuritySettings.tsx
│   │   │   └── AdvancedSettings.tsx
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       └── StatusBadge.tsx
│   ├── hooks/
│   │   ├── useAgent.ts
│   │   ├── useChat.ts
│   │   ├── useConfig.ts
│   │   └── usePlatform.ts
│   ├── lib/
│   │   ├── tauri.ts               # Tauri IPC wrappers
│   │   ├── types.ts               # TypeScript types
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
│
├── engine/                       # TypeScript Agent Engine (Node/Bun sidecar)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.ts               # Sidecar entry point (JSON-RPC over stdio)
│   │   ├── ipc/
│   │   │   └── rpc.ts            # JSON-RPC handler ↔ Rust core
│   │   ├── router/
│   │   │   ├── modelRouter.ts    # Smart model selection
│   │   │   └── providerPool.ts   # Multi-provider management (Vercel AI SDK)
│   │   ├── context/
│   │   │   ├── contextEngine.ts  # 4-layer memory system
│   │   │   ├── episodic.ts       # Conversation history (sqlite-vec)
│   │   │   ├── semantic.ts       # Facts + preferences
│   │   │   └── procedural.ts     # Skills
│   │   ├── db/
│   │   │   ├── sqlite.ts         # better-sqlite3 connection + migrations
│   │   │   └── vectors.ts        # sqlite-vec search
│   │   ├── tools/
│   │   │   ├── registry.ts       # Tool registration
│   │   │   ├── sandbox.ts        # Sandboxed execution
│   │   │   ├── web.ts            # Web search + extraction
│   │   │   ├── fileOps.ts        # File read/write
│   │   │   ├── terminal.ts       # Terminal commands
│   │   │   └── codeExec.ts       # Sandboxed JS execution
│   │   ├── mcp/
│   │   │   └── client.ts         # MCP client (@modelcontextprotocol/sdk)
│   │   ├── skills/
│   │   │   ├── loader.ts         # Skill loading
│   │   │   ├── marketplace.ts    # Community skills
│   │   │   └── executor.ts       # Skill execution
│   │   ├── healing/
│   │   │   └── selfHeal.ts       # Error recovery + fallback
│   │   └── platforms/
│   │       ├── telegram.ts
│   │       ├── discord.ts
│   │       ├── line.ts           # ports from the existing @line/bot-sdk code
│   │       └── base.ts           # Base platform class
│   └── tests/
│
├── docs/
│   ├── SPEC.md                   # This file
│   ├── ARCHITECTURE.md
│   ├── CONTRIBUTING.md
│   └── USER_GUIDE.md
│
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

---

## 7. MVP Scope (Phase 1)

### Must Have (MVP)
- [ ] Desktop app (Tauri) — download, install, run
- [ ] Onboarding wizard (3-click setup)
- [ ] Provider selection (**5 to start**: OpenAI, Anthropic, Google, OpenRouter, Ollama — the other 15+ are post-MVP)
- [ ] API key management (encrypted, OS keychain)
- [ ] Chat console (streaming, markdown, code blocks)
- [ ] Basic tools (web search, file ops, terminal, code exec)
- [ ] Memory system (conversation history + basic facts)
- [ ] Token usage tracking
- [ ] Settings page

### Should Have (Phase 2)
- [ ] Agent Builder (personality, capabilities, knowledge base)
- [ ] Document upload + RAG
- [ ] Platform connectors (Telegram, Discord)
- [ ] Self-healing engine
- [ ] Skill marketplace
- [ ] Governance dashboard (approval workflows, audit logs)

### Nice to Have (Phase 3)
- [ ] Multi-agent delegation
- [ ] Cron scheduler
- [ ] Voice (STT/TTS)
- [ ] Image generation
- [ ] Custom tool creation (visual)
- [ ] Team collaboration

---

## 8. Commands

```bash
# Development
cd nexus
npm install                    # Install JS deps (UI)
cd engine && npm install       # Install TS engine sidecar deps
cd .. && npm run tauri dev     # Start dev mode (Rust core spawns the sidecar)

# Build
npm run tauri build            # Build app + bundle the compiled sidecar

# Test
npm run test                   # UI tests (Vitest)
cd engine && npm test          # Engine tests (Vitest)
cd src-tauri && cargo test     # Rust core tests

# Lint
npm run lint                   # ESLint (UI + engine)
cd src-tauri && cargo clippy   # Rust lint
```

---

## 9. Code Style

### TypeScript (React UI)
```typescript
// Component style: functional, hooks-based, named exports
export function ChatConsole({ agentId }: ChatConsoleProps) {
  const { messages, sendMessage, isStreaming } = useChat(agentId);

  return (
    <div className="flex flex-col h-full bg-nexus-bg">
      {/* messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      {/* input */}
    </div>
  );
}
```

### TypeScript (Agent Engine sidecar)
```typescript
// Style: explicit types, discriminated unions for results, async/await
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  sandbox = true,
): Promise<ToolResult> {
  // Execute a tool with optional sandboxing.
  ...
}
```

### Rust (Tauri Core)
```rust
// Style: idiomatic Rust, Result types, structured errors
#[tauri::command]
async fn send_message(
    state: State<'_, AppState>,
    agent_id: String,
    content: String,
) -> Result<MessageResponse, AppError> {
    let engine = state.engine.lock().await;
    engine.send_message(&agent_id, &content).await
}
```

---

## 10. Testing Strategy

| Level | Framework | Location | Coverage |
|-------|-----------|----------|----------|
| Unit (UI) | Vitest + React Testing Library | `src/**/*.test.tsx` | 80% |
| Unit (Engine) | Vitest | `engine/**/*.test.ts` | 80% |
| Unit (Rust) | cargo test | `src-tauri/src/` | 70% |
| Integration | Playwright + tauri-driver (WebDriver) | `e2e/` | Core flows |
| Manual | Checklist | — | All features |

---

## 11. Boundaries

**Always:**
- Run tests before commits
- Use TypeScript strict mode (UI and engine sidecar) — no `any`
- Encrypt API keys (never plaintext)
- Sandboxed tool execution
- Audit log for destructive operations

**Ask First:**
- Adding new dependencies
- Changing database schema
- Modifying security-related code
- Adding new platform connectors

**Never:**
- Commit API keys or secrets
- Skip sandbox for tool execution
- Store API keys in config files (use OS keychain)
- Allow unverified community skills without sandbox
- Auto-execute destructive commands without approval

---

## 12. Success Criteria

1. **Setup Time:** User can go from download to first chat in < 2 minutes
2. **Zero Code:** No terminal commands needed for normal usage
3. **Memory:** Agent remembers user preferences across sessions
4. **Reliability:** Auto-fallback on provider errors (no manual intervention)
5. **Security:** All tool executions are logged and sandboxed
6. **Performance:** Chat response < 3 seconds (excluding LLM latency)
7. **Size:** Installer ~40–90MB — the Tauri shell (~5–10MB) plus a compiled TypeScript sidecar (Node/Bun). No embedded Python and no bundled model (embeddings use the provider API). Comfortably under an equivalent Electron build (~150MB+).

---

## 13. Data Model (SQLite Schema)

One SQLite database (`nexus.db`) in the OS app-data dir, owned by the TS sidecar via `better-sqlite3`; vectors via `sqlite-vec`. Migrations are versioned in `engine/src/db/migrations/` and applied on startup (`schema_version` in `settings`). **Secrets are never stored here — only opaque keychain references** (see §15).

```sql
-- App + agent config (JSON values)
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                 -- JSON
  updated_at INTEGER NOT NULL
);

-- Provider config only; the API key lives in the OS keychain
CREATE TABLE providers (
  id           TEXT PRIMARY KEY,            -- "openai", "anthropic", ...
  display_name TEXT NOT NULL,
  base_url     TEXT,                        -- for OpenAI-compatible/custom
  key_ref      TEXT,                        -- keychain alias, NOT the key
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);

CREATE TABLE agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT,
  tone          TEXT,
  language      TEXT DEFAULT 'en',
  system_prompt TEXT,
  model_pref    TEXT,                        -- cost|balanced|quality|<model id>
  capabilities  TEXT NOT NULL DEFAULT '{}',  -- JSON: {web:true,file:true,...}
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_conv_agent ON conversations(agent_id, updated_at);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,             -- system|user|assistant|tool
  content         TEXT NOT NULL,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_usd        REAL,
  model           TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);

-- Semantic memory (auto-extracted facts / preferences)
CREATE TABLE memory_facts (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT REFERENCES agents(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                  -- preference|fact|relationship
  content    TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_msg TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE documents (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT REFERENCES agents(id) ON DELETE CASCADE,
  source     TEXT NOT NULL,                  -- local|notion|obsidian|upload
  uri        TEXT NOT NULL,
  title      TEXT,
  hash       TEXT,                           -- content hash → change detection
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE TABLE document_chunks (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  text        TEXT NOT NULL,
  token_count INTEGER
);

-- Vector index (sqlite-vec virtual table; dim = embedding model's)
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id  TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);

-- Append-only audit log: every tool call + sensitive action
CREATE TABLE audit_log (
  id            TEXT PRIMARY KEY,
  ts            INTEGER NOT NULL,
  actor         TEXT NOT NULL,               -- agent id or "user"
  action        TEXT NOT NULL,               -- tool name / event
  args_redacted TEXT,                        -- JSON, secrets stripped
  result        TEXT,                        -- ok|error|denied
  approval      TEXT,                        -- auto|user_approved|user_denied
  duration_ms   INTEGER
);
CREATE INDEX idx_audit_ts ON audit_log(ts);

-- Platform connections (bot tokens in keychain; only refs here)
CREATE TABLE platform_connections (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT REFERENCES agents(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,                  -- telegram|discord|line|...
  mode       TEXT NOT NULL,                  -- live|relay
  token_ref  TEXT,                           -- keychain alias
  enabled    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Self-improvement experience log
CREATE TABLE experiences (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT REFERENCES agents(id) ON DELETE CASCADE,
  input      TEXT NOT NULL,
  steps      TEXT,                           -- JSON
  output     TEXT,
  success    INTEGER,
  feedback   TEXT,
  created_at INTEGER NOT NULL
);
```

**Conventions:** TEXT ids are UUIDv4/ULID; timestamps are epoch-ms integers; all writes go through the sidecar (the Rust core never writes the DB directly). Optional at-rest encryption (SQLCipher) is covered in §15.

---

## 14. IPC Contract (Rust Core ↔ TS Sidecar)

**Transport:** newline-delimited **JSON-RPC 2.0** over the sidecar's stdin/stdout (one UTF-8 JSON object per line — the MCP-stdio convention). The Rust core is the client; the TS engine is the server and also emits notifications for streaming. `stderr` is reserved for structured logs. Every request is validated with `zod` on the engine side and typed on the Rust side.

**Request/response methods:**

| Method | Params | Result |
|---|---|---|
| `engine.health` | — | `{ ok, version }` |
| `providers.test` | `{ providerId, keyRef }` | `{ ok, latencyMs, error? }` |
| `chat.send` | `{ conversationId, agentId, content, attachments? }` | `{ messageId, tokens, costUsd, model }` (streams `chat.*` meanwhile) |
| `chat.cancel` | `{ requestId }` | `{ cancelled }` |
| `memory.search` | `{ agentId, query, k }` | `{ results[] }` |
| `documents.ingest` | `{ agentId, uri }` | `{ documentId, chunks }` (streams progress) |
| `tools.list` | `{ agentId }` | `{ tools[] }` |
| `tools.approvalResult` | `{ requestId, approved }` | `{ ok }` |

**Notifications (engine → core → UI):** `chat.delta {requestId, token}`, `chat.toolCall {requestId, tool, argsRedacted}`, `chat.done {requestId}`, `tool.approvalRequest {requestId, tool, argsRedacted, level}`, `log {level, msg, fields}`.

**Streaming & cancellation:** every `chat.send` carries a client-generated `id`; all related notifications reference it as `requestId`; `chat.cancel` aborts that stream. Backpressure: the engine pauses generation when stdout writes block.

```jsonc
// core → engine
{"jsonrpc":"2.0","id":"req-1","method":"chat.send","params":{"conversationId":"c1","agentId":"a1","content":"hi"}}
// engine → core (stream)
{"jsonrpc":"2.0","method":"chat.delta","params":{"requestId":"req-1","token":"He"}}
{"jsonrpc":"2.0","method":"chat.delta","params":{"requestId":"req-1","token":"llo"}}
// engine → core (final)
{"jsonrpc":"2.0","id":"req-1","result":{"messageId":"m9","tokens":{"in":12,"out":30},"costUsd":0.0003,"model":"…"}}
```

**Errors:** standard JSON-RPC `error { code, message, data }` with a typed `data.kind`: `PROVIDER_ERROR | RATE_LIMIT | TOOL_DENIED | VALIDATION | CANCELLED | INTERNAL`. The Rust core maps these to user-facing messages (§4.6 / Task 23).

---

## 15. Security Architecture & Threat Model

> Security is **secure-by-default**: least privilege, explicit user consent for anything dangerous, and no secret ever leaving the device except to the user's chosen provider over TLS.

### 15.1 Trust boundaries

| Zone | Trust | Notes |
|---|---|---|
| WebView (React UI) | **Semi-trusted** | Renders model output + remote content → treat as an XSS surface |
| Rust core | **Trusted** | Sole owner of the OS keychain; broker for all secrets; enforces approvals |
| TS sidecar (engine) | **Trusted code, untrusted inputs** | Orchestrates; never persists secrets; validates all inputs |
| Tools / skills / plugins / MCP servers | **Untrusted** | Run sandboxed, capability-gated, audited |
| LLM provider, web, connected sources | **External** | Network egress; their content is untrusted data, not instructions |

### 15.2 Assets → threats → mitigations

| Asset | Threat | Mitigation |
|---|---|---|
| API keys / bot tokens | Exfiltration via logs, exports, prompt injection, or a malicious tool | Keychain-only; **never** in DB/config/logs/exports; redaction filter on all logs; keychain access is **core-only**, never exposed as an agent tool |
| User files & conversations | Agent tricked into reading/deleting/exfiltrating | Path-scoped file tools (user-approved roots only); destructive ops require explicit approval; egress allowlist |
| The user's machine | Code/terminal tool escapes to host | Sandboxed execution (§15.4) + approval + resource limits |
| Supply chain | Malicious community skill/plugin/MCP server | Default-deny permissions, declared-permission manifest, signature check for "verified", sandbox, audit |
| UI | XSS in rendered markdown/HTML → IPC abuse | Strict CSP, sanitize/escape model + remote content, no `dangerouslySetInnerHTML` on untrusted strings |
| Updates | Tampered installer/update | Signed releases + Tauri updater signature + checksum over HTTPS |

### 15.3 Secrets handling (concrete)

- The **Rust core is the keychain broker.** When the sidecar needs to call a provider, it requests the key *by `key_ref`* for that specific call; the core returns it; the sidecar holds it in memory only, uses it for the outbound TLS request, and never writes it anywhere.
- Keys are **never** placed in the model context, prompts, audit log, or `.nexus`/`.json` exports (exports store `key_ref` only — re-entry required on import, per §4.11).
- A global **redaction filter** strips anything matching known key/token shapes from every log line and every `argsRedacted` payload.

### 15.4 Tool governance & sandboxing

Every tool (built-in, skill, plugin, MCP) declares an **approval level**; destructive actions are decided by the **Rust core + user**, never by the model.

| Level | Examples | Behavior |
|---|---|---|
| **Safe** | web search, read file in approved root, memory search | Auto-run, audited |
| **Sensitive** | write/modify file, network POST, send platform message | Approval on first use per session (configurable), audited |
| **Destructive** | delete/overwrite, terminal command, code execution, spend | **Always** explicit user approval via `tool.approvalRequest`, audited |

**Sandbox by tool type:**
- **JS code-exec** → run in an `isolated-vm` V8 isolate with **no** host fs/network/`require`; only explicit inputs in, value out; CPU + memory + wall-clock caps.
- **File tools** → confined to user-approved root directories (allowlist); path traversal blocked; writes/deletes are Destructive.
- **Terminal** → child process in a working-dir jail, command allow/deny patterns, no shell metacharacter passthrough by default, Destructive approval, output truncated.
- **OS-level hardening (incremental):** Windows Job Objects/AppContainer, macOS `sandbox-exec`/App Sandbox entitlements, Linux `bubblewrap`/Landlock + seccomp. **MVP ships** with process isolation + path scoping + approval + resource limits; OS-level confinement is layered in during hardening.
- **MCP / plugins** → same sandbox + per-server rate limits + audit; install-time consent screen showing declared permissions; "verified" badge requires signature.

### 15.5 Prompt-injection defenses

Tool results, web pages, and documents are **data, not instructions**. The agent cannot escalate its own privileges from model output: capability gating means it can only call tools the user enabled; every Destructive action needs a human; secrets are never in context (so they can't be "leaked" by the model); network egress is allowlisted; and the keychain is not reachable via any tool.

### 15.6 Platform & app hardening

- **Tauri 2 capabilities/ACL:** expose the minimum command set; scope filesystem/shell permissions; validate every IPC argument (`zod`) on both sides.
- **WebView:** strict Content-Security-Policy; no remote code; sanitize all rendered untrusted content.
- **Data at rest:** DB + uploads live in the app-data dir; **optional** SQLCipher encryption (key in keychain) for users who want it.
- **Rate limiting & quotas:** per-tool and per-MCP-server; daily token/cost ceilings (§ token budget).
- **Audit:** append-only `audit_log` for every tool call and approval; exportable; local only.

---

## 16. Model Registry (Single Source of Truth)

Model names, context windows, prices, and capabilities live in **one config file** (`engine/src/router/models.json`) — **not** hardcoded in prose or logic. The router, cost estimator, and provider UI all read it. Prices/model names in this spec and in `TOKEN_OPTIMIZATION.md` are **illustrative**; the registry is authoritative and updatable without a code change (so it never goes stale).

```jsonc
{
  "openai:gpt-4o-mini": {
    "provider": "openai", "model": "gpt-4o-mini",
    "ctx": 128000, "inUsdPerM": 0.15, "outUsdPerM": 0.60,
    "caps": ["tools", "vision"], "tier": "cheap", "updatedAt": "2026-06-28"
  },
  "anthropic:claude-haiku": {
    "provider": "anthropic", "model": "<current-haiku-id>",
    "ctx": 200000, "inUsdPerM": 0.80, "outUsdPerM": 4.00,
    "caps": ["tools"], "tier": "cheap", "updatedAt": "2026-06-28"
  }
  // …mid / premium tiers, per provider
}
```

> **Maintenance note:** model IDs and prices change often. Keep `models.json` current; do not re-embed specific model names in code. The default tiers (cheap / balanced / quality) map to registry entries, so swapping a model is a config edit.

---

## 17. Privacy & Telemetry

- **No data leaves the device** except: (a) requests to the user's chosen LLM provider (their key, over TLS), (b) sources the user explicitly connects, (c) an optional self-hosted/managed relay the user opts into (§4.7).
- **Telemetry is off / none by default.** Any future crash reporting is **opt-in**, anonymized, and documented; never includes conversation content or secrets.
- **User data control:** view / export / delete all data; "clear memory" per agent; everything lives in one known app-data directory.
- **Exports never include secrets** (keys/tokens) — only `key_ref` placeholders.
- Because the project operates no servers and holds no user data, there is no project-side PII to breach — privacy is a structural property, not a policy promise.

---

## 18. Internationalization (i18n)

Thai is a first-class target persona, so this is not optional. UI strings are externalized (i18next or react-intl); **Thai + English ship at launch**. Per-agent response language is configurable (independent of UI language). Locale-aware number/date/currency formatting (incl. THB). No RTL needed for Thai.

---

## 19. Production-Readiness — Definition of Done

A feature/release is "production-ready" only when:

- [ ] DB migrations apply cleanly forward; rollback/repair path tested
- [ ] IPC conforms to §14 (contract tests for each method + streaming + cancellation)
- [ ] **No secret** appears in any log, audit entry, or export (automated check)
- [ ] Sandbox tested against escape attempts (path traversal, network egress, host access from code-exec)
- [ ] Destructive tools cannot run without explicit approval (tested)
- [ ] Input validation (`zod`) on every IPC method and tool argument
- [ ] Provider fallback + rate-limit retry verified end-to-end
- [ ] Crash recovery: sidecar auto-restarts, app restores last state
- [ ] Installers signed; update signature verified
- [ ] Accessibility pass (keyboard nav, focus, contrast) + i18n strings externalized
- [ ] Test coverage targets met (§10); core flows have e2e tests

---

## 20. Open Questions (with recommended resolutions)

1. **Name:** "Nexus" is the working title — open to suggestions.
2. **License:** **MIT recommended** (maximally open, simplest for adoption) unless patent protection is a priority → Apache 2.0.
3. **Distribution:** **GitHub Releases for v0.1**; add winget/brew once installers are signed and stable.
4. **Local model support:** **Ollama in MVP** as a provider option + offline auto-switch (§4.12); LM Studio/vLLM post-MVP.
5. **Monetization:** **Free + open-source core**; the only paid surface is the optional managed always-on relay (§4.7), which funds its own servers. No subsidizing free users' compute (Core Design Principle, §1).

---

*This spec is a living document. Update when decisions change. Commit alongside code.*
