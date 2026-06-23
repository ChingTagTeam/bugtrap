# Handoff: finish the GitHub-webhook live test (Firestore ADC blocker)

> **For the person with GCP access on project `bugtrap-50749`.** Paste this whole file
> into your Claude Code session in the BugTrap repo, then follow it. It picks up a live
> end-to-end test that is one credential away from working.

## TL;DR

The GitHub push-webhook → secret-scan → Firestore backend is built and works end-to-end
**except** Firestore can't authenticate. The webhook fires, signature verifies, the server
acks, the scan runs — then `batch.commit()` to Firestore fails with:

```
[scan] processing failed: Could not load the default credentials.
```

Firestore (via `firebase-admin`) uses **Application Default Credentials (ADC)**, and ADC is
not set up on the test machine. **You have the GCP access to fix this.** Once ADC works, the
test should produce a `scans/{commitSha}` doc with `verdict: "BLOCKED"`.

## Your job (in order)

### 1. Set up ADC for project `bugtrap-50749`

Easiest path — log in with an account that has **Cloud Datastore User** / Firestore write
access on `bugtrap-50749`:

```bash
gcloud auth application-default login
gcloud config set project bugtrap-50749   # optional but tidy
```

This writes ADC to `~/.config/gcloud/application_default_credentials.json`, which
`firebase-admin` discovers automatically. **No code change needed** — `src/lib/firebase-admin.ts`
initializes with just `projectId` and relies on ADC (this is intentional; it matches the
existing review flow).

Alternative (service-account JSON), if you prefer not to use your user creds:
```bash
# download a key for a service account with Firestore write on bugtrap-50749, then:
export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/key.json
```
Set the same in `.env` so `npm run webhook` picks it up.

### 2. Confirm ADC actually works before re-testing

```bash
gcloud auth application-default print-access-token >/dev/null && echo "ADC OK"
```
If that prints `ADC OK`, Firestore writes will authenticate.

### 3. Verify Firestore write works in isolation (fast feedback, no GitHub needed)

Run this throwaway check (it writes one doc via the real persistence path, then you can
delete it from the console):

```bash
npx tsx -e "
import 'dotenv/config';
import { persistPushScan } from './src/lib/scan-persist';
const summary = await persistPushScan({
  repo: 'handoff/adc-smoketest', branch: 'main', commitSha: 'adc-smoketest-DELETE-ME',
  results: [{ path: 'leak.js', verdict: 'BLOCKED',
    findings: [{ type: 'CLOUD_ACCESS_KEY', severity: 'CRITICAL', file: 'leak.js', line: 1,
      match_redacted: 'AKIA****', reason: 'test', recommendation: 'rotate', confidence: 0.99 }],
    fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } }],
});
console.log('WROTE scans/adc-smoketest-DELETE-ME →', JSON.stringify(summary));
"
```
Expect: `WROTE scans/adc-smoketest-DELETE-ME → {...,"verdict":"BLOCKED"}`.
Then confirm `scans/adc-smoketest-DELETE-ME` exists in the Firebase console (project
`bugtrap-50749` → Firestore) and **delete it**. If this works, the live test will work.

### 4. Run the full live test

Needs three terminals. The repo, GitHub token, and webhook secret are already configured in
`.env` (gitignored).

**Terminal A — server (watch this one):**
```bash
npm run webhook        # → "webhook server listening on :3001"
```

**Terminal B — public tunnel** (GitHub must reach localhost):
```bash
cloudflared tunnel --url http://localhost:3001
# copy the https://<random>.trycloudflare.com URL it prints
```
Put that URL in `.env` as `PUBLIC_URL=https://<random>.trycloudflare.com` (no trailing slash).
*(If `cloudflared` isn't installed: `brew install cloudflared`. ngrok works too.)*

**Terminal C — register the webhook, then push a secret:**
```bash
npm run webhook:register ChingTagTeam faulty-app
# → "Webhook created (id …)"  (run again → "Webhook updated (id …)" = idempotent)

# in the faulty-app working copy, on main:
echo 'const k = "AKIAIOSFODNN7EXAMPLE";' > leak.js
git add leak.js && git commit -m "test: planted secret" && git push
```

**Watch Terminal A** — within a few seconds:
```
[scan] ChingTagTeam/faulty-app <sha7> files=1 findings=1 verdict=BLOCKED
```

**Confirm in Firestore:** `scans/{commitSha}` →
`{ repo, branch, commitSha, pushedAt, filesScanned, totals, verdict: "BLOCKED" }`, and a
`files` subcollection doc with `{ path: "leak.js", verdict: "BLOCKED", findings: [...], fixes }`.
The finding's `match_redacted` must be `AKIA****` — **never** the raw key.

## Gotchas we already hit (so you don't re-discover them)

- **404 on getContent.** The push that triggers the scan must be the one that *adds* `leak.js`.
  If you registered the hook, then pushed, then see `GET …/contents/leak.js?ref=<sha> - 404`,
  the file isn't present at that commit. Just push again so the latest commit has the file;
  the scan keys off the push's `after` SHA. A single dropped file is non-fatal (the batch
  continues), but if the only file 404s you'll get `files=0`.
- **Server crash on auth failure is FIXED.** We added `process.on('unhandledRejection' / 'uncaughtException')`
  guards in `src/server.ts` so a Firestore/Vertex auth failure logs and keeps the server alive
  instead of exiting. If you see `[scan] unhandled rejection: …`, the scan failed but the
  server is still up — read the message; it's almost always ADC or Vertex creds.
- **Two separate clouds must both auth:**
  - **Vertex AI** (the secret-detector + fix agents) uses `GOOGLE_GENAI_USE_VERTEXAI=true` +
    `GOOGLE_CLOUD_PROJECT=bugtrap-50749` + `GOOGLE_APPLICATION_CREDENTIALS`. If the *scan* step
    fails (not the persist), it's Vertex creds, not Firestore. The agents are at
    `src/secretDetector.js` / `src/fixAgent.js` (do not edit — Vertex is an intentional choice).
  - **Firestore** uses ADC as above. These are independent; both must work.
- **GitHub fine-grained token** for `ChingTagTeam/faulty-app` needs **Webhooks: read/write,
  Contents: read, Metadata: read**, resource owner = the org, and org approval. Already done —
  the token in `.env` returns repo `admin: true` and `list-hooks` 200.
- **`npm run lint` fails** on a missing `design/` dir — pre-existing, unrelated to this work.
  Use `npx tsc --noEmit` + `npm run build` to verify (both green).

## What's already verified (you don't need to re-check)

- All 7 offline check scripts in `scripts/checks/` pass (`tsc --noEmit` clean, `npm run build`
  exit 0).
- Signature verify (HMAC-SHA256, timing-safe), event filter, 200-ack-before-scan, idempotent
  registration, concurrency-capped scanning, and the rollup verdict logic all unit-checked.
- The ONLY unproven leg is the live Firestore write, blocked solely on ADC.

## Security reminder

The `.env` in this repo currently contains **live** credentials (GitHub PAT, a Firebase
service-account private key, Firebase API keys). These were exposed in chat during setup —
**rotate the GitHub PAT and the GCP/Firebase service-account key** after testing. Never commit
`.env` (it's gitignored). The scan output stores only redacted findings (`match_redacted`).

## Reference: the data the test produces

```
scans/{commitSha}
  repo:         "ChingTagTeam/faulty-app"
  branch:       "main"
  commitSha:    "<full sha>"
  pushedAt:     <serverTimestamp>
  filesScanned: <n>
  totals:       { critical, high, medium, low }
  verdict:      "BLOCKED" | "WARN" | "CLEAN"   ← BLOCKED if any file has CRITICAL/HIGH

scans/{commitSha}/files/{autoId}
  path:     "leak.js"
  verdict:  "BLOCKED" | "WARN" | "CLEAN" | null
  findings: [ { type, severity, file, line, match_redacted, reason, recommendation, confidence } ]
  fixes:    { fixes: [...], summary: { auto_fixes, suggested_fixes } }
  error?:   "<message>"   ← present only if that file failed to scan
```
