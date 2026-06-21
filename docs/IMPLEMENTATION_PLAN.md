# BugTrap — GitHub Repo Scan + Obsidian-Style Review Graph — Implementation Plan

> **Status:** in progress. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-authenticated repo scanner that runs the *existing* multi-agent review pipeline over a repository's source files, streams the build-out over SSE, and visualizes it as an Obsidian-style force-directed graph with a Monaco mini-IDE for inspecting findings — all matching the landing page's dark/lime/animated brand.

**Architecture:** Reuse everything in `src/lib/*` (agents, gemini, github/octokit, firestore) and the `ReadableStream` SSE pattern from `src/app/api/review/route.ts`. New surface = Firebase **client** Auth (GitHub OAuth), Admin **ID-token verification**, per-user GitHub token storage, a new named-event SSE scan route, and three new client pages (`/scan`, `/review/[reviewId]`) plus API routes for repos/tree/file. The review page generates the `reviewId` client-side (random UUID) so the URL is known before the scan starts; the scan POST uses that id. Fresh scans stream the live build-out; revisits load persisted data via the client Firestore SDK (owner-only rules).

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · `firebase` (client) + `firebase-admin` (server) · `@octokit/rest` · `@google/genai` (Vertex) · `react-force-graph-2d` (canvas) · `@monaco-editor/react` · `d3-scale` · `lucide-react` · SSE.

**Verify (no test suite in repo):** every part ends with `npx tsc --noEmit`; the final gate is `npx tsc --noEmit && npm run lint && npm run build`.

---

## Reuse map (do NOT rebuild)

| Need | Reuse |
|------|-------|
| Run review on a file | `runSecurityAgent`, `runCorrectnessAgent`, `runReadabilityAgent`, `runCoordinatorAgent`, `runPatchAgent` in `src/lib/agents.ts` |
| Model / Vertex client | `getAI`, `MODEL`, `modelForAgent` in `src/lib/gemini.ts` |
| GitHub API | `getOctokit` in `src/lib/octokit.ts` (global token) — extend with per-user-token factory |
| SSE shape | `ReadableStream` + `TextEncoder` pattern in `src/app/api/review/route.ts` |
| Firestore admin | `firebase-admin` init currently inline in `src/lib/firestore.ts` — consolidate into one admin module both use |
| Types | `Finding`, `RankedFinding`, `AgentReport`, `Verdict`, `Severity`, `AgentName` in `src/lib/types.ts` |
| Brand tokens / keyframes | `.bt-root` block + `bt-*` keyframes in `src/app/globals.css`; reference via `var(--token)` |

**Untouched:** the landing hero composition (except wiring its dead CTA + adding a top nav), and the entire `/app` paste-review flow.

---

## File structure

**Create — shared foundation**
- `src/lib/firebase.client.ts` — client Firebase app + `getFirebaseAuth()`, `GithubAuthProvider` helper. Uses `NEXT_PUBLIC_FIREBASE_*`.
- `src/lib/firebase-admin.ts` — single Admin init (`cert()` from `FIREBASE_*` when present, else ADC). Exports `getDb()`, `getAdminAuth()`.
- `src/lib/auth-server.ts` — `requireUid(req)`: verify `Authorization: Bearer <idToken>` → uid (throws `AuthError`).
- `src/components/AuthProvider.tsx` — `'use client'` context: `onAuthStateChanged`, `user`, `signInWithGitHub()`, `signOut()`, captures the GitHub OAuth token from the popup result and POSTs `/api/github/connect`.
- `src/lib/sse.ts` — server `sseEncode(event, data)` (named events) + client `parseSSEStream(response, onEvent)`.
- `src/lib/scan-filter.ts` — `isReviewableSourceFile(path, size)`, `inferLanguage(path)`, skip-set for binaries/lockfiles/vendor/build dirs.
- `src/lib/scan-types.ts` — `ScanEvent` union (review/node/progress/finding/fileVerdict/verdict/done/error), `RepoSummary`, `TreeEntry`, `FileResult`, `GraphNode`/`GraphLink`.

**Create — Firestore persistence (extend)**
- Add to `src/lib/firestore.ts`: `storeGithubToken(uid, token, login)`, `getGithubToken(uid)`, `createScanReview(...)`, `addScanFile(...)`, `addScanFinding(...)`, `finalizeScanReview(...)`, `loadScanReview(reviewId)` (admin read for server; client reads via client SDK on the page).

