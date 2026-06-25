# Sidecode

**A live code companion that reviews your repo as you ship.**

Connect a GitHub repo, watch it render as an interactive force-directed graph, and
get one clear answer per file and for the whole repo: **safe to merge** or
**blocked**. Every push rescans the changed files in the background and updates the
graph in real time — the review never goes stale.

---

## The problem

AI now writes code faster than any human can review it. In the "vibe coding" era a
developer can generate hundreds of lines in seconds, but the review step — the part
that catches security holes and broken logic — hasn't sped up to match. The result
is *ship and pray*: code goes out faster than anyone can vet it.

Sidecode targets that gap. It's an automated review companion that sits alongside
your repo, scans every file, and reconciles a multi-agent review into a single
prioritized verdict.

---

## What it does

1. **Connect a repo.** GitHub OAuth (via Firebase Auth) authorizes access to public
   or private repos. The file tree is fetched through the GitHub API.
2. **See it as a graph.** The repo renders as an Obsidian-style force-directed web
   (`react-force-graph-2d`). Each node is a source file, sized by line count and
   badged with its language logo (`devicon`). Folders are intermediate nodes.
3. **Two specialists review in parallel.** For every reviewable file, a **security**
   agent and a **correctness (bug)** agent run concurrently, each with a distinct
   mandate and detection criteria.
4. **A coordinator reconciles.** A third agent takes both specialists' reports,
   dedupes overlapping findings, weighs confidence, resolves severity
   disagreements, and emits one verdict per file.
5. **Findings stream live.** As agents finish each file, findings animate onto the
   graph over SSE — nodes light up, severity rings appear, the repo-level verdict
   gate updates.
6. **Open, fix, commit.** Click any flagged file to open it in an embedded **Monaco**
   editor with the exact lines highlighted. Generate a fix in one click — shown as a
   reviewable before/after diff first — that commits straight to the branch as a
   clean atomic commit, with the commit URL handed back. Or fix every flagged file
   at once.
7. **Stay live.** Sidecode registers a webhook on the repo. Every push rescans **only
   the changed files** in the background and pushes the update into the open graph
   with no reload.

---

## Architecture decisions

### Multi-agent, not one prompt
A single model asked to "review this code" produces shallow, unfocused output. We
split the work into specialized agents with distinct mandates and a coordinator that
does real reconciliation. This lets the system do something a single call can't:
surface where two agents *disagree* and resolve it deliberately.

```
                    ┌─────────────────┐
   file content ───▶│ security agent  │──┐
        │           └─────────────────┘  │   reports
        │           ┌─────────────────┐  ├──▶ coordinator agent ──▶ per-file verdict
        └──────────▶│ correctness     │──┘    (dedupe · weigh ·     (safe | blocked)
                    │ (bug) agent     │        resolve severity)
                    └─────────────────┘
```

### Two specialists plus a coordinator
We deliberately scoped to two review lenses — **security gaps** and **bugs** — rather
than spreading thin across more. Both have real, defensible detection criteria. The
**coordinator** is what justifies the architecture: it turns two independent opinions
into one verdict, and only escalates major (CRITICAL/HIGH) issues so the signal stays
high.

### Live companion, not a one-shot scanner
The biggest design decision was making the review *continuous*. A webhook rescans on
every push, and the UI subscribes to the datastore live, so the graph updates itself
with no reload. The scan tab that launched a review hands off to the live Firestore
subscription once its initial scan completes, so push-driven rescans stream into the
*same open tab*. This is what turns a tool you *run* into a companion that's always
watching.

### Fixes are reviewable and atomic
Fixes are shown as a before/after diff before anything is committed — nothing changes
blindly. Commits go to the branch as clean atomic commits, with the URL handed back.

### The graph as a decision surface
The visualization isn't decoration. It answers four questions in order:
**what's wrong** (findings light up files) → **how bad** (severity rings + verdict) →
**can I ship** (the repo verdict gate) → **did I fix it** (the graph washes green
after a fix).

---

## How it's built

### Stack
- **Next.js (App Router, v16+)** · React · TypeScript (strict) · Tailwind CSS
- **`@google/genai`** — the Gemini SDK, routed through **Vertex AI**
- **Firebase** — Firestore (data + live listeners) and Auth (GitHub sign-in)
- **`@octokit/rest`** — GitHub API: repo/tree/file reads, webhook registration, commits
- **Monaco** (`@monaco-editor/react`) · **`react-force-graph-2d`** · **`devicon`** logos

