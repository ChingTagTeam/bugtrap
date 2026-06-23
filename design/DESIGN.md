# Sidecode — Design System

Sidecode is a live code companion. The visual language is a sleek, modern dev tool that feels at home inside a VS Code dark editor: premium, minimal, confident, alive with restrained motion. Indigo is the single brand accent; everything else is editor-neutral until a finding or verdict needs to speak.

---

## Color tokens

### Surfaces
| Token | Hex | Role |
|---|---|---|
| bg / editor | `#1E1E1E` | app + canvas background |
| surface | `#252526` | cards, sidebar, panels |
| elevated | `#2D2D30` | popovers, hover rows, IDE panel |
| border | `#3C3C3C` | dividers, outlines, inactive edges |

### Text
| Token | Hex | Role |
|---|---|---|
| text | `#D4D4D4` | primary copy |
| text-muted | `#9D9D9D` | secondary, labels |
| text-faint | `#6E6E6E` | hints, disabled, line numbers |

### Brand
| Token | Hex | Role |
|---|---|---|
| indigo (primary) | `#5C8AF0` | buttons, active states, focus, brand, graph glow |
| indigo-bright | `#82A8F6` | hover, glow, highlighted edges |

Indigo is the only brand accent. It is never used to mean a severity or status.

### Findings — the two agents
| Token | Hex | Role |
|---|---|---|
| security gap | `#F26D78` (red) | Security agent: vulnerabilities, secrets, exposure |
| bug | `#E8A33D` (amber) | Bug agent: logic errors, edge cases, broken behavior |

A file's finding color tells you which agent flagged it. A file flagged by both shows both.

### Verdict / severity
| Token | Hex | Role |
|---|---|---|
| safe / clean | `#4EC9A8` (green) | pass, resolved, graph-goes-green |
| warn / medium | `#E5C07B` (yellow) | non-blocking, medium/low severity |
| blocked / critical | `#F26D78` (red) | critical/high; blocks merge (shares the security red — red = stop) |

Note: bug amber `#E8A33D` and warn yellow `#E5C07B` are adjacent. Keep color meaning "which agent" and encode severity with icon/intensity, not a competing hue, so they never read ambiguously.

---

## Typography

| Use | Font | Weights |
|---|---|---|
| Display, headings, wordmark | Red Hat Display | 800 for wordmark + big type; 500/400 for subheads |
| Code, findings, labels, status bars, line numbers | JetBrains Mono | 400, 500 |

The wordmark "Sidecode" is one word, Red Hat Display 800, tight letter-spacing, sentence-flat. Small body text stays on `#D4D4D4`; reserve indigo for accents, buttons, and large type (indigo on `#1E1E1E` is borderline for small copy).

---

## Logo

Horizontal lockup: icon left, wordmark right. The mark evokes a companion that rides alongside your code. Use the logo in the nav, the footer, the graph topbar, and as the favicon (must read at 32px). Source: `public/Sidecode-logo.svg`.

---

## File-type icons

Use a STANDARD file-type icon set (vscode-icons / Seti, or react-file-icon) — never invent custom file icons. They appear in two places:
- The left sidebar file-explorer tree (VS Code style).
- Centered on each graph node circle.

Agent findings are NOT the center icon. They are shown as the node's RING and corner badges (security `#F26D78`, bug `#E8A33D`, worst-severity color rings the node). The file-type icon always stays on the circle.

---

## Graph view aesthetic

- Nodes = reviewable source files only (shared filter with the scanner). Radius scales with code volume. Folders form an Obsidian-like web via containment edges.
- Background `#1E1E1E`, indigo glow on active nodes/edges, neutral dim on the rest.
- Hover highlights a node + neighbors and dims the rest. Verdict gate badge uses the verdict colors. On a clean result the graph washes toward green `#4EC9A8`.

---

## Motion

Restrained and high-craft, never gimmicky. Ambient background, scroll reveals, magnetic buttons, subtle tilt, per-agent live progress, and the verdict transition. The SSE build-out (nodes animate in, badges pop as findings stream) and the live-companion push updates are core, not decoration. Everything honors `prefers-reduced-motion` (graph settles instantly, no pulsing). Target 60fps; clean up canvas and rAF loops on unmount.