# Handoff: wire Vertex AI auth so scans work on Vercel

> Paste this whole file into a fresh Claude Code session in the BugTrap repo, then follow it.
> It picks up a diagnosed-but-unfixed problem: the multi-agent scan runs but finds nothing
> because Gemini (via Vertex AI) can't authenticate. Goal: make scans actually produce
> findings, and make it work deployed on Vercel.

## TL;DR — what's wrong

The three review agents (security / correctness / readability) ARE wired into the scan
correctly:

`/api/scan` → `src/lib/scan-runner.ts` → `runSecurityAgent` / `runCorrectnessAgent` /
`runReadabilityAgent` in `src/lib/agents.ts` → `ai.models.generateContent` (Gemini via Vertex).

But every scan returns **zero findings on every file**, which looks like "the agents aren't
connected." Root cause: **the Gemini client can't authenticate to Vertex AI**, every
`generateContent` call throws, and each agent's `try/catch` swallows the error and returns
`{ findings: [], degraded: true }`. So the scan completes "clean" silently.

Two independent auth problems:

1. **`src/lib/gemini.ts`** constructs `new GoogleGenAI({})` with NO credentials, relying on
   Application Default Credentials (ADC) from the environment. `.env` sets
   `GOOGLE_GENAI_USE_VERTEXAI=true` (Vertex mode), but `GOOGLE_APPLICATION_CREDENTIALS` is
   **empty** and there's no `gcloud` ADC. On **Vercel** there is no gcloud and no ADC file at
   all — so this can never work as written.
2. **`src/lib/firebase-admin.ts`** has the SAME problem — it inits with only `projectId` and
   relies on ADC for Firestore writes. Also breaks on Vercel.

Plus a credential data problem (see "Prerequisite" below): the `FIREBASE_CLIENT_EMAIL` in
`.env` is a `@gmail.com` address, which is NOT a service account. Vertex AI requires a real
service-account identity.

## Prerequisite — the human must provide a real service-account key

This is the ONE thing code can't fix. The user needs to, in the GCP console for project
`bugtrap-50749`:

1. **IAM & Admin → Service Accounts** → use the existing
   `firebase-adminsdk-...@bugtrap-50749.iam.gserviceaccount.com` account (or create one).
2. Ensure it has role **Vertex AI User** (`roles/aiplatform.user`). Firestore write it likely
   already has via Firebase Admin.
3. **Keys → Add Key → Create new key → JSON** → download.

The downloaded JSON contains a matching `client_email` (ends in
`.iam.gserviceaccount.com`) and `private_key`. **Those replace the current bad values.**

Before writing any code, confirm with the user that they have this JSON file and ask for its
path (or for the `client_email` + `private_key` values). If they don't have it yet, STOP and
give them the GCP steps above — nothing else will work without it.

## The fix (do this once the SA key exists)

The deploy target is **Vercel**, whose filesystem is read-only/ephemeral — so
`GOOGLE_APPLICATION_CREDENTIALS` (a file path) is unreliable. Credentials must be passed to
the SDKs **explicitly from env vars**, not discovered from a file.

Standardize on two env vars holding the SA identity (reuse the existing
`FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` names — they already exist, just need correct
values). Plan:

### 1. `src/lib/gemini.ts` — pass credentials explicitly in Vertex mode

`@google/genai` v2 supports `googleAuthOptions`. Change `getAI()` to:

```ts
import { GoogleGenAI } from '@google/genai';

function privateKey(): string {
  // Vercel may store the key with literal "\n" — normalize to real newlines.
  return (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
}

export function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
      googleAuthOptions: {
        credentials: {
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: privateKey(),
        },
      },
    });
  }
  return _ai;
}
```

Keep `MODEL` and `modelForAgent` as-is. Verify the exact `googleAuthOptions` shape against
`node_modules/@google/genai/dist/genai.d.ts` before finalizing.

### 2. `src/lib/firebase-admin.ts` — use an explicit cert, not ADC

```ts
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';

_app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  }),
});
```

Note: `verifyIdToken` worked before with just `projectId`; adding `cert()` keeps it working
and additionally enables authenticated Firestore writes on Vercel.

### 3. Make the silent failure visible (small, high-value)

