# CLAUDE.md — BugTrap

BugTrap is an automated multi-agent code-review co-pilot for the "vibe-coding" era. It takes a file, function, or PR and returns a structured review with a clear safe-to-merge / blocked verdict. This repo is currently the marketing/product front end; the AI backend is future work.

## Stack & Commands
**Stack:** Next.js (App Router, v16+) · React · TypeScript · Tailwind CSS · next/font (Archivo + JetBrains Mono) · client canvas + requestAnimationFrame · (planned) Gemini API · Vertex AI agents · Firebase · GitHub API (Octokit)

Development
- `npm run dev` — start the dev server
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck (no emit)

Build / Deploy
- `npm run build` — production build; must pass clean before anything is "done"
- `npm run start` — serve the production build
- deploy — (ASK FIRST) do not deploy without explicit confirmation

There is no test suite yet. Until one exists, the verify step for any change is `npx tsc --noEmit && npm run build` (add `npm run lint`).

## Architecture
- `src/app/` — App Router routes; `page.tsx` is the landing page, `layout.tsx` wires fonts + base theme
- `src/components/` — React components (the landing page sections + the interactive scanner card live here)
- `public/` — static assets; `public/BugTrap-logo.png` is the logo
- `design/` — `BugTrap-Landing.html` (the source-of-truth landing page to reproduce) and `DESIGN.md` (brand system reference)
- `src/lib/` — (planned, not built yet) Gemini / Vertex / Firebase / GitHub clients

## Behavioral Guidelines
Rules that reduce common LLM coding mistakes. They bias toward caution over speed; on trivial tasks, use judgment.

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.
- State assumptions explicitly; if uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what's confusing, and ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked. This repo is landing-page-only right now — do not scaffold backend, auth, AI, or integration code until explicitly asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- If 200 lines could be 50, rewrite it. Ask: "would a senior engineer call this overcomplicated?"

### 3. Surgical Changes
Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style even if you'd do it differently.
- Notice unrelated dead code? Mention it — don't delete it.
- Remove imports/vars/functions that YOUR change orphaned; leave pre-existing dead code unless asked.
- Test: every changed line should trace to the request.

### 4. Goal-Driven Execution
Define success criteria. Loop until verified.
- "Match the landing page" -> diff the rendered result against design/BugTrap-Landing.html section by section until indistinguishable.
- "Fix the layout bug" -> reproduce it, fix it, confirm the fix in the browser.
- For multi-step tasks, state a brief plan with a verify step per item.
- Before marking done, run `npx tsc --noEmit && npm run build` and confirm it's green.

## Project Rules
**Brand tokens are fixed.** Fonts are Archivo (display) + JetBrains Mono (code/findings). Primary accent is lime `#83C818`. The CSS-variable block in `design/BugTrap-Landing.html` is the source of truth for all colors (`--sec #ff5d6c` security, `--cor #83C818` correctness, `--read #54b8ff` readability, surfaces, text). NEVER introduce new colors or fonts. See `design/DESIGN.md`.

**The landing page must match `design/BugTrap-Landing.html` exactly** — every section, all copy verbatim, all keyframes, the canvas background, and the full scanner state machine (READY → scanning → agent meters → findings rail → verdict gate). That HTML is a Claude Design export using `<x-dc>` / `support.js`; port its logic into React, never depend on `support.js`.

**Next.js / React** — Functional components only. App Router (`src/app/`), never `pages/`. Server components by default; add `'use client'` only where needed (the scanner card and canvas are client components). Don't fetch data in `useEffect`. Clean up rAF loops and canvas listeners on unmount.

**TypeScript** — strict mode. No `any`, no `!` non-null assertions, no `as` casts to silence errors. Explicit return types on exported functions.

**Tailwind** — utility classes first. The ported landing page may keep inline styles to match the source exactly; that's allowed for fidelity. Mobile-first responsive prefixes.

**Planned stack (when backend work starts) — NEVER roll your own:**
- LLM calls go through the official Google Gen AI SDK targeting the Gemini API. Route via Vertex AI (`GOOGLE_GENAI_USE_VERTEXAI`) for the agent runtime.
- Multi-agent orchestration (security / correctness / readability + coordinator) runs on Vertex AI. Don't hand-build an agent loop if the ADK covers it.
- Backend/data is Firebase. Don't reimplement auth or persistence.
- Repo + PR access is via the GitHub API (Octokit). Never store tokens in code or logs.

**Secrets** — never commit or log API keys, tokens, or PII. Use env vars.

**Git** — branch is `staging` unless told otherwise. Push with this exact format: