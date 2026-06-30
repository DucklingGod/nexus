# Nexus — Desktop AI Agent Platform (Tauri 2 + React/TS)

**Standalone project.** See [`DESIGN.md`](DESIGN.md) for the visual theme — follow it for ALL new UI so the look stays consistent across agent handoffs.

## Stack
- Shell: Tauri 2.x (Rust). Frontend: React 19 + TypeScript + Tailwind v4 (Vite).
- Agent engine: TypeScript Node/Bun sidecar (`engine/`, added in later tasks), JSON-RPC over stdio.
- DB: SQLite via `better-sqlite3` + `sqlite-vec`. Secrets: OS keychain only — never in DB/logs/exports.

## Build environment (IMPORTANT)
- **macOS (nvm):** Node v24 via nvm. `npx tauri dev` or `npx tauri build`.
- **Windows:** Rust/cargo not on PATH → prepend: `export PATH="$HOME/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin:$PATH"`
- Verify frontend: `npm run build` (tsc + vite). Verify Rust: `cargo check --manifest-path src-tauri/Cargo.toml`.
- `npm run tauri dev` opens the window (a human must confirm it renders).

## How to work here (ponytail minimal-code discipline)
- YAGNI ladder before writing code: needed? → reuse → stdlib → native → existing dep → one-liner → then minimal code.
- No unrequested abstractions; deletion over addition. Never lazy on: input validation at trust boundaries, error handling, security, accessibility, explicit requirements, and minimal test for non-trivial logic.
- Build in milestone order (PLAN.md → Release Milestones): finish **v0.1 (Tasks 1-6)** before anything else.

## Workflow Rules (MANDATORY)

### After EVERY task completion:
1. **Verify build passes:**
   - Frontend: `npm run build`
   - Rust: `cargo check --manifest-path src-tauri/Cargo.toml` (Windows) or just `npx tauri build`
2. **Commit with conventional format:**
   ```bash
   git add -A
   git commit -m "feat: <description>"  # or fix:/chore:/docs:
   git push origin master
   ```
3. **Update wiki** at `~/digital-brain/projects/ai-agent-builder/nexus-rebuild.md`:
   - Add commit hash + description to the progression table
   - Update status columns if milestone/task completed
   - Update Stack table if providers/tech changed
   - **Commit + push wiki:**
     ```bash
     cd ~/digital-brain
     git add -A
     git commit -m "wiki: <what changed in nexus>"
     git push origin master
     ```

### Wiki location
- **Windows:** `C:\Users\iHC\digital-brain\`
- **macOS:** `~/digital-brain/`
- Primary doc: `projects/ai-agent-builder/nexus-rebuild.md`

### Git workflow
- Branch: `master` (main branch)
- Remote: `https://github.com/DucklingGod/nexus.git` (Windows) / `git@github.com:DucklingGod/nexus.git` (macOS SSH)
- Never force push without explicit user approval
- Windows may need: `git remote set-url origin https://github.com/DucklingGod/nexus.git`
- macOS SSH key is registered on GitHub already

### Sync between machines
After pushing from one machine, the other needs:
```bash
git pull origin master
```
If Rust native modules differ (better-sqlite3), rebuild:
```bash
npm rebuild
# or
cd engine && npm rebuild && cd ..
```