**Create — API routes**
- `src/app/api/github/connect/route.ts` — POST `{ githubToken }` → store at `users/{uid}.githubToken`; returns `{ ok, login }`.
- `src/app/api/github/repos/route.ts` — GET → `listForAuthenticatedUser` → `{ repos: [...] }`.
- `src/app/api/github/tree/route.ts` — GET `?owner&repo&branch` → `{ branch, tree }`.
- `src/app/api/github/file/route.ts` — GET `?owner&repo&ref&path` → `{ path, language, content, lineCount }`.
- `src/app/api/scan/route.ts` — POST `{ reviewId, owner, repo, branch }` → named-event SSE build-out.
- `src/app/api/patch/route.ts` — POST `{ reviewId, path, finding }` → runs existing patch agent for one finding (Part 5 stretch).

**Create — UI**
- `src/components/landing/LandingNav.tsx` — fixed top nav: section links (left) + auth control (right).
- `src/components/landing/HeroCTA.tsx` — client CTA replacing the dead hero "Scan my code" link.
- `src/app/scan/page.tsx` — repo picker (search/filter/select).
- `src/components/scan/RepoCard.tsx`, `src/components/scan/RepoList.tsx` — picker pieces.
- `src/app/review/[reviewId]/page.tsx` — graph page shell (client).
- `src/components/review/ReviewGraph.tsx` — `react-force-graph-2d` (dynamic, ssr:false) + custom node render.
- `src/components/review/useScanStream.ts` — hook: live SSE build-out → graph/findings state; or load persisted via client Firestore.
- `src/components/review/ReviewTopbar.tsx` — repo/branch, verdict gate badge, Rescan, back.
- `src/components/review/ReviewSidePanel.tsx` — severity filters, search, grouped findings, legend.
- `src/components/review/CodePanel.tsx` — Monaco mini-IDE slide-in (dynamic, ssr:false) + decorations.
- `src/components/review/brandMonacoTheme.ts` — Monaco theme from brand tokens.

**Modify**
- `src/app/globals.css` — promote the design tokens to `:root` (additive; `.bt-root` keeps its identical block); add a couple of graph/panel keyframes + reduced-motion guards.
- `src/app/layout.tsx` — wrap `children` in `<AuthProvider>`.
- `src/app/page.tsx` — add `<LandingNav />`, swap the dead "Scan my code" `<a>` for `<HeroCTA />`. Hero composition otherwise unchanged.
- `src/lib/firestore.ts` — use the consolidated admin module; add the scan persistence helpers above.
- `src/lib/octokit.ts` — add `octokitForToken(token)` factory (keep `getOctokit()` for the existing PR flow).

**Create — config**
- `firestore.rules` — additive owner-only read rules for `reviews/**`; document `firebase deploy --only firestore:rules` (NOT auto-deployed).
- `.env.example` — documents required vars (no secrets).

---

## Part 0 — Foundation

- [ ] Install deps (`firebase react-force-graph-2d @monaco-editor/react d3-scale lucide-react`; `--legacy-peer-deps` if React 19 peer warnings).
- [ ] `firebase-admin.ts`: `getDb()` + `getAdminAuth()` with `cert()` when `FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY` present (replace `\n`), else default-credential init keyed by `projectId`.
- [ ] Refactor `firestore.ts` to import `getDb` from `firebase-admin.ts` (keep `saveReview` behavior identical).
- [ ] `firebase.client.ts`: singleton client app (guard `getApps()`), `getFirebaseAuth()`.
- [ ] `auth-server.ts`: `requireUid(req)` verifying the bearer ID token; typed `AuthError` → 401.
- [ ] `sse.ts`: server `sseEncode` (`event:`+`data:` lines) and client `parseSSEStream`.
- [ ] `scan-filter.ts` + `scan-types.ts` + `AuthProvider.tsx`.
- [ ] Promote tokens to `:root` in `globals.css`.
- [ ] Wrap layout in `<AuthProvider>`.
- [ ] Verify: `npx tsc --noEmit`.

## Part 1 — GitHub auth + scan entry

- [ ] `AuthProvider.signInWithGitHub()`: `GithubAuthProvider` + `addScope('repo')` + `addScope('read:user')`; `signInWithPopup`; capture `GithubAuthProvider.credentialFromResult(result).accessToken`; POST it to `/api/github/connect`.
- [ ] `LandingNav`: lucide `Github` "Sign in with GitHub" when signed out; avatar + username + sign out when signed in. On-brand, blur, scroll-aware.
- [ ] `HeroCTA`: signed-in → `router.push('/scan')`; signed-out → sign in, then push `/scan`.
- [ ] `/api/github/connect`: `requireUid`; verify token via `octokitForToken(token).users.getAuthenticated()`; `storeGithubToken(uid, token, login)`; return `{ ok, login }`. Never log/return the token.
- [ ] `/api/github/repos`: `requireUid` → `getGithubToken` → `listForAuthenticatedUser({sort:'updated', per_page:100})` → mapped repos.
- [ ] Verify: `npx tsc --noEmit`.

