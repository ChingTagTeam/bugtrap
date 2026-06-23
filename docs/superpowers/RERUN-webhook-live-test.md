# Re-run the GitHub webhook live test (once ADC works)

> Quick runbook for re-running the push-webhook → secret-scan → Firestore test **after**
> Firestore ADC is configured. For the one-time ADC setup, see
> `HANDOFF-firestore-adc-live-test.md`. This file assumes ADC already works.

## Pre-flight (10 seconds)

```bash
# 1. ADC is live?
gcloud auth application-default print-access-token >/dev/null && echo "ADC OK"

# 2. GitHub token can reach the repo? (expect: "admin": true and 200)
TOK=$(grep -E '^GITHUB_TOKEN=' .env | sed -E 's/^[^=]+=//; s/^"//; s/"$//')
curl -s -o /dev/null -w "repo HTTP %{http_code}\n" -H "Authorization: token $TOK" \
  https://api.github.com/repos/ChingTagTeam/faulty-app/hooks
```

## Three terminals

**A — server (watch this):**
```bash
npm run webhook        # → "webhook server listening on :3001"
```

**B — tunnel (GitHub must reach localhost):**
```bash
cloudflared tunnel --url http://localhost:3001
# copy the printed https://<random>.trycloudflare.com
```
Then set in `.env` (no trailing slash):
```
PUBLIC_URL=https://<random>.trycloudflare.com
```
> The tunnel URL changes every time you restart `cloudflared`. Re-set `PUBLIC_URL` and
> re-run the register step (below) whenever you get a new URL — the webhook is registered
> against whatever `PUBLIC_URL` was at register time.

**C — register + push a secret:**
```bash
npm run webhook:register ChingTagTeam faulty-app    # created / updated (idempotent)

# in the faulty-app checkout, on main — make sure THIS commit adds the file:
echo 'const k = "AKIAIOSFODNN7EXAMPLE";' > leak.js
git add leak.js && git commit -m "test: planted secret" && git push
```

## Expected result

**Terminal A** logs one line:
```
[scan] ChingTagTeam/faulty-app <sha7> files=1 findings=1 verdict=BLOCKED
```

**Firestore** (project `bugtrap-50749`):
- `scans/{commitSha}` → `verdict: "BLOCKED"`, `totals`, `filesScanned`, `pushedAt`
- `scans/{commitSha}/files/{id}` → `path: "leak.js"`, `verdict: "BLOCKED"`,
  `findings[].match_redacted == "AKIA****"` (never the raw key)

## Negative test (signature security)

```bash
curl -i -X POST "$PUBLIC_URL/webhook/github" -H "X-GitHub-Event: push" -d '{}'
# expect: HTTP/1.1 401
```

## If it doesn't work

| Symptom (terminal A) | Cause | Fix |
|---|---|---|
| `GET …/contents/leak.js?ref=<sha> - 404` then `files=0` | the triggering push didn't contain `leak.js` at that commit | push again so the latest commit adds the file (scan keys off the push `after` SHA) |
| `[scan] processing failed: Could not load the default credentials` | Firestore ADC missing/expired | re-run `gcloud auth application-default login` |
| `[scan] unhandled rejection: …` but server stays up | a scan-path failure (Vertex or Firestore) | read the message — server no longer crashes by design |
| scan step fails (not persist) | Vertex AI creds (`GOOGLE_APPLICATION_CREDENTIALS` / project) | the agents use Vertex, not Firestore ADC — fix Vertex creds |
| nothing in terminal A after push | GitHub couldn't deliver | repo → Settings → Webhooks → **Recent Deliveries** shows the response code + payload |
| 401 on every delivery | `GITHUB_WEBHOOK_SECRET` mismatch between `.env` and the registered hook | re-run `webhook:register` so the hook secret matches current `.env` |

## Cleanup after testing

- Delete test docs from Firestore (`scans/<test sha>`, and any `scans/adc-smoketest-*`).
- Optionally remove the webhook: repo → Settings → Webhooks → delete the BugTrap hook
  (or leave it — re-registering is idempotent).
- Stop `cloudflared` (Ctrl-C) — the tunnel URL dies with it.
