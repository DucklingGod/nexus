# Nexus — Design System (read before touching any UI)

> **For any agent/human building UI in this app: follow this exactly so the theme stays consistent.**
> Vibe: **premium, minimal, restrained.** Near-black canvas, **real metallic gold** accents, warm off‑white text, generous spacing, elegant type. Think luxury, not flashy.

## 1. The one rule about gold

Gold is **real, warm, metallic/antique gold — NOT yellow.** Primary `#c8a24e`.
**Never** use pure yellow (`#FFD700`, `#FFC800`), lime, or the old green accent. When in doubt, lean *more bronze/amber*, never brighter/yellower.

## 2. Color tokens (single source of truth)

Defined in [`src/styles/globals.css`](src/styles/globals.css) inside the Tailwind v4 `@theme` block.
**There is no `tailwind.config.js`** — Tailwind v4 reads `@theme`. To add/change a color, edit that block.

| Token | Hex | Tailwind class | Use for |
|-------|-----|----------------|---------|
| `--color-nexus-bg` | `#0a0a0b` | `bg-nexus-bg` | app canvas / base background |
| `--color-nexus-surface` | `#141312` | `bg-nexus-surface` | cards, panels, bubbles, input bar |
| `--color-nexus-elevated` | `#1c1a17` | `bg-nexus-elevated` | raised elements, hover surfaces |
| `--color-nexus-border` | `#2a2620` | `border-nexus-border` | hairline borders |
| `--color-nexus-gold` | `#c8a24e` | `text-nexus-gold` / `bg-nexus-gold` | gold accents |
| `--color-nexus-gold-light` | `#e6cd86` | `text-nexus-gold-light` | highlights, inline code |
| `--color-nexus-gold-dark` | `#9a7b32` | `*-nexus-gold-dark` | pressed/deep gold |
| `--color-nexus-accent` | `#c8a24e` | `*-nexus-accent` | **alias of gold** — legacy class, still gold |
| `--color-nexus-fg` | `#ece7dd` | `text-nexus-fg` | primary text (warm off‑white) |
| `--color-nexus-muted` | `#8f8a80` | `text-nexus-muted` | secondary / hint text |

Prefer these tokens over raw Tailwind `neutral-*` grays (cool grays clash with gold). Older onboarding/Settings screens still use some `neutral-*` — migrate them to `nexus-*` when you touch them.

## 3. Fonts

| Family | Token / class | Use for |
|--------|---------------|---------|
| **Inter** (variable) | `--font-sans`, default | all UI / body text |
| **Playfair Display** (variable, serif) | `--font-display`, `font-display` | wordmark + large/hero headings ONLY |

- Self-hosted via `@fontsource-variable/*`, imported in [`src/main.tsx`](src/main.tsx).
- **Never add Google Fonts / any CDN font.** It breaks the strict CSP and the local-first/offline guarantee. Add new fonts the same way: `npm i @fontsource-variable/<x>` → import in `main.tsx`.
- Body inherits `font-sans` from `<body>`. Use `font-display` deliberately, sparingly (brand + big headings) — not on body/labels/buttons.

## 4. Helper utilities (in globals.css)

| Class | What it does | Use for |
|-------|--------------|---------|
| `text-gold-foil` | gold gradient clipped to text | the **Nexus wordmark** and hero headings |
| `bg-gold-sheen` | metallic gold gradient fill | **primary buttons** (with `text-black`) |
| `border-gold-faint` | `rgba(200,162,78,.22)` border color | subtle gold hairlines, focus rings |

## 5. Component recipes (copy these patterns)

- **Wordmark:** `font-display ... text-gold-foil` (e.g. `<h1 className="font-display text-7xl font-semibold text-gold-foil">Nexus</h1>`).
- **Primary button:** `rounded-full bg-gold-sheen px-10 py-3 text-sm font-semibold text-black transition hover:brightness-110` (disabled: `disabled:opacity-40 disabled:brightness-100`).
- **Secondary button:** `text-nexus-muted hover:text-nexus-fg hover:bg-nexus-surface` (no fill).
- **Card / surface:** `rounded-2xl border border-nexus-border bg-nexus-surface`.
- **Input / textarea:** transparent inside a `bg-nexus-surface` container; `placeholder-nexus-muted`; focus ring via wrapper `focus-within:border-gold-faint`. No raw outlines.
- **Chat bubbles:** user → `rounded-2xl rounded-br-md border border-gold-faint bg-nexus-gold/[0.08] text-nexus-fg`; assistant → `rounded-2xl rounded-bl-md border border-nexus-border bg-nexus-surface text-nexus-fg/90`.
- **Pills / tags:** `rounded-full border border-gold-faint bg-nexus-surface text-[11px] text-nexus-muted`.
- **Radius scale:** `rounded-xl` (inputs/cards), `rounded-2xl` (bubbles/containers), `rounded-full` (pills/primary buttons). Avoid sharp corners.
- **Layout:** center content with `max-w-3xl mx-auto`; generous padding; thin `border-nexus-border` dividers.

## 6. Do / Don't

**Do:** use the tokens; keep it restrained and spacious; black + gold + warm white only; `font-display` for brand/headings; gold for accents/primary actions; subtle transitions (`transition hover:brightness-110`).

**Don't:** introduce new accent colors (no green/blue/yellow); use pure yellow; add CDN fonts; use cool `neutral-*`/`slate-*`/`zinc-*` text on new screens; put serif on body text; use heavy shadows or bright/glossy effects; edit a `tailwind.config.js` (there isn't one — use `@theme`).

## 7. Reference

The current premium implementation lives in `src/components/chat/` (ChatConsole, MessageBubble, StatusBar) and `src/components/onboarding/WelcomeScreen.tsx`. Match their style for any new screen.