## Part 2 — Repo picker + tree/file

- [ ] `/scan` page: fetch repos with ID token; search + language/visibility filter; `RepoCard` (lang dot, private/public badge, "updated 3d ago"); loading/empty/error states; on select → new `reviewId`, stash `{owner,repo,branch}` in sessionStorage, `router.push('/review/'+id)`.
- [ ] `/api/github/tree`: `requireUid` → `git.getTree(recursive)` → `{branch, tree:[{path,type,size}]}`.
- [ ] `/api/github/file`: `requireUid` → `repos.getContent` → decode base64 → `{path, language, content, lineCount}`.
- [ ] Verify: `npx tsc --noEmit`.

## Part 3 — Repo scan SSE

- [ ] `/api/scan`: `requireUid`; `getGithubToken`; `createScanReview(reviewId, …, status:'scanning')`; fetch tree; filter to source files; cap 150 + `truncated` flag; emit `review`.
- [ ] Per file: emit `node`; fetch content; run pipeline (`security → {correctness+readability} → coordinator`), emitting `progress` per agent and `finding` per finding; `addScanFile` + `addScanFinding`; emit `fileVerdict`. Reuse graceful degradation; concurrency-limit (~4).
- [ ] Aggregate totals; `finalizeScanReview`; emit `verdict` then `done`. Wrap per-file in try/catch so one failure still streams a partial.
- [ ] Verify: `npx tsc --noEmit`.

## Part 4 — Obsidian graph

- [ ] `ReviewGraph` (dynamic ssr:false): nodes = files (r ∝ √lines), folder hub nodes (small, translucent), edges = containment. Custom canvas render: lime glow, mono labels on hover/zoom, finding ring + worst-severity badge w/ count. Hover highlights node+neighbors & dims rest; drag/zoom/pan; click → CodePanel; badge click → file at finding.
- [ ] `useScanStream`: fresh scan (sessionStorage params) → POST `/api/scan` + `parseSSEStream`; nodes animate in, badges pulse on `finding`; live readout in scanner language. Revisit → client Firestore load → final state. reduced-motion → settle instantly.
- [ ] `ReviewTopbar` (repo/branch, verdict gate badge, Rescan, back) + `ReviewSidePanel` (filters, search, grouped findings, legend). Mobile → readable findings list instead of canvas (noted).
- [ ] Verify: `npx tsc --noEmit`.

## Part 5 — Monaco mini-IDE

- [ ] `brandMonacoTheme`: bg `#1d1d20`, lime cursor/accents, mono.
- [ ] `CodePanel` (dynamic ssr:false): slide-in; graph compresses; GET `/api/github/file`; read-only; per-finding glyph + line-bg + hover tooltip (agent + message + confidence). Findings strip; click centers line. "Open on GitHub"; ESC/close.
- [ ] Stretch: "View suggested fix" → `/api/patch` → Monaco diff.
- [ ] Verify: `npx tsc --noEmit`.

## Final gate

- [ ] `firestore.rules` (additive owner-only `reviews/**` reads) + `.env.example`.
- [ ] Accessibility + reduced-motion pass; loading/empty/error on every view.
- [ ] `npx tsc --noEmit && npm run lint && npm run build` → all green.
- [ ] Confirm landing + `/app` paste flow still work.

---

## Key decisions / risks

- **reviewId is client-generated** (`crypto.randomUUID()`) so `/review/[reviewId]` is addressable before the scan; server `set(reviewId)` instead of `add()`.
- **Auth = Firebase ID token** in `Authorization: Bearer`; **GitHub token is server-only**, stored at `users/{uid}.githubToken`, never returned/logged after connect.
- **`react-force-graph-2d` + `@monaco-editor/react` are client-only** → `dynamic(..., { ssr:false })`. Monaco uses its default CDN loader (no bundler config; needs network at runtime — acceptable for a web app). Add `'use no memo'` if React Compiler conflicts with the graph's refs.
- **All Firestore writes are server-side (Admin, bypasses rules);** rules govern only the client read on the review page.
- **Persistence schema:** `reviews/{id}{uid,owner,repo,branch,status,totals,verdict,truncated,createdAt}`; `…/files/{id}`; `…/findings/{id}` per spec.