Right now an auth failure is invisible — it looks like a clean repo. In `src/lib/agents.ts`,
add a `console.warn` in each agent's `catch` block (it currently just returns
`degraded: true`) so the real error surfaces in Vercel logs:

```ts
} catch (e) {
  console.warn('[agent:security] failed:', e instanceof Error ? e.message : e);
  return { agent: 'security', findings: [], degraded: true };
}
```

(Optional, ask the user first: bubble `degraded` into the SSE stream in `scan-runner.ts` so
the UI shows "agent degraded" instead of a false all-clear. The `degraded` flag is already
computed but `runScan` never reads it.)

### 4. Update `.env` (local) and Vercel (deploy)

**Local `.env`:** set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` to the values from
the new SA JSON. Leave `GOOGLE_APPLICATION_CREDENTIALS` empty or remove it. Keep
`GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT=bugtrap-50749`,
`GOOGLE_CLOUD_LOCATION=us-central1`.

**Vercel → Settings → Environment Variables** (give the user this exact list):
- `GOOGLE_GENAI_USE_VERTEXAI` = `true`
- `GOOGLE_CLOUD_PROJECT` = `bugtrap-50749`
- `GOOGLE_CLOUD_LOCATION` = `us-central1`
- `FIREBASE_PROJECT_ID` = `bugtrap-50749`
- `FIREBASE_CLIENT_EMAIL` = `<the SA email ending in .iam.gserviceaccount.com>`
- `FIREBASE_PRIVATE_KEY` = `<the full private_key, paste with real newlines>`
- plus the existing `NEXT_PUBLIC_FIREBASE_*` vars and `GITHUB_TOKEN` already in `.env`.
- **Do NOT set** `GOOGLE_APPLICATION_CREDENTIALS` on Vercel (no file there).

The `.replace(/\\n/g, '\n')` in the code handles whether Vercel stores the key escaped or with
literal newlines, so either paste style works.

## Verify before claiming done

1. **Local credential smoke test** (throwaway, no UI needed):
   ```bash
   npx tsx -e "
   import 'dotenv/config';
   import { runSecurityAgent } from './src/lib/agents';
   const r = await runSecurityAgent('const q = \"SELECT * FROM users WHERE id=\" + req.query.id;');
   console.log(JSON.stringify(r, null, 2));
   "
   ```
   Expect a non-empty `findings` array (an SQL-injection flag) and **no** `degraded: true`.
   If you get `degraded: true`, the warn log will now print the real auth error — read it.
2. **Build:** `npx tsc --noEmit && npm run build` must be green. (Note: `npm run lint` may fail
   on a missing `design/` dir — pre-existing, unrelated.)
3. **End-to-end:** run a scan on a known-faulty repo through the UI; findings should appear and
   the verdict should be `blocked`, not a silent `safe`.
4. **On Vercel:** after deploy, run a scan; if it fails, check the Vercel function logs for the
   `[agent:*] failed:` warnings added in step 3.

## Key files

- `src/lib/gemini.ts` — Gemini/Vertex client (the main fix)
- `src/lib/agents.ts` — the three agents + coordinator + patch agent
- `src/lib/scan-runner.ts` — orchestrates the scan, calls the agents
- `src/lib/firebase-admin.ts` — Firestore/Auth admin (needs the same cert fix)
- `src/app/api/scan/route.ts` — the SSE scan endpoint
- `.env` — credentials (gitignored; contains live values — do not commit or log them)

## Constraints (from CLAUDE.md)

- LLM calls go through the official Google Gen AI SDK via Vertex AI — **keep Vertex**, don't
  swap to a raw Gemini API key.
- Firebase for persistence — don't reimplement.
- TypeScript strict: no `any`, no `!`, no `as` to silence errors. Explicit return types on
  exported functions.
- Surgical changes only — touch `gemini.ts`, `firebase-admin.ts`, and the agent catch blocks;
  don't refactor the scan runner or the UI.
- **Secrets:** never commit or log the private key. The warn logs print error messages only,
  never credential values.

## Security reminder

`.env` holds a live private key. After this is working, consider rotating the SA key if it was
ever pasted into a chat. Confirm `.env` is gitignored (it is).