### Request paths
| Route | Purpose |
|---|---|
| `POST /api/scan` | Interactive scan — streams agent results to the browser over **SSE** |
| `POST /api/github/webhook/register` | Registers the push/PR webhook on a repo (idempotent) |
| `POST /api/github/webhook` | Receives GitHub events; verifies HMAC; runs the background rescan |
| `POST /api/patch` / `POST /api/open-pr` | Generate a fix and commit it / open a PR |
| `GET /api/review/[reviewId]` | Server-side read for public (anonymous) reviews |

### The live rescan flow
```
GitHub push / PR (opened | synchronize)
  → POST /api/github/webhook        verify HMAC (403 if bad) → ack 200 within ~10 s
  → after() {                       Next.js post-response work, runs in maxDuration window
      collect changed paths           added + modified (push) / PR files; source files only
      cap at MAX_WEBHOOK_FILES        so a large push degrades to a partial scan, never killed
      runScan({ onlyPaths })          incremental: security ‖ correctness → coordinator
      write reviews/{id} (+ files, findings) in Firestore
    }
```

The webhook handler resolves the **same deterministic review id** the viewer is
subscribed to (`rollingReviewId(uid, owner, repo, branch)` — FNV-1a, isomorphic
across browser and Node), so a push-triggered rescan writes into the document the
open graph is already watching. Firestore's `onSnapshot` listeners do the rest.

### Data model
- `reviews/{reviewId}` — `{ uid, owner, repo, branch, status, totals, verdict, truncated, … }`
- `reviews/{reviewId}/files/{id}` and `reviews/{reviewId}/findings/{id}`

Verdict rolls up per file: **blocked** if any file has a CRITICAL/HIGH finding, else
**safe**. Incremental rescans upsert per-path findings and recompute the repo totals
from all files. No raw secret or file content is ever logged.

### The Google technology, and why
- **Gemini API** (`gemini-2.5-flash`) is the reasoning engine inside every agent —
  security, bug, coordinator, and fixer. We chose Gemini for strong code
  understanding and reliable **structured (JSON) output**, so agents return typed
  findings we render directly instead of parsing out of prose.
- **Vertex AI** serves Gemini in production (`GOOGLE_GENAI_USE_VERTEXAI=true`) and is
  our path for **fine-tuning** the specialists on labeled vulnerability/bug datasets.
  The loader (`modelForAgent`) already swaps in a per-agent tuned model
  (`TUNED_MODEL_SECURITY` / `TUNED_MODEL_CORRECTNESS`) when one is configured,
  falling back to the base model otherwise.
- **Firebase** is the backend. **Firestore** stores every scan, finding, and verdict;
  its **live listeners** are what make the graph update in real time when a
  push-triggered rescan lands. **Firebase Auth** handles GitHub sign-in for private
  repos. It gave us a zero-ops backend that made the live-companion experience
  possible.
- The **GitHub API** (Octokit) connects the repo, pulls file contents, posts the
  webhook, and commits fixes — turning Sidecode into a real part of the push workflow.

---

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Verify a change before shipping:

```bash
npx tsc --noEmit && npm run lint && npm run build
```

### Environment
| var | purpose |
|---|---|
| `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | route all agent calls through Vertex AI |
| `GOOGLE_APPLICATION_CREDENTIALS` | service-account JSON for Vertex auth (local only — on a managed host attach a service account with `roles/aiplatform.user` and omit this) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | server-side Firestore + Auth (Admin SDK) |
| `NEXT_PUBLIC_FIREBASE_*` | client Firebase config (inlined at build time) |
| `WEBHOOK_PUBLIC_URL` | public, GitHub-reachable origin the webhook callback is pinned to (e.g. the Vercel production URL) |

> **Webhook scope:** creating push webhooks requires the GitHub OAuth token to carry
> the `admin:repo_hook` scope — the plain `repo` scope does not grant hook
> management. Sidecode requests it at sign-in.

> **Deploy note (Vercel):** the post-ack rescan runs in `after()` within the route's
> `maxDuration` window, capped at `MAX_WEBHOOK_FILES` so it can't be killed mid-scan.
> Set `WEBHOOK_PUBLIC_URL` to the production URL and redeploy, then reconnect GitHub
> so the token picks up `admin:repo_hook`.

---

## What we'd improve with more time

- **Import-graph edges and blast radius.** Today the graph links files by folder. Real
  dependency edges would show how a single vulnerability spreads across the files that
  import it — true cross-file impact analysis.
- **A published GitHub Action.** The webhook already makes Sidecode CI-native;
  packaging it as an installable Action with per-repo config thresholds would make
  adoption one step.
- **Inline PR review comments and a status check**, so a *blocked* verdict literally
  gates a merge in GitHub's own UI.
