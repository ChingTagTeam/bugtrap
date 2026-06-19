# BugTrap — Brand & Design System

Reference for building new pages and components consistently with the landing
page. The source of truth for the landing page itself is
`design/BugTrap-Landing.html`; this document distills its tokens and vocabulary.

The token block lives on `.bt-root` in `src/app/globals.css` (mirroring the
CSS-variable block on the source's root element). Every color below is a CSS
variable available to any descendant — reference `var(--token)`, never a raw hex
substitute.

---

## Color tokens

| Token            | Hex / value                | Semantic role |
|------------------|----------------------------|---------------|
| `--lime`         | `#83C818`                  | **Primary brand accent**, and the **correctness** agent color. CTAs, eyebrows, glows, the "safe to merge" state. |
| `--lime-bright`  | `#a6f02e`                  | Highlight/hover variant of lime — gradient stops, active scan nodes, glints. |
| `--cor`          | `#83C818`                  | **Correctness** lens (same hue as lime, used where the semantic name reads clearer). |
| `--sec`          | `#ff5d6c`                  | **Security** lens. Critical findings, BLOCKED state, the verdict-gate error. |
| `--read`         | `#54b8ff`                  | **Readability** lens. Low-severity findings, the blue ambient glow. |
| `--bg`           | `#1d1d20`                  | Page background. |
| `--bg2`          | `#252529`                  | Slightly raised background. |
| `--surf`         | `#28282d`                  | Card / panel surface. |
| `--surf2`        | `#303036`                  | Elevated surface (verdict chips, the merge-gate strip). |
| `--line`         | `rgba(255,255,255,.08)`    | Hairline borders, grid gaps. |
| `--line2`        | `rgba(255,255,255,.14)`    | Stronger borders, interactive outlines. |
| `--tx`           | `#f2f2ef`                  | Primary text. |
| `--tx2`          | `#a3a3a8`                  | Secondary text / body copy. |
| `--tx3`          | `#6f6f76`                  | Tertiary text / captions / idle states. |

Supporting accents used inline (not tokenized): `#f0b454` for **HIGH** severity,
`#ff8a95` for the blocked-verdict text, `#15150f` for text on lime fills.

**Selection:** `::selection` is lime on `#15150f`.

### The three-lens system
Security / Correctness / Readability are the product's core mental model. Each
maps to one color (`--sec` / `--cor` / `--read`) and is used consistently across
agent meters, findings, pills, and severity bars. Never recolor a lens.

---

## Typography

Loaded via `next/font/google` and exposed as CSS variables wired into Tailwind
(`--font-sans` / `--font-mono`).

| Role        | Family            | Variable                  | Weights | Usage |
|-------------|-------------------|---------------------------|---------|-------|
| Display/UI  | **Archivo**       | `--font-archivo`          | 400, 500, 600, 700, 800, 900 | All headings, body, labels. Headlines use 800 with tight tracking (`-.03em` to `-.035em`). |
| Code/data   | **JetBrains Mono**| `--font-jetbrains-mono`   | 400, 500, 600, 700 | Code blocks, findings, eyebrows, counts, stat affixes, severity/lens tags, any "machine" text. |

Reference mono inline as `var(--font-jetbrains-mono), 'JetBrains Mono', monospace`
(the literal family name alone won't resolve to the optimized font).

**Type scale (desktop):** hero h1 64px · section h2 40–44px · feature h3 20–22px ·
body 17–19px · captions/labels 10–13px. Eyebrows are 12px mono, `.18em` tracking,
uppercase, lime, with a glowing dot. Headings shrink at `≤900px` / `≤560px` via
the responsive overrides in `globals.css`.

---

## Motion vocabulary

All keyframes are defined in `globals.css` and prefixed `bt-`. Everything is
disabled/neutralized under `prefers-reduced-motion: reduce`.

| Keyframe      | Purpose |
|---------------|---------|
| `bt-grad`     | Animated gradient sweep on the hero "confidence." word. |
| `bt-glow`     | Pulsing opacity for dots, ambient radial glows. |
| `bt-spin`     | Coordinator loading spinner. |
| `bt-shimmer`  | Light sweep across the agent rows. |
| `bt-ring`     | Expanding ring pulse behind agent icons. |
| `bt-bob`      | Gentle vertical bob (coordinator logo, stack-card icons). |
| `bt-orbit`    | Rotating dashed orbit ring. |
| `bt-flow`     | Dot traveling along the horizontal flow connectors. |
| `bt-dash`     | Marching-dashes on the flow-connector line. |
| `bt-float`, `bt-blink`, `bt-marquee`, `bt-pulse`, `bt-rise`, `bt-flowv` | Additional ambient/utility motions retained from the source vocabulary. |

**Reveal:** elements tagged `data-reveal` (optional `data-reveal-delay` in ms)
fade up 28px on scroll-in via `PageInteractions`. Hidden state is gated behind
`html.js` so no-JS users always see content.

**Interactive:** hero scanner card has a mouse-tilt (`±7deg`); the primary CTA is
magnetic; `.feat` / `.stackcard` lift and glow lime on hover.

**Signature element:** the hero **scanner card** — a live READY → SCANNING →
findings → BLOCKED verdict loop driven by `ScannerCard`, paired with the
fixed-canvas particle field + scan band in `CanvasBackground`.

---

## Logo

`public/BugTrap-logo.png` — a lime bug mark. Also wired as the app icon
(`src/app/icon.png`).

- **Lockup:** logo at ~42px beside the "BugTrap" wordmark (Archivo 800, `-.02em`).
- **Glow:** pair the mark with a lime drop-shadow, e.g.
  `filter: drop-shadow(0 0 14px rgba(131,200,24,.45))`.
- **Decorative:** may appear as a low-opacity (`~.06`) oversized watermark
  (see the Why-Gemini panel) or as a bobbing/orbited accent (coordinator card).
- Keep it on dark surfaces; the mark is single-color lime and needs the contrast.

---

## Rules

- **Tokens only.** No new colors or fonts — extend by composing the variables above.
- **Dark theme only.** Background is `--bg`; design for the dark surface set.
- **Lenses are sacred.** Security = red, Correctness = lime, Readability = blue, always.
- **Mono = machine.** Anything code-, data-, or status-flavored is JetBrains Mono.
- **Respect reduced motion** and keep keyboard focus visible on any new interactive element.
