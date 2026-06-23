# Handoff: grant the service account Firestore write access (last blocker)

> **For the person with GCP admin / login on project `bugtrap-50749`.**
> Everything else is done and verified. This is the one remaining step, and it's a
> console/`gcloud` action only you can do — no code change is involved.

## TL;DR

Sidecode scans now run on Vertex AI and produce real findings (verified — it flagged a
planted SQL injection as CRITICAL). But it **can't save those findings to Firestore**: every
write fails with

```
code 7 — Missing or insufficient permissions.  (PERMISSION_DENIED)
```

The service account **`firebase-adminsdk-fbsvc@bugtrap-50749.iam.gserviceaccount.com`** is
missing a Firestore write role. Grant it **Cloud Datastore User** (`roles/datastore.user`) and
the whole pipeline works end-to-end.

## What's already done and verified (don't redo)

| Thing | Status | How it was verified |
|---|---|---|
| SA key authenticates | ✅ | SA mints an access token; identity confirmed |
| Billing enabled on `bugtrap-50749` | ✅ | error advanced past `BILLING_DISABLED` |
| SA has Vertex role ("Agent Platform User" = `roles/aiplatform.user`) | ✅ | granted in console; predict call now succeeds |
| Vertex scan returns real findings | ✅ | `runSecurityAgent` → `degraded: false`, 1 CRITICAL `sql_injection` |
| Agents run concurrently on Vertex | ✅ | code path proven |
| **Firestore write** | ❌ | **`code 7` PERMISSION_DENIED — this handoff** |

Note: the earlier transient `429 RESOURCE_EXHAUSTED` on Vertex was just fresh-project
throttling; a retry succeeded. Not a concern.

## The fix — grant Cloud Datastore User

### Fastest: `gcloud` (unambiguous, bypasses the console's rebranded role names)

```bash
gcloud config set project bugtrap-50749

# 1. See what roles the SA currently has (diagnosis)
gcloud projects get-iam-policy bugtrap-50749 \
  --flatten="bindings[].members" \
  --filter="bindings.members:firebase-adminsdk-fbsvc@bugtrap-50749.iam.gserviceaccount.com" \
  --format="value(bindings.role)"

# 2. Grant the missing Firestore write role
gcloud projects add-iam-policy-binding bugtrap-50749 \
  --member="serviceAccount:firebase-adminsdk-fbsvc@bugtrap-50749.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

After step 1 you should see `roles/aiplatform.user` already present. After step 2 you should
also see `roles/datastore.user`. Wait ~1–2 min for propagation.

### Or: Google Cloud Console (not Firebase console)

1. https://console.cloud.google.com → project **bugtrap-50749** selected (top bar).
2. **IAM & Admin → IAM** → `https://console.cloud.google.com/iam-admin/iam?project=bugtrap-50749`
3. Find the principal **`firebase-adminsdk-fbsvc@bugtrap-50749.iam.gserviceaccount.com`**.
   - If it's not listed, toggle **"Include Google-provided role grants"** (top-right).
   - If still absent, click **+ GRANT ACCESS**, paste that email as the principal, and assign
     the role below.
4. Click the **pencil (Edit)** on that row → **+ ADD ANOTHER ROLE**.
5. Filter for **`Datastore`** → choose **Cloud Datastore User**. (Not Viewer, not Owner.)
6. **Save**, wait ~1–2 min.

> ⚠️ Make sure you're on **IAM & Admin → IAM** (grants a role to the principal), NOT
> **Service Accounts → [SA] → Permissions** (that controls who can *impersonate* the SA — a
> grant there will NOT fix this).

## How to confirm it worked

The repo owner can re-run the Firestore smoke test (needs the real `.env`, which is gitignored
and local to their machine):

```bash
npx tsx -e '
import "dotenv/config";
(async () => {
  const { getDb } = await import("./src/lib/firebase-admin");
  const db = getDb();
  const ref = db.collection("_smoketest").doc("DELETE-ME");
  await ref.set({ ok: true });
  console.log("WRITE OK:", (await ref.get()).exists);
  await ref.delete();
})();
'
```
Expect `WRITE OK: true` (instead of `code 7`). If it still says `code 7`, IAM hasn't
propagated — wait a few minutes and retry, or re-check the role landed on the right principal
via the `get-iam-policy` command above.

## Context (why this is the last step)

- The app authenticates BOTH Vertex (the agents) AND Firestore (persistence) with the **same**
  service-account key, passed explicitly from env vars (`FIREBASE_CLIENT_EMAIL` /
  `FIREBASE_PRIVATE_KEY`) so it works locally and on Vercel. See `src/lib/gemini.ts` and
  `src/lib/firebase-admin.ts`.
- The SA got the Vertex role already, which is why scans run. It just never got a Firestore
  role, which is why saving results fails. Two independent IAM roles; both required.

## After this works — remaining (NOT your job, noting for completeness)

1. **🔴 Rotate the SA key.** The private key for this SA (`firebase-adminsdk-fbsvc`, key id
   `beb5139c…`) was pasted into a chat during setup and is compromised. Once the pipeline is
   verified: GCP Console → IAM & Admin → Service Accounts → that SA → **Keys** → delete key
   `beb5139c…`, **Create new key (JSON)**, then update local `.env` and the Vercel env vars
   with the new `client_email` + `private_key`.
2. **Deploy to Vercel** + set env vars (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`,
   `GOOGLE_CLOUD_LOCATION`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
   `FIREBASE_PRIVATE_KEY`, the `NEXT_PUBLIC_FIREBASE_*` set, `GITHUB_TOKEN`). Do NOT set
   `GOOGLE_APPLICATION_CREDENTIALS` on Vercel.
3. **Register a repo's webhook** via the app (`/api/github/webhook/register`) so a `git push`
   triggers the live rescan.

These are the steps to the deployed live-companion; the Firestore grant above is the only
thing blocking the pipeline from working at all.
