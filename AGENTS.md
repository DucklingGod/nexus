# Nexus — Desktop AI Agent Platform (Tauri 2 + React/TS)

**Standalone project.** See [`DESIGN.md`](DESIGN.md) for the visual theme — follow it for ALL new UI so the look stays consistent across agent handoffs.

## Stack
- Shell: Tauri 2.x (Rust). Frontend: React 19 + TypeScript + Tailwind v4 (Vite).
- Agent engine: TypeScript Node/Bun sidecar (`engine/`, added in later tasks), JSON-RPC over stdio.
- DB: SQLite via `better-sqlite3` + `sqlite-vec`. Secrets: OS keychain only — never in DB/logs/exports.

## Build environment (IMPORTANT)
- Rust/cargo are installed but **not on PATH**. Prepend the toolchain bin:
  `export PATH="$HOME/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin:$PATH"`
- Verify frontend: `npm run build` (tsc + vite). Verify Rust: `cargo check --manifest-path src-tauri/Cargo.toml`.
- `npm run tauri dev` opens the window (a human must confirm it renders).

## How to work here (ponytail minimal-code discipline)
- YAGNI ladder before writing code: needed? → reuse → stdlib → native → existing dep → one-liner → then minimal code.
- No unrequested abstractions; deletion over addition. Never lazy on: input validation at trust boundaries, error handling, security, accessibility, explicit requirements, and a minimal test for non-trivial logic.
- Build in milestone order (PLAN.md → Release Milestones): finish **v0.1 (Tasks 1-6)** before anything else.
