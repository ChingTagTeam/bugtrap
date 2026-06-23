# Summary: GitHub push-webhook scan backend

**Date:** 2026-06-22 · **Branch:** staging (also mirrored to `main`)

## What was built

A backend that, on every push to a connected GitHub repo, runs the changed files through the
**existing** secret-detector → fix pipeline and persists the result to Firestore. It is the
backend for the live companion feature. The agents and pipeline were **reused, not rebuilt**.

```
GitHub push
  → POST /webhook/github      verify HMAC (401 if bad) → ack 200 within ~10s
  → [async] fetchChangedFiles  added/modified source files at the push head SHA
  → scanChangedFiles           detector → fix per file, 4 concurrent, per-file try/catch
  → persistPushScan            scans/{sha} + per-file subcollection, rolled-up verdict
  → log one-line summary
```

## Files created

| File | Responsibility |
|---|---|
| `src/server.ts` | Express endpoint: raw-body HMAC verify (timing-safe), event filter, 200-ack-then-async-scan, process-level crash guards |
| `src/webhookFiles.ts` | `fetchChangedFiles(payload)` — collect added/modified paths, two-stage size filter, fetch contents at `after` SHA |
| `src/scanRepo.ts` | `scanChangedFiles(files)` — concurrency-capped (4) detector→fix, graceful per-file degradation, lazy agent import |
| `src/registerWebhook.ts` | `registerRepoWebhook(owner, repo)` — idempotent (update-if-exists); also backs the future UI connect-repo flow |
| `src/lib/scan-persist.ts` | `rollUpTotals` / `rollUpVerdict` + `persistPushScan` (batched Firestore write) |
| `src/webhookTypes.ts` | Types mirroring the agents' actual JSON (kept separate from the SSE `scan-types.ts`) |
| `scripts/registerWebhook.ts` | Thin CLI wrapper: `npm run webhook:register <owner> <repo>` |
| `scripts/checks/*.ts` | 7 runnable verification harnesses (this repo has no test runner by design) |

## Reused (not duplicated)

- `getOctokit()` (`src/lib/octokit.ts`)
- `isReviewableSourceFile()` (`src/lib/scan-filter.ts`)
- `getDb()` (`src/lib/firebase-admin.ts`, ADC + projectId)
- `scanForSecrets` / `generateFixes` (`src/secretDetector.js` / `src/fixAgent.js`) — **untouched**

## Key decisions

- **Gemini auth stays on Vertex AI** (not the Gemini API key). The agent `.js` files were left
  exactly as-is; `.env` stays Vertex-configured. This intentionally diverges from the original
  prompt's "use GEMINI_API_KEY / no Vertex" line — chosen explicitly during brainstorming.
- **Server runs under `tsx`** so it can import both the `.ts` libs and the `.js` agents.
- **New fetch module named `webhookFiles.ts`** to avoid clashing with the existing PR-oriented
  `src/lib/github.ts`.
- **`applyFixes` is NOT run on the server** — writing `.bugtrap-fixed` files makes no sense on
  a webhook host; the scan returns `{ path, verdict, findings, fixes }` only.
- **Verdict rollup:** push is `BLOCKED` if any file is BLOCKED (any CRITICAL/HIGH), `WARN` if
  only MEDIUM/LOW, else `CLEAN`. Per-file verdicts are stored too, for the UI breakdown.

## Verification status

- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` exit 0 ("✓ Compiled successfully")
- ✅ all 7 `scripts/checks/*.ts` exit 0 (signature, fetch, scan, register, persist, verdict, types)
- ✅ **Live**: GitHub → server plumbing confirmed end-to-end (push delivered, signature
  verified, ack sent, scan ran) against the real `ChingTagTeam/faulty-app` repo
- ⏳ **Live Firestore write**: not yet witnessed — blocked solely on Firestore ADC not being
  set up on the test machine. See `HANDOFF-firestore-adc-live-test.md`.
- ⚠️ `npm run lint` fails on a **pre-existing** missing `design/` dir, unrelated to this work.

## Bug found & fixed during testing

A scan-path auth failure (Firestore ADC missing) crashed the whole server via an unhandled
rejection that escaped the fire-and-forget `.catch()`. Fixed with process-level
`unhandledRejection` / `uncaughtException` guards in `src/server.ts` — a failed scan now logs
and the server keeps serving. (Commit `1507d82`.)

## Outstanding for the user

1. **Finish the live test** — needs Firestore ADC (`HANDOFF-firestore-adc-live-test.md`),
   then re-run via `RERUN-webhook-live-test.md`.
2. **Rotate leaked credentials** — the GitHub PAT and the Firebase service-account private key
   were exposed in chat during setup. Revoke + regenerate both. `.env` is gitignored.
3. **Branch/publish** — work is on `staging` and mirrored to `main` on origin.

## Process artifacts

- Spec: `docs/superpowers/specs/2026-06-22-github-push-webhook-scan-design.md`
- Plan: `docs/superpowers/plans/2026-06-22-github-push-webhook-scan.md` (reviewer-approved)
- Handoff: `docs/superpowers/HANDOFF-firestore-adc-live-test.md`
- Rerun runbook: `docs/superpowers/RERUN-webhook-live-test.md`
