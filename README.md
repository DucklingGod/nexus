<div align="center">

<img src="assets/banner.png" alt="Nexus — AI Agent Platform" width="100%">

# Nexus

**The open-source desktop AI agent platform for everyone.**

Build, customize, and run capable AI agents in under 2 minutes — no terminal required. Runs natively on **macOS, Windows, and Linux**.

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg?style=flat-square&color=c8a24e)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri_2.x-Rust-blue?style=flat-square&logo=tauri)](https://tauri.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![GitHub Stars](https://img.shields.io/github/stars/DucklingGod/nexus?style=flat-square&logo=github)](https://github.com/DucklingGod/nexus)

</div>

---

## What is Nexus?

Nexus is a **local-first desktop AI agent platform** built with Tauri 2 (Rust shell) and React (TypeScript). It gives non-technical users a working AI agent through a polished GUI — no CLI, no config files, no cloud dependency. Under the hood it's a full agent runtime: tools, memory, skills, visual workflows, sub-agent orchestration, and MCP.

**Core principles:**
- **Local-first** — everything runs on your machine
- **Bring your own key** — you pay for your own API usage; zero hosting fees
- **Privacy by default** — API keys live in your OS keychain, never in files
- **No always-on promise** — your data stays yours

## Quick Start

1. **Download** the latest build for your OS from [Releases](https://github.com/DucklingGod/nexus/releases) (or [build from source](#building-from-source)).
2. **Launch & connect** — a 3-click onboarding wizard:
   1. Pick a provider (OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Ollama, LM Studio, and more)
   2. Paste your API key (stored encrypted in the OS keychain)
   3. Name your agent
3. **Start building** — chat, upload documents for RAG, wire up a visual workflow, or connect an MCP server.

## Features

### Chat & intelligence
- **Streaming responses** with markdown (code, tables, lists) and **reasoning streaming** (OpenAI o-series, Claude extended thinking, DeepSeek R1)
- **14+ providers** via direct keys, plus an **OpenRouter hub** for 300+ models including **free models**
- **Smart model routing** (heuristic complexity classifier → cheapest capable model)
- **Semantic cache** (repeat questions answered at $0, cosine ≥ 0.95) and **prompt caching** (Anthropic `cache_control`)
- **Onboarding + self-awareness** — the agent introduces itself and knows its own tools/capabilities
- **Observability** — a per-reply model + token chip, plus a live **Logs** tab (Settings → Logs)

### Tools & capabilities (40+ built-in)
- Web search (DuckDuckGo free / Tavily / Brave / SearXNG), file ops, terminal, code execution, patch, process, to-dos
- **Browser automation**, **media tools** (image generation, text-to-speech), **scheduler (cron)**, **session search**, **Kanban board**
- **MCP client** — connect any Model Context Protocol server (stdio / SSE) and the agent instantly gains its tools
- **Plugin system** — drop in JS/TS plugins to add tools dynamically
- **Tool approval** — 4 safety modes: *ask* (confirm changes), *auto* (file edits auto), *plan* (no changes), *full* (run everything)

### Sub-agent orchestration
- `delegate_task` — spin up an autonomous sub-agent with its own tool loop
- `delegate_batch` — **parallel fan-out** (run independent sub-tasks concurrently)
- Toolset sandboxing (safe / research / code / web / full), model override, and per-task token tracking

### Agent builder & skills
- Visual customization — name, role, personality, custom instructions; per-agent capability toggles
- **60 built-in skills** across 8 categories, plus custom skills
- **Hermes skill import** (parse `SKILL.md`) and `install_skills` — the agent installs skills straight from a GitHub repo
- **Skill synthesizer** — the agent learns new skills from finished tasks (opt-in), with semantic skill matching

### Persistent memory (grows with you)
- **Episodic** (conversation history) + **semantic** (vector) memory in SQLite
- A transparent **`.md` context layer** — `rules`, `soul`, `user`, `memory`, `context` — injected every turn and editable in Settings → Context
- **Auto-extract** — a background pass distills durable facts into memory after each chat (default on); the `remember` tool lets the agent write/prune it itself

### Knowledge & RAG
- Upload PDF / DOCX / XLSX / CSV / TXT / MD → extract → chunk → embed → vector search
- **Watched folders** — point Nexus at a folder and it auto-indexes new/changed files

### Visual workflows
- Drag-and-drop **React Flow** canvas, 4 block types (trigger / agent / tool / output)
- **Execution engine** (topological order, data flow between blocks, live per-node status) + template library

### Productivity & experimentation
- **A/B testing** — run one prompt through two models side-by-side and pick a winner
- **Prompt assistant** — one click rewrites your prompt to be clearer and more specific
- **Export / import agent** — share personality + settings + skills + context as a JSON bundle (never your keys)

### Platform connectors
- **Telegram** (long-poll) and **Discord** (Gateway WebSocket) — Live mode, no webhook/public URL needed
- Remote messages run with **safe tools only**; a typing indicator shows while the agent works, and those chats appear in the sidebar

### Desktop experience
- **Tauri 2** — ~12 MB native app (vs Electron's ~200 MB)
- Frameless window, premium dark + gold theme, customizable **Space FX**, a **panic/abort** button, and i18n (incl. Thai)

## Architecture

```
┌──────────────────────────────────────────────┐
│  Tauri 2 Shell (Rust)                          │
│  ┌────────────────────────────────────────┐    │
│  │  React 19 + TypeScript + Tailwind v4   │    │
│  │  WebView: WebKit (macOS) · WebView2    │    │
│  │  (Windows) · WebKitGTK (Linux)         │    │
│  └───────────────┬────────────────────────┘    │
│                  │ JSON-RPC over stdio          │
│  ┌───────────────▼────────────────────────┐    │
│  │  TypeScript Agent Engine (sidecar)      │    │
│  │  ├─ Provider router (14+ providers)     │    │
│  │  ├─ Agent loop (LLM → tool → result)    │    │
│  │  ├─ Tool registry (40+ tools)           │    │
│  │  ├─ Sub-agent orchestrator (delegate)   │    │
│  │  ├─ MCP client + plugin loader          │    │
│  │  ├─ Memory (episodic + semantic + .md)  │    │
│  │  ├─ RAG (extract → chunk → embed)       │    │
│  │  ├─ Skills (60 built-in + synthesizer)  │    │
│  │  ├─ Workflow executor · scheduler       │    │
│  │  └─ Connectors (Telegram · Discord)     │    │
│  └───────────────┬────────────────────────┘    │
│                  │                              │
│  ┌───────────────▼────────────────────────┐    │
│  │  SQLite + sqlite-vec                     │    │
│  └────────────────────────────────────────┘    │
│  OS keychain — API keys (brokered in Rust)      │
└──────────────────────────────────────────────┘
```

The API key never reaches the WebView: the React UI passes only a provider id, and the Rust core brokers the key from the OS keychain into the engine over stdio.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Shell | [Tauri 2.x](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript + Tailwind v4 |
| Agent engine | TypeScript sidecar (Node) — JSON-RPC / stdio |
| Database | [SQLite](https://sqlite.org) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Vector store | [sqlite-vec](https://github.com/asg017/sqlite-vec) (same SQLite file) |
| Embeddings | Provider API (BYO-key) |
| Workflow canvas | [React Flow](https://reactflow.dev) |
| Fonts | Playfair Display, Inter, Noto Sans Thai (self-hosted, offline) |

## Roadmap

| Milestone | Focus | Status |
|-----------|-------|--------|
| v0.1 — Wedge | Tauri scaffold + streaming chat + settings | ✅ |
| v0.2 — Real Agent | Tools + memory + self-healing + token budget | ✅ |
| v0.3 — Make It Yours | Agent builder + RAG + history + settings | ✅ |
| v0.4 — Cost Control | Prompt cache + semantic cache + smart routing | ✅ |
| v0.5 — Reach + Polish | Connectors + governance + UI polish + branding | ✅ |
| v0.7 — Visual Workflows | Canvas + execution + templates + skill import + context files | ✅ |
| v0.8 — Observability | Per-reply observability + export/import + A/B + prompt assistant | ✅ |
| v0.9 — Extensibility | Sub-agent orchestration + MCP + plugins + skill synthesizer | 🚧 mostly done (experience/correction remain) |
| v1.0 — Complete Platform | Knowledge connectors + MCP + marketplace | 🚧 file connector + MCP client done |
| v0.6 — First Public Beta | Integration tests + docs + cross-platform CI + release | ⏸️ deferred until the feature surface settles |

See [PLAN.md](PLAN.md) for the full 55-task roadmap with acceptance criteria.

## Nexus vs Hermes Agent

| Feature | Hermes | Nexus |
|---------|--------|-------|
| Interface | CLI + chat | **Desktop GUI** (3-click onboarding) |
| Agent builder | Config files | **Visual builder** |
| Cost optimization | Basic | **Smart router + semantic cache + prompt caching** |
| Sub-agent delegation | ✅ | ✅ (parallel batch orchestrator) |
| MCP + plugins | ✅ | ✅ (MCP client + plugin loader) |
| Transparent memory (`.md`) | ✅ | ✅ (5 files + auto-extract) |
| Skill library | 1000+ | 60 built-in + synthesizer + GitHub/Hermes import |
| Platform delivery | 10+ platforms | Telegram + Discord (more planned) |

## Building from source

### Prerequisites
- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (stable toolchain)
- Platform build dependencies (see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)):
  - **macOS** — Xcode Command Line Tools: `xcode-select --install`
  - **Windows** — Microsoft C++ Build Tools + WebView2 (preinstalled on Windows 11)
  - **Linux** — `webkit2gtk`, `libssl`, `build-essential` (and friends)

### Build

```bash
git clone https://github.com/DucklingGod/nexus.git
cd nexus
npm install
npm run tauri build
```

The bundle lands in `src-tauri/target/release/` — `nexus.app` / `.dmg` on macOS, `nexus.exe` / `.msi` on Windows, `nexus` / `.deb` / `.AppImage` on Linux.

### Development

```bash
npm run tauri dev   # launches the app with hot-reload
```

> The TypeScript agent engine runs from source as a sidecar, so engine-side changes take effect on relaunch without recompiling the Rust shell.

## Project structure

```
nexus/
├── src/                 # React frontend (chat, workflows, skills, A/B, settings, sidebar, onboarding)
├── engine/              # TypeScript agent engine (sidecar)
│   └── src/
│       ├── ipc/         # JSON-RPC dispatch, streaming, log buffer
│       ├── providers/   # OpenAI-compatible + Anthropic/Google adapters
│       ├── tools/       # Tool registry + 40+ tools
│       ├── orchestrator/# Sub-agent runner (delegate)
│       ├── mcp/         # MCP client   · plugins/  — plugin loader
│       ├── workflow/    # Canvas executor + store
│       ├── scheduler/   # Cron engine  · kanban/  — board store
│       ├── connectors/  # Telegram, Discord
│       ├── skills/      # Built-in skills + import + synthesizer
│       ├── knowledge/   # Documents + RAG + watched folders
│       ├── context/     # 5 .md files + auto-extract
│       └── memory/      # Episodic (SQLite) + semantic (vector)
├── src-tauri/           # Rust shell — IPC commands, keychain broker, sidecar manager
├── PLAN.md · SPEC.md · DESIGN.md
```

## Contributing

Nexus is open source under the MIT License. Contributions welcome — fork, branch, and open a PR. See [PLAN.md](PLAN.md) for the roadmap; pick a task and build it.

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**Built with Tauri 2, React, and TypeScript**

[Report a bug](https://github.com/DucklingGod/nexus/issues) · [Request a feature](https://github.com/DucklingGod/nexus/issues)

</div>
