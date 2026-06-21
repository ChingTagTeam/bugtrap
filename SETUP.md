# BugTrap — Credentials & Setup Checklist

Everything you need to configure so the app runs end-to-end: GitHub sign-in,
public-repo scanning, the AI code-review agents (Vertex AI / Gemini), and
Firestore persistence.

All secrets live in **`.env`** at the repo root (gitignored — never commit it).
Restart `npm run dev` after editing `.env`.

---

## 0. The `.env` keys at a glance

```bash
# ── Vertex AI / Gemini (powers the code-review agents) ──
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=bugtrap-50749
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json   # ← currently EMPTY = code review is OFF

# ── Firebase Admin (server: verifies ID tokens, writes Firestore) ──
FIREBASE_PROJECT_ID=bugtrap-50749
# FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are declared but the server
# uses Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS) instead.

# ── Firebase Web (client: sign-in + revisit reads) ──
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=bugtrap-50749.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=bugtrap-50749
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=bugtrap-50749.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# ── GitHub server token (public-repo scans WITHOUT sign-in) ──
GITHUB_TOKEN=ghp_xxx
```

---

## 1. Code review (Vertex AI / Gemini) — **this is the current blocker**

Right now `GOOGLE_APPLICATION_CREDENTIALS` is **empty**, so every Gemini call
fails auth, the agents silently degrade to **zero findings**, and every scan
falsely reports "safe." Fix it with **one** of the two options below.

**Option A — service-account key (works the same locally and in prod):**
1. Google Cloud Console → project `bugtrap-50749` → **APIs & Services** → enable **Vertex AI API**.
2. **IAM & Admin → Service Accounts** → create (or pick) a service account.
3. Grant it roles: **Vertex AI User** and **Cloud Datastore User** (the latter lets the same key write Firestore).
4. **Keys → Add key → JSON** → download it somewhere private (e.g. `~/.config/bugtrap/sa.json`).
5. Set `GOOGLE_APPLICATION_CREDENTIALS=/Users/you/.config/bugtrap/sa.json` in `.env`.

**Option B — your own gcloud login (local dev only):**
```bash
gcloud auth application-default login
gcloud config set project bugtrap-50749
gcloud services enable aiplatform.googleapis.com
```
Then leave `GOOGLE_APPLICATION_CREDENTIALS` empty (ADC is picked up automatically).

> Model is `gemini-2.5-flash` (set in `src/lib/gemini.ts`). Make sure it's
> available in your `GOOGLE_CLOUD_LOCATION` (`us-central1` is fine).

**Verify:** restart `npm run dev`, scan a repo with real code, and findings
should populate (the Findings tab count goes above 0).

---

## 2. Firebase project (auth + persistence)

1. [Firebase Console](https://console.firebase.google.com) → project `bugtrap-50749`.
2. **Project settings → General → Your apps → Web app** → copy the config values
   into the `NEXT_PUBLIC_FIREBASE_*` keys in `.env`.
3. **Build → Firestore Database** → create it (production mode is fine; rules below lock it down).
4. Deploy the rules (already in `firestore.rules`):
   ```bash
   npx -y firebase-tools@latest login
   npx -y firebase-tools@latest deploy --only firestore:rules --project bugtrap-50749
   ```

---

## 3. GitHub — two separate pieces

### 3a. "Sign in with GitHub" (Firebase OAuth) — needed for private-repo scanning
1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - **Homepage URL:** `http://localhost:3000` (and your prod URL later).
   - **Authorization callback URL:** `https://bugtrap-50749.firebaseapp.com/__/auth/handler`
     (copy the exact handler URL from the Firebase GitHub provider screen).
2. Copy the **Client ID** and generate a **Client Secret**.
3. Firebase Console → **Authentication → Sign-in method → GitHub** → enable it,
   paste the Client ID + Secret, save.
4. **Authentication → Settings → Authorized domains** → ensure `localhost` is
   listed (add your prod domain when you deploy).
   > The app requests the `repo` and `read:user` scopes at sign-in.

### 3b. `GITHUB_TOKEN` (server PAT) — needed for public-repo scans with NO sign-in
1. GitHub → **Settings → Developer settings → Personal access tokens**.
   - Classic: scope **`public_repo`**, **or**
   - Fine-grained: **Public repositories (read-only)**.
2. Set `GITHUB_TOKEN=ghp_...` in `.env`.
   > Used by the shared server Octokit to read the tree/contents of public repos.

---

## 4. Run

```bash
npm install
npm run dev          # http://localhost:3000
# before shipping:
npx tsc --noEmit && npm run lint && npm run build
```

## Quick sanity checks
- **Public scan (no login):** `/scan` → paste `github.com/pallets/flask` → graph builds.
- **Code review on:** findings appear (needs §1).
- **Sign-in:** nav "Sign in with GitHub" succeeds and your repos load on `/scan` (needs §3a).
- **Revisit a review:** reload a `/review/<id>` URL and it loads from Firestore (needs §2 + §1 credentials).
