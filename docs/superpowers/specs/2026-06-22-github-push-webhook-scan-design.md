# GitHub Push Webhook → Scan → Persist (Backend)

**Date:** 2026-06-22
**Status:** Approved for planning
**Scope:** Backend only. Webhook endpoint + changed-file fetch + reuse of the existing
secret-detector→fix pipeline + Firestore persistence + idempotent webhook registration.
No graph/UI work. No rebuild of the agents or pipeline.

## Goal

On every push to a connected repo, GitHub calls a BugTrap webhook. The server verifies the
signature, acks within GitHub's ~10s timeout, then asynchronously fetches the changed files,
runs them through the **existing** `scanForSecrets → generateFixes` pipeline, computes a
verdict, and persists the results to Firestore. This is the backend for the live companion
feature.

## Locked Decisions (from brainstorming)

1. **Gemini auth: keep Vertex.** Do NOT touch `src/secretDetector.js` or `src/fixAgent.js`
   (they stay on `vertexai: true`). Do NOT set up `GEMINI_API_KEY`. `.env` stays
   Vertex-configured (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`,
   `GOOGLE_APPLICATION_CREDENTIALS`). The original prompt's "use API key / no Vertex"
   requirement is intentionally dropped — webhook scans authenticate against Vertex AI using
   the existing GCP credentials.
2. **Runtime: `tsx`.** The server is TypeScript-aware (run via `tsx`), so it can import both
   the existing `.ts` libs and the existing `.js` pipeline files. The original prompt's
   literal `node src/server.js` becomes `tsx src/server.ts`.
3. **New fetch module is `src/webhookFiles.ts`**, NOT `src/github.js` — avoids a name clash
   with the existing PR-oriented `src/lib/github.ts`.
4. **Reuse, do not duplicate:** `getOctokit()` (`src/lib/octokit.ts`),
   `isReviewableSourceFile()` (`src/lib/scan-filter.ts`), `getDb()`
   (`src/lib/firebase-admin.ts`, ADC + projectId — NOT the `FIREBASE_CLIENT_EMAIL`/
   `FIREBASE_PRIVATE_KEY` cert path), and `scanForSecrets`/`generateFixes` (the `.js` files,
   untouched).
5. **Skip `applyFixes` on the webhook server.** It writes `.bugtrap-fixed` files to disk,
   which is meaningless on a server. `scanChangedFiles` returns `{ path, findings, fixes }`
   only.
6. **Webhook registration is a reusable function** `registerRepoWebhook(owner, repo)`,
   idempotent (update-if-exists), with the CLI as a thin wrapper. The product connect-repo
   flow will later call the same function.

## File Layout

```
src/server.ts              Express server: raw body, HMAC verify, 200-ack, async dispatch
src/webhookFiles.ts        fetchChangedFiles(payload) → [{ path, contents, sha }]
src/scanRepo.ts            scanChangedFiles(files) → [{ path, findings, fixes } | { path, error }]
src/registerWebhook.ts     registerRepoWebhook(owner, repo) — idempotent core (exported)
src/lib/scan-persist.ts    persistPushScan(...) → writes scans/{sha} (+ files subcollection)
scripts/registerWebhook.ts thin CLI wrapper: node/tsx scripts/registerWebhook.ts <owner> <repo>
```

## Components

### 1. `src/server.ts` — webhook endpoint (PART 1)

- `POST /webhook/github` with `express.raw({ type: '*/*' })` so the handler receives the raw
  request **Buffer** — no JSON parse before signature verification.
- **Verify signature:** `crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)`,
  `.update(rawBody)`, format `sha256=<hex>`. Compare to the `X-Hub-Signature-256` header with
  `crypto.timingSafeEqual`. Guard equal byte-length first (timingSafeEqual throws on length
  mismatch). On any mismatch / missing header / missing secret → respond **401**.
- **Event filter:** if `X-GitHub-Event` header !== `"push"` → respond **200** and do nothing.
- **Ack then process:** parse JSON only after verifying, send `res.status(200)` **immediately**,
  then fire-and-forget `processPush(payload)` (its rejections are caught and logged). Scanning
  must not block the response (GitHub ~10s timeout).
- `tsx src/server.ts` boots the server cleanly on `process.env.PORT ?? 3001`.

`processPush(payload)`: `fetchChangedFiles` → `scanChangedFiles` → `persistPushScan` → log a
one-line summary (repo, short commit SHA, files scanned, findings count, verdict).

### 2. `src/webhookFiles.ts` — fetch changed files (PART 2)

- `fetchChangedFiles(payload)`:
  - Collect `added` + `modified` paths across all `payload.commits`; dedupe; ignore `removed`.
  - Filter each path through `isReviewableSourceFile(path, size)` (reuses the existing
    skip rules: binaries, lockfiles, images, `node_modules`, build/dist dirs, dotfiles). Since
    the real size isn't known until content is fetched, pass a sentinel positive size (e.g. 1)
    so the extension/dir/lockfile rules apply at the listing stage; the true size is enforced
    after content arrives (skip if it exceeds the filter's `MAX_FILE_BYTES`).
  - For each survivor: `getOctokit().repos.getContent({ owner, repo, path, ref: payload.after })`,
    base64-decode `data.content` → UTF-8 text. Re-check size against `MAX_FILE_BYTES`.
  - Per-file `try/catch` so a single 404 / oversize / decode error drops that file and the
    batch continues.
  - Returns `[{ path, contents, sha }]` where `sha = payload.after`.
- `owner`/`repo` come from `payload.repository.{owner.name|owner.login, name}`.

### 3. `src/scanRepo.ts` — scan changed files (PART 3)

- `scanChangedFiles(files)`:
  - Concurrency-capped promise pool, **max 4 in flight** (no new dependency — a small index-
    cursor pool), to stay under Gemini/Vertex rate limits.
  - Per file: `scanForSecrets(path, contents)`; if `findings.length > 0`, call
    `generateFixes(path, contents, findings)`, else `fixes = { fixes: [], summary: {...} }`.
  - Returns `{ path, findings, fixes }` per file.
  - Wrap each file in `try/catch`; on failure record `{ path, error: <message> }` and continue
    (graceful degradation — one failure never kills the batch). Never put file contents or raw
    secrets in the error string.

### 4. `src/lib/scan-persist.ts` — persist (PART 4)

- `persistPushScan({ repo, branch, commitSha, results })`:
  - `scans/{commitSha}` ← `{ repo, branch, commitSha, pushedAt: serverTimestamp, filesScanned,
    totals, verdict }`.
  - `scans/{commitSha}/files/{autoId}` ← `{ path, findings, fixes, error? }` (batched write).
  - Uses `getDb()` (ADC). Reuses the FieldValue.serverTimestamp pattern from `firestore.ts`.
- **Verdict / totals** (matches `agents/secret-detector-agent.md`): aggregate every file's
  detector summary into `totals = { critical, high, medium, low }`. Verdict = `BLOCKED` if any
  CRITICAL or HIGH; `WARN` if only MEDIUM/LOW; else `CLEAN`. Files that errored contribute
  nothing to totals.
- Findings are already redacted (`match_redacted`) by the detector — stored as-is. No raw
  secret, token, file content, or the webhook secret is ever written or logged.

### 5. `src/registerWebhook.ts` + `scripts/registerWebhook.ts` (PART 5)

- `registerRepoWebhook(owner, repo)` (exported):
  - `url = process.env.PUBLIC_URL + "/webhook/github"`.
  - `getOctokit().repos.listWebhooks({ owner, repo })`; find a hook whose `config.url === url`
    (the "is this a BugTrap webhook" signal).
  - If found → `updateWebhook` (refresh `secret`, `content_type: 'json'`, `events: ['push']`,
    `active: true`). If not → `createWebhook` with the same config.
  - Returns `{ id, action: 'created' | 'updated' }`. Never logs the secret.
  - Idempotent: re-running on a repo updates the existing hook rather than duplicating it.
  - This same function is what the future UI connect-repo endpoint calls, so connecting a repo
    auto-registers the webhook with no manual step.
- `scripts/registerWebhook.ts`: thin CLI — reads `<owner> <repo>` from argv, calls
  `registerRepoWebhook`, prints the result, exits non-zero on missing args/env.

## Environment

Add to `.env.local` and document in README:
- `GITHUB_WEBHOOK_SECRET` — HMAC secret shared with GitHub (new).
- `PUBLIC_URL` — externally reachable base URL of the webhook server, e.g. an ngrok/Cloud Run
  URL (new). The registered hook target is `PUBLIC_URL + /webhook/github`.
- `PORT` (optional) — server port, default 3001.

Already present / reused, NOT re-added:
- `GITHUB_TOKEN` — used by `getOctokit()`.
- Firebase via ADC + `FIREBASE_PROJECT_ID` (already wired in `firebase-admin.ts`). The PART 4
  `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` cert vars are **not** used.
- Vertex vars (`GOOGLE_*`) for the agents — unchanged.

Explicitly NOT added: `GEMINI_API_KEY` (Vertex decision).

## Data Flow

```
GitHub push
  → POST /webhook/github (raw body)
  → verify HMAC (401 if bad) → check event==push → 200 ACK
  → [async] fetchChangedFiles(payload)            (webhookFiles.ts, reuses getOctokit + scan-filter)
  → scanChangedFiles(files)                        (scanRepo.ts, reuses scanForSecrets/generateFixes, cap 4)
  → persistPushScan(...)                           (scan-persist.ts, reuses getDb; computes verdict/totals)
  → log one-line summary
```

## Error Handling

- Bad/missing signature → 401, no processing.
- Non-push event → 200, no processing.
- Per-file fetch failure → file dropped, batch continues.
- Per-file scan failure → `{ path, error }` recorded, batch continues, file excluded from totals.
- `processPush` rejection → caught and logged (after the 200 ack); never crashes the server.

## Testing / Verify

- `npx tsc --noEmit` clean (TS server + libs).
- `tsx src/server.ts` boots without throwing.
- Local end-to-end: run server, expose via `PUBLIC_URL`, `tsx scripts/registerWebhook.ts
  <owner> <repo>`, push a commit with a planted secret, confirm a `scans/{sha}` doc with the
  expected verdict and redacted findings.
- Signature negative test: a request with a wrong signature returns 401.

## Out of Scope

- Graph / UI / connect-repo HTTP endpoint (the function is built to be called later).
- Modifying the agents, the pipeline `.js` files, or the Gemini auth strategy.
- `applyFixes` on the server.
- Bug Finder / readability lanes (this is the secret-detector→fix lane only).
