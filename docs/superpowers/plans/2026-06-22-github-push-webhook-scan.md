# GitHub Push Webhook → Scan → Persist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every push to a connected repo, verify a GitHub webhook, ack within ~10s, then asynchronously fetch the changed files, run them through the existing secret-detector→fix pipeline, and persist a push-level + per-file scan to Firestore.

**Architecture:** A `tsx`-run Express server (`src/server.ts`) verifies the HMAC signature on the raw body, acks 200 immediately, then runs `fetchChangedFiles → scanChangedFiles → persistPushScan` off the response path. It reuses the existing `getOctokit`, `isReviewableSourceFile`, `getDb`, and the untouched Vertex-backed `scanForSecrets`/`generateFixes` `.js` agents. Webhook registration is an idempotent exported function with a thin CLI wrapper.

**Tech Stack:** Node ESM, TypeScript via `tsx`, Express, `@octokit/rest` (existing), `firebase-admin` (existing, ADC), Node `crypto` for HMAC. Gemini auth stays on **Vertex** (agents untouched).

**Spec:** `docs/superpowers/specs/2026-06-22-github-push-webhook-scan-design.md`

---

## Testing approach for this repo (read first)

This repo has **no test runner** (no Jest/Vitest; `package.json` has no `test` script; CLAUDE.md states "There is no test suite yet"). Per CLAUDE.md's Simplicity-First rule, **do not** add a test framework as a side effect of this feature. The TDD loop is honored using the repo's real verify tooling:

- **Failing-check step** = a small runnable `tsx` script (or a pure-function assertion run with `tsx`) that exercises the new unit and exits non-zero before the code exists.
- **Passing step** = same script exits 0 after implementation.
- **Typecheck gate** = `npx tsc --noEmit` must stay green (it typechecks all `.ts`; the `.js` agents are out of its strict path but `allowJs` keeps imports valid).

Check scripts live in `scripts/checks/` and are throwaway verification harnesses (committed, since they document intent). They must **never** print secrets, tokens, or file contents.

**Verify gate for every task:** `npx tsc --noEmit` clean, plus the task's named check script exits 0.

---

## File Structure

- **Create `src/webhookTypes.ts`** — webhook-local TS types for the detector/fix output shapes (the agents return `CRITICAL|HIGH|MEDIUM|LOW` + `BLOCKED|WARN|CLEAN`, which differ from `scan-types.ts`; do NOT reuse `ScanFinding`/`FileVerdict` here).
- **Create `src/webhookFiles.ts`** — `fetchChangedFiles(payload)`; reuses `getOctokit`, `isReviewableSourceFile`.
- **Create `src/scanRepo.ts`** — `scanChangedFiles(files)`; reuses `scanForSecrets`, `generateFixes`; concurrency cap 4.
- **Create `src/lib/scan-persist.ts`** — `persistPushScan(...)` + verdict/totals rollup; reuses `getDb`.
- **Create `src/registerWebhook.ts`** — `registerRepoWebhook(owner, repo)` idempotent core; reuses `getOctokit`.
- **Create `src/server.ts`** — Express endpoint; wires the above.
- **Create `scripts/registerWebhook.ts`** — thin CLI wrapper.
- **Create `scripts/checks/*.ts`** — per-task verification harnesses.
- **Modify `.env.local`** (create if absent) and **`README.md`** — document `GITHUB_WEBHOOK_SECRET`, `PUBLIC_URL`, optional `PORT`.
- **Modify `package.json`** — add `"webhook": "tsx src/server.ts"` and `"webhook:register": "tsx scripts/registerWebhook.ts"` scripts (convenience; no new deps).

Reused unchanged: `src/lib/octokit.ts`, `src/lib/scan-filter.ts`, `src/lib/firebase-admin.ts`, `src/lib/firestore.ts` (pattern only), `src/secretDetector.js`, `src/fixAgent.js`.

---

## Task 1: Webhook-local types

**Files:**
- Create: `src/webhookTypes.ts`
- Test: `scripts/checks/check-types.ts`

- [ ] **Step 1: Write the failing check**

`scripts/checks/check-types.ts`:
```ts
import type { DetectorOutput, FixOutput, FileScanResult, PushVerdict } from '../../src/webhookTypes';

// Compile-time only: if the types don't exist or shapes change, tsc fails.
const _d: DetectorOutput = {
  findings: [{ type: 'API_KEY', severity: 'HIGH', file: 'a.ts', line: 1, match_redacted: 'sk_l****', reason: 'r', recommendation: 'x', confidence: 0.9 }],
  summary: { total: 1, critical: 0, high: 1, medium: 0, low: 0, verdict: 'BLOCKED' },
};
const _f: FixOutput = { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } };
const _r: FileScanResult = { path: 'a.ts', verdict: 'BLOCKED', findings: _d.findings, fixes: _f };
const _v: PushVerdict = 'CLEAN';
console.log('check-types OK', _r.path, _v, _f.summary.auto_fixes);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL — `Cannot find module '../../src/webhookTypes'`.

- [ ] **Step 3: Implement `src/webhookTypes.ts`**

```ts
/**
 * Types for the GitHub-push webhook scan path. These mirror the JSON the
 * Vertex-backed agents (secret-detector-agent.md, fix-agent.md) actually
 * return — deliberately NOT the SSE shapes in scan-types.ts.
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type DetectorVerdict = 'BLOCKED' | 'WARN' | 'CLEAN';
export type PushVerdict = DetectorVerdict;

/** One finding as emitted by the Secret Detector agent (already redacted). */
export interface DetectorFinding {
  type: string;
  severity: Severity;
  file: string;
  line: number;
  match_redacted: string;
  reason: string;
  recommendation: string;
  confidence: number;
}

/** Full Secret Detector output (matches secret-detector-agent.md schema). */
export interface DetectorOutput {
  findings: DetectorFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    verdict: DetectorVerdict;
  };
}

/** Fix Agent output (matches fix-agent.md / generateFixes return). */
export interface FixOutput {
  fixes: unknown[];
  summary: { auto_fixes: number; suggested_fixes: number };
}

/** A changed file fetched at the push head SHA. */
export interface ChangedFile {
  path: string;
  contents: string;
  sha: string;
}

/** Result of scanning one file. Either a successful scan or an error record. */
export interface FileScanResult {
  path: string;
  verdict?: DetectorVerdict;
  findings?: DetectorFinding[];
  fixes?: FixOutput;
  error?: string;
}

/** Summed severity counts across a push. */
export interface Totals {
  critical: number;
  high: number;
  medium: number;
  low: number;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx tsx scripts/checks/check-types.ts`
Expected: tsc clean; prints `check-types OK a.ts CLEAN 0`.

- [ ] **Step 5: Commit**

```bash
git add src/webhookTypes.ts scripts/checks/check-types.ts
git commit -m "feat(webhook): add webhook-local detector/fix types"
```

---

## Task 2: Verdict & totals rollup (pure function)

Isolated pure logic so it can be checked without network/Firestore.

**Files:**
- Create: `src/lib/scan-persist.ts` (verdict/totals helpers first; persistence in Task 6)
- Test: `scripts/checks/check-verdict.ts`

- [ ] **Step 1: Write the failing check**

`scripts/checks/check-verdict.ts`:
```ts
import assert from 'node:assert/strict';
import { rollUpTotals, rollUpVerdict } from '../../src/lib/scan-persist';
import type { FileScanResult } from '../../src/webhookTypes';

const files: FileScanResult[] = [
  { path: 'a', verdict: 'CLEAN', findings: [], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'b', verdict: 'WARN', findings: [{ type: 'WEBHOOK_URL', severity: 'MEDIUM', file: 'b', line: 2, match_redacted: 'http****', reason: '', recommendation: '', confidence: 0.7 }], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'c', error: 'boom' },
];
assert.deepEqual(rollUpTotals(files), { critical: 0, high: 0, medium: 1, low: 0 });
assert.equal(rollUpVerdict(files), 'WARN');

const withBlock: FileScanResult[] = [
  ...files,
  { path: 'd', verdict: 'BLOCKED', findings: [{ type: 'API_KEY', severity: 'HIGH', file: 'd', line: 1, match_redacted: 'sk****', reason: '', recommendation: '', confidence: 0.9 }], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
];
assert.equal(rollUpVerdict(withBlock), 'BLOCKED');
assert.deepEqual(rollUpTotals(withBlock), { critical: 0, high: 1, medium: 1, low: 0 });

assert.equal(rollUpVerdict([{ path: 'x', error: 'e' }]), 'CLEAN'); // errors only → CLEAN
console.log('check-verdict OK');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/checks/check-verdict.ts`
Expected: FAIL — module/export not found.

- [ ] **Step 3: Implement the helpers in `src/lib/scan-persist.ts`**

```ts
import type { FileScanResult, Totals, PushVerdict } from '../webhookTypes';

/** Sum per-file detector counts. Errored files contribute nothing. */
export function rollUpTotals(files: FileScanResult[]): Totals {
  const t: Totals = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of files) {
    for (const finding of f.findings ?? []) {
      if (finding.severity === 'CRITICAL') t.critical++;
      else if (finding.severity === 'HIGH') t.high++;
      else if (finding.severity === 'MEDIUM') t.medium++;
      else if (finding.severity === 'LOW') t.low++;
    }
  }
  return t;
}

/** Push headline: BLOCKED if any file BLOCKED, else WARN if any WARN, else CLEAN. */
export function rollUpVerdict(files: FileScanResult[]): PushVerdict {
  let sawWarn = false;
  for (const f of files) {
    if (f.verdict === 'BLOCKED') return 'BLOCKED';
    if (f.verdict === 'WARN') sawWarn = true;
  }
  return sawWarn ? 'WARN' : 'CLEAN';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx tsx scripts/checks/check-verdict.ts`
Expected: tsc clean; prints `check-verdict OK`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scan-persist.ts scripts/checks/check-verdict.ts
git commit -m "feat(webhook): verdict + totals rollup helpers"
```

---

## Task 3: Fetch changed files

**Files:**
- Create: `src/webhookFiles.ts`
- Test: `scripts/checks/check-fetch-files.ts`

Note: `isReviewableSourceFile(path, size)` from `src/lib/scan-filter.ts` rejects size `<= 0` and `> 120_000`, and rejects any path segment that starts with `.` or is in its skip set. At listing time we don't know real size, so pass `1` (a positive sentinel) to apply only the extension/dir/lockfile rules; enforce the real `MAX` after fetching by re-checking `Buffer.byteLength(contents) <= 120_000`.

- [ ] **Step 1: Write the failing check** (pure path-collection + filter logic; no live GitHub call)

`scripts/checks/check-fetch-files.ts`:
```ts
import assert from 'node:assert/strict';
import { collectChangedPaths } from '../../src/webhookFiles';

const payload = {
  after: 'sha-after',
  repository: { name: 'r', owner: { login: 'o' } },
  commits: [
    { added: ['src/a.ts', 'img/logo.png'], modified: ['src/a.ts'], removed: ['src/old.ts'] },
    { added: ['package-lock.json'], modified: ['src/b.py'], removed: [] },
  ],
};
const paths = collectChangedPaths(payload as never);
// dedup a.ts; drop removed old.ts; drop png; drop lockfile
assert.deepEqual([...paths].sort(), ['src/a.ts', 'src/b.py']);
console.log('check-fetch-files OK');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/checks/check-fetch-files.ts`
Expected: FAIL — `collectChangedPaths` not exported.

- [ ] **Step 3: Implement `src/webhookFiles.ts`**

```ts
import { getOctokit } from './lib/octokit';
import { isReviewableSourceFile } from './lib/scan-filter';
import type { ChangedFile } from './webhookTypes';

const MAX_FILE_BYTES = 120_000; // mirror scan-filter's cap for the post-fetch check

interface PushCommit {
  added?: string[];
  modified?: string[];
  removed?: string[];
}
export interface PushPayload {
  after: string;
  repository: { name: string; owner: { login?: string; name?: string } };
  commits?: PushCommit[];
  ref?: string;
}

/** Deduped, source-only list of added/modified paths (removed ignored). */
export function collectChangedPaths(payload: PushPayload): Set<string> {
  const paths = new Set<string>();
  for (const c of payload.commits ?? []) {
    for (const p of [...(c.added ?? []), ...(c.modified ?? [])]) {
      if (isReviewableSourceFile(p, 1)) paths.add(p); // sentinel size: ext/dir rules only
    }
  }
  return paths;
}

function ownerOf(payload: PushPayload): string {
  const o = payload.repository.owner;
  const login = o.login ?? o.name;
  if (!login) throw new Error('push payload missing repository owner');
  return login;
}

/** Fetch each changed source file's contents at the push head SHA. */
export async function fetchChangedFiles(payload: PushPayload): Promise<ChangedFile[]> {
  const octokit = getOctokit();
  const owner = ownerOf(payload);
  const repo = payload.repository.name;
  const sha = payload.after;
  const out: ChangedFile[] = [];

  for (const path of collectChangedPaths(payload)) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref: sha });
      if (Array.isArray(data) || data.type !== 'file' || typeof data.content !== 'string') {
        continue; // directory or non-file content
      }
      const contents = Buffer.from(data.content, 'base64').toString('utf-8');
      if (Buffer.byteLength(contents) > MAX_FILE_BYTES) continue; // enforce real size
      out.push({ path, contents, sha });
    } catch {
      // 404 / decode / API error: drop this file, keep the batch alive. No content logged.
      continue;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx tsx scripts/checks/check-fetch-files.ts`
Expected: tsc clean; prints `check-fetch-files OK`.

- [ ] **Step 5: Commit**

```bash
git add src/webhookFiles.ts scripts/checks/check-fetch-files.ts
git commit -m "feat(webhook): fetch changed source files at push head SHA"
```

---

## Task 4: Scan changed files (concurrency cap 4)

**Files:**
- Create: `src/scanRepo.ts`
- Test: `scripts/checks/check-scan-repo.ts`

The agents are `.js` with no type declarations. Import them and treat the return as the typed shapes via a small typed wrapper at the call site (no `as` on error-silencing; use `satisfies`/explicit typing of the parsed JSON which the agents already `JSON.parse`). To keep the check offline, inject the scan functions as parameters with a default binding to the real agents.

- [ ] **Step 1: Write the failing check** (injected fakes; cap + graceful-degradation behavior)

`scripts/checks/check-scan-repo.ts`:
```ts
import assert from 'node:assert/strict';
import { scanChangedFiles } from '../../src/scanRepo';
import type { ChangedFile } from '../../src/webhookTypes';

let inFlight = 0, maxSeen = 0;
const detect = async (path: string) => {
  inFlight++; maxSeen = Math.max(maxSeen, inFlight);
  await new Promise((r) => setTimeout(r, 10));
  inFlight--;
  if (path === 'boom') throw new Error('detector failed');
  const high = path === 'bad';
  return {
    findings: high ? [{ type: 'API_KEY', severity: 'HIGH', file: path, line: 1, match_redacted: 'sk****', reason: '', recommendation: '', confidence: 0.9 }] : [],
    summary: { total: high ? 1 : 0, critical: 0, high: high ? 1 : 0, medium: 0, low: 0, verdict: high ? 'BLOCKED' : 'CLEAN' },
  };
};
const fix = async () => ({ fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } });

const files: ChangedFile[] = Array.from({ length: 10 }, (_, i) => ({ path: i === 3 ? 'bad' : i === 7 ? 'boom' : `f${i}`, contents: 'x', sha: 's' }));
const results = await scanChangedFiles(files, { concurrency: 4, scan: detect as never, fixer: fix as never });

assert.equal(results.length, 10);
assert.ok(maxSeen <= 4, `concurrency exceeded: ${maxSeen}`);
assert.equal(results.find((r) => r.path === 'boom')?.error, 'detector failed');
assert.equal(results.find((r) => r.path === 'bad')?.verdict, 'BLOCKED');
assert.equal(results.find((r) => r.path === 'f0')?.verdict, 'CLEAN');
console.log('check-scan-repo OK maxConcurrent=', maxSeen);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/checks/check-scan-repo.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/scanRepo.ts`**

```ts
import { scanForSecrets } from './secretDetector.js';
import { generateFixes } from './fixAgent.js';
import type { ChangedFile, DetectorOutput, FileScanResult, FixOutput } from './webhookTypes';

type ScanFn = (path: string, contents: string) => Promise<DetectorOutput>;
type FixFn = (path: string, contents: string, findings: DetectorOutput['findings']) => Promise<FixOutput>;

interface Options {
  concurrency?: number;
  scan?: ScanFn;
  fixer?: FixFn;
}

async function scanOne(file: ChangedFile, scan: ScanFn, fixer: FixFn): Promise<FileScanResult> {
  try {
    const detected = await scan(file.path, file.contents);
    const findings = detected.findings ?? [];
    const fixes = findings.length > 0
      ? await fixer(file.path, file.contents, findings)
      : { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } };
    return { path: file.path, verdict: detected.summary.verdict, findings, fixes };
  } catch (err) {
    // graceful degradation — never include file contents in the message
    return { path: file.path, error: err instanceof Error ? err.message : 'scan failed' };
  }
}

/** Scan each file through detector→fix, capped at `concurrency` in flight. */
export async function scanChangedFiles(
  files: ChangedFile[],
  opts: Options = {}
): Promise<FileScanResult[]> {
  const concurrency = opts.concurrency ?? 4;
  const scan = opts.scan ?? (scanForSecrets as ScanFn);
  const fixer = opts.fixer ?? (generateFixes as FixFn);

  const results: FileScanResult[] = new Array(files.length);
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const i = cursor++;
      results[i] = await scanOne(files[i], scan, fixer);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, worker);
  await Promise.all(workers);
  return results;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx tsx scripts/checks/check-scan-repo.ts`
Expected: tsc clean; prints `check-scan-repo OK maxConcurrent= <=4`.

- [ ] **Step 5: Commit**

```bash
git add src/scanRepo.ts scripts/checks/check-scan-repo.ts
git commit -m "feat(webhook): concurrency-capped scan of changed files"
```

---

## Task 5: Idempotent webhook registration

**Files:**
- Create: `src/registerWebhook.ts`
- Test: `scripts/checks/check-register.ts`

- [ ] **Step 1: Write the failing check** (inject a fake octokit to assert update-vs-create + config)

`scripts/checks/check-register.ts`:
```ts
import assert from 'node:assert/strict';
import { registerRepoWebhook } from '../../src/registerWebhook';

process.env.PUBLIC_URL = 'https://bugtrap.example';
process.env.GITHUB_WEBHOOK_SECRET = 'shh';

function fakeOctokit(existingUrl: string | null) {
  const calls: string[] = [];
  return {
    calls,
    repos: {
      listWebhooks: async () => ({ data: existingUrl ? [{ id: 42, config: { url: existingUrl } }] : [] }),
      createWebhook: async (args: { config: { url: string; content_type: string; secret: string }; events: string[] }) => {
        calls.push('create');
        assert.equal(args.config.url, 'https://bugtrap.example/webhook/github');
        assert.equal(args.config.content_type, 'json');
        assert.equal(args.config.secret, 'shh');
        assert.deepEqual(args.events, ['push']);
        return { data: { id: 99 } };
      },
      updateWebhook: async (args: { hook_id: number }) => {
        calls.push('update');
        assert.equal(args.hook_id, 42);
        return { data: { id: 42 } };
      },
    },
  };
}

const created = await registerRepoWebhook('o', 'r', { octokit: fakeOctokit(null) as never });
assert.deepEqual(created, { id: 99, action: 'created' });

const updated = await registerRepoWebhook('o', 'r', { octokit: fakeOctokit('https://bugtrap.example/webhook/github') as never });
assert.deepEqual(updated, { id: 42, action: 'updated' });
console.log('check-register OK');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/checks/check-register.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/registerWebhook.ts`**

```ts
import { getOctokit } from './lib/octokit';
import type { Octokit } from '@octokit/rest';

export interface RegisterResult {
  id: number;
  action: 'created' | 'updated';
}

function webhookUrl(): string {
  const base = process.env.PUBLIC_URL;
  if (!base) throw new Error('PUBLIC_URL is not set');
  return `${base.replace(/\/$/, '')}/webhook/github`;
}

/**
 * Register (or update) the BugTrap push webhook on a repo. Idempotent: a hook
 * whose config.url already matches ours is updated in place, never duplicated.
 * This is the shared core the CLI and the future connect-repo endpoint both call.
 */
export async function registerRepoWebhook(
  owner: string,
  repo: string,
  opts: { octokit?: Octokit } = {}
): Promise<RegisterResult> {
  const octokit = opts.octokit ?? getOctokit();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET is not set');
  const url = webhookUrl();
  const config = { url, content_type: 'json' as const, secret };

  const { data: hooks } = await octokit.repos.listWebhooks({ owner, repo });
  const existing = hooks.find((h) => h.config?.url === url);

  if (existing) {
    const { data } = await octokit.repos.updateWebhook({
      owner, repo, hook_id: existing.id, config, events: ['push'], active: true,
    });
    return { id: data.id, action: 'updated' };
  }
  const { data } = await octokit.repos.createWebhook({
    owner, repo, config, events: ['push'], active: true,
  });
  return { id: data.id, action: 'created' };
}
```

Note: never `console.log` the `secret` or `config`. The CLI (Task 7) prints only `{ id, action }`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx tsx scripts/checks/check-register.ts`
Expected: tsc clean; prints `check-register OK`.

- [ ] **Step 5: Commit**

```bash
git add src/registerWebhook.ts scripts/checks/check-register.ts
git commit -m "feat(webhook): idempotent registerRepoWebhook core"
```

---

## Task 6: Persist the scan to Firestore

**Files:**
- Modify: `src/lib/scan-persist.ts` (add `persistPushScan`, keep the Task-2 helpers)
- Test: `scripts/checks/check-persist.ts`

- [ ] **Step 1: Write the failing check** (inject a fake Firestore `db`; assert doc paths + payload)

`scripts/checks/check-persist.ts`:
```ts
import assert from 'node:assert/strict';
import { persistPushScan } from '../../src/lib/scan-persist';
import type { FileScanResult } from '../../src/webhookTypes';

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
function fakeDb() {
  const scanDoc = {
    set: async (data: Record<string, unknown>) => { writes.push({ path: 'scans/sha1', data }); },
    collection: (_name: string) => ({ doc: () => ({ __fileDoc: true }) }),
  };
  return {
    collection: (c: string) => ({ doc: (id: string) => { assert.equal(`${c}/${id}`, 'scans/sha1'); return scanDoc; } }),
    batch: () => ({
      set: (_ref: unknown, data: Record<string, unknown>) => { writes.push({ path: 'scans/sha1/files', data }); },
      commit: async () => {},
    }),
  };
}

const files: FileScanResult[] = [
  { path: 'a.ts', verdict: 'CLEAN', findings: [], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'b.ts', verdict: 'BLOCKED', findings: [{ type: 'API_KEY', severity: 'HIGH', file: 'b.ts', line: 1, match_redacted: 'sk****', reason: '', recommendation: '', confidence: 0.9 }], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'c.ts', error: 'boom' },
];

const summary = await persistPushScan(
  { repo: 'o/r', branch: 'main', commitSha: 'sha1', results: files },
  { db: fakeDb() as never, now: () => 'TS' }
);

assert.equal(summary.verdict, 'BLOCKED');
assert.deepEqual(summary.totals, { critical: 0, high: 1, medium: 0, low: 0 });
assert.equal(summary.filesScanned, 3);
const head = writes.find((w) => w.path === 'scans/sha1')!;
assert.equal(head.data.repo, 'o/r');
assert.equal(head.data.commitSha, 'sha1');
assert.equal(head.data.verdict, 'BLOCKED');
assert.equal(writes.filter((w) => w.path === 'scans/sha1/files').length, 3);
console.log('check-persist OK');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/checks/check-persist.ts`
Expected: FAIL — `persistPushScan` not exported.

- [ ] **Step 3: Add `persistPushScan` to `src/lib/scan-persist.ts`**

```ts
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getDb } from './firebase-admin';
import type { FileScanResult, Totals, PushVerdict } from '../webhookTypes';
// (rollUpTotals, rollUpVerdict already defined above in this file)

export interface PushScanInput {
  repo: string;      // "owner/repo"
  branch: string;    // derived from payload.ref
  commitSha: string; // payload.after
  results: FileScanResult[];
}

export interface PushScanSummary {
  filesScanned: number;
  totals: Totals;
  verdict: PushVerdict;
}

/** Persist scans/{sha} + a files subcollection doc per file. */
export async function persistPushScan(
  input: PushScanInput,
  opts: { db?: Firestore; now?: () => unknown } = {}
): Promise<PushScanSummary> {
  const db = opts.db ?? getDb();
  const stamp = opts.now ? opts.now() : FieldValue.serverTimestamp();

  const totals = rollUpTotals(input.results);
  const verdict = rollUpVerdict(input.results);
  const summary: PushScanSummary = { filesScanned: input.results.length, totals, verdict };

  const scanRef = db.collection('scans').doc(input.commitSha);
  await scanRef.set({
    repo: input.repo,
    branch: input.branch,
    commitSha: input.commitSha,
    pushedAt: stamp,
    filesScanned: summary.filesScanned,
    totals,
    verdict,
  });

  // Batched write of the per-file docs (matches spec PART 4 "batched write").
  // When a real Firestore is used, db.batch() exists; the injected fake in the
  // check supplies a minimal batch shim. One commit for all file docs.
  const filesCol = scanRef.collection('files');
  const batch = db.batch();
  for (const f of input.results) {
    batch.set(filesCol.doc(), {
      path: f.path,
      verdict: f.verdict ?? null,
      findings: f.findings ?? [],
      fixes: f.fixes ?? null,
      ...(f.error ? { error: f.error } : {}),
    });
  }
  await batch.commit();
  return summary;
}
```

(If `firebase-admin/firestore` `FieldValue`/`Firestore` imports cause an unused-import lint when `db` is injected in checks, that's fine — they are used in the real path.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx tsx scripts/checks/check-persist.ts`
Expected: tsc clean; prints `check-persist OK`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scan-persist.ts scripts/checks/check-persist.ts
git commit -m "feat(webhook): persist push scan to Firestore (scans/{sha} + files)"
```

---

## Task 7: Register-webhook CLI wrapper

**Files:**
- Create: `scripts/registerWebhook.ts`
- Modify: `package.json` (add `webhook:register` script)
- Test: manual run (CLI; no separate check script)

- [ ] **Step 1: Implement `scripts/registerWebhook.ts`**

```ts
import 'dotenv/config';
import { registerRepoWebhook } from '../src/registerWebhook';

const [owner, repo] = process.argv.slice(2);
if (!owner || !repo) {
  console.error('Usage: tsx scripts/registerWebhook.ts <owner> <repo>');
  process.exit(1);
}

try {
  const result = await registerRepoWebhook(owner, repo);
  console.log(`Webhook ${result.action} (id ${result.id}) on ${owner}/${repo}`);
} catch (err) {
  console.error('Failed to register webhook:', err instanceof Error ? err.message : err);
  process.exit(1);
}
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add:
```json
"webhook:register": "tsx scripts/registerWebhook.ts",
```

- [ ] **Step 3: Verify (typecheck + usage error path)**

Run: `npx tsc --noEmit && npx tsx scripts/registerWebhook.ts`
Expected: tsc clean; prints the `Usage:` line and exits 1 (no args). (Do NOT run against a real repo here — that's the live test in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add scripts/registerWebhook.ts package.json
git commit -m "feat(webhook): registerWebhook CLI wrapper"
```

---

## Task 8: Express server (verify → ack → async scan)

**Files:**
- Create: `src/server.ts`
- Modify: `package.json` (add `webhook` script)
- Test: `scripts/checks/check-signature.ts` (pure signature-verify check) + manual boot

This task needs `express`. Confirm it's installed: `node -e "require.resolve('express')"`. If it errors, run `npm i express` and `npm i -D @types/express` **(ASK the user before adding deps if your workflow requires it; express is the one new runtime dep this feature needs and the spec named it).**

- [ ] **Step 1: Write the failing check** (export the verify fn and test it in isolation)

`scripts/checks/check-signature.ts`:
```ts
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifySignature } from '../../src/server';

const secret = 'shh';
const body = Buffer.from(JSON.stringify({ hello: 'world' }));
const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

assert.equal(verifySignature(body, good, secret), true);
assert.equal(verifySignature(body, 'sha256=deadbeef', secret), false);
assert.equal(verifySignature(body, '', secret), false);
assert.equal(verifySignature(body, good, ''), false); // no secret → reject
console.log('check-signature OK');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/checks/check-signature.ts`
Expected: FAIL — `verifySignature` not exported.

- [ ] **Step 3: Implement `src/server.ts`**

```ts
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { fetchChangedFiles, type PushPayload } from './webhookFiles';
import { scanChangedFiles } from './scanRepo';
import { persistPushScan } from './lib/scan-persist';

/** Timing-safe HMAC-SHA256 check of the raw body against X-Hub-Signature-256. */
export function verifySignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

function branchOf(payload: PushPayload): string {
  return payload.ref?.replace('refs/heads/', '') ?? 'unknown';
}

async function processPush(payload: PushPayload): Promise<void> {
  const owner = payload.repository.owner.login ?? payload.repository.owner.name ?? '?';
  const repoFull = `${owner}/${payload.repository.name}`;
  const files = await fetchChangedFiles(payload);
  const results = await scanChangedFiles(files);
  const summary = await persistPushScan({
    repo: repoFull,
    branch: branchOf(payload),
    commitSha: payload.after,
    results,
  });
  const findingCount = summary.totals.critical + summary.totals.high + summary.totals.medium + summary.totals.low;
  // one-line summary; no secrets/contents
  console.log(`[scan] ${repoFull} ${payload.after.slice(0, 7)} files=${summary.filesScanned} findings=${findingCount} verdict=${summary.verdict}`);
}

export function createServer() {
  const app = express();

  app.post('/webhook/github', express.raw({ type: '*/*' }), (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';
    const signature = req.header('X-Hub-Signature-256') ?? '';
    const rawBody = req.body as Buffer;

    if (!verifySignature(rawBody, signature, secret)) {
      res.status(401).send('invalid signature');
      return;
    }
    if (req.header('X-GitHub-Event') !== 'push') {
      res.status(200).send('ignored');
      return;
    }

    let payload: PushPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as PushPayload;
    } catch {
      res.status(400).send('invalid json');
      return;
    }

    res.status(200).send('ok'); // ack BEFORE scanning (GitHub ~10s timeout)
    void processPush(payload).catch((err) => {
      console.error('[scan] processing failed:', err instanceof Error ? err.message : err);
    });
  });

  app.get('/health', (_req, res) => { res.status(200).send('ok'); });
  return app;
}

// Boot only when run directly (not when imported by a check).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  createServer().listen(port, () => console.log(`webhook server listening on :${port}`));
}
```

- [ ] **Step 4: Run to verify the signature check passes**

Run: `npx tsc --noEmit && npx tsx scripts/checks/check-signature.ts`
Expected: tsc clean; prints `check-signature OK`.

- [ ] **Step 5: Verify the server boots**

Run: `GITHUB_WEBHOOK_SECRET=x npx tsx src/server.ts` (Ctrl-C after the listening line)
Expected: prints `webhook server listening on :3001`, no throw.

- [ ] **Step 6: Add the npm script & commit**

In `package.json` `"scripts"`, add `"webhook": "tsx src/server.ts",`. Then:
```bash
git add src/server.ts scripts/checks/check-signature.ts package.json
git commit -m "feat(webhook): express endpoint with HMAC verify and async scan dispatch"
```

---

## Task 9: Env docs + end-to-end live test

**Files:**
- Modify: `.env.local` (create if absent), `README.md`

- [ ] **Step 1: Document env vars**

Append to `.env.local` (values left blank for the user to fill):
```
# ── GitHub push-webhook scan (backend) ──
GITHUB_WEBHOOK_SECRET=
PUBLIC_URL=
# PORT=3001   # optional, defaults to 3001
```

Add a README section "GitHub push-webhook scan" documenting: `GITHUB_WEBHOOK_SECRET`, `PUBLIC_URL`, optional `PORT`; that `GITHUB_TOKEN` and Firebase ADC are reused; that scans persist to `scans/{commitSha}`; and the run/register commands (`npm run webhook`, `npm run webhook:register <owner> <repo>`). State explicitly that Gemini auth uses **Vertex** (existing `GOOGLE_*` vars), not an API key.

- [ ] **Step 2: Live smoke test (manual, requires real creds + a test repo you own)**

1. Set `GITHUB_WEBHOOK_SECRET`, `PUBLIC_URL` (e.g. an ngrok URL) in `.env.local`.
2. `npm run webhook` in one terminal; expose `PUBLIC_URL` → local port.
3. `npm run webhook:register <owner> <repo>` → expect `Webhook created (id …)`.
4. Re-run the same register command → expect `Webhook updated (id …)` (idempotency confirmed).
5. Push a commit to that repo adding a file with a planted fake secret (e.g. `AKIAIOSFODNN7EXAMPLE`).
6. Confirm the server logs one `[scan] owner/repo <sha7> files=… findings=… verdict=BLOCKED` line.
7. In Firestore, confirm `scans/<sha>` exists with `verdict: "BLOCKED"`, correct `totals`, and a `files` subcollection whose finding entries are **redacted** (`match_redacted`, no raw secret).
8. Negative test: `curl -X POST $PUBLIC_URL/webhook/github -H 'X-GitHub-Event: push' -d '{}'` (no/invalid signature) → expect HTTP 401.

- [ ] **Step 3: Final verify gate**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all green. (`npm run build` is the repo's definition of done per CLAUDE.md.)

- [ ] **Step 4: Commit**

```bash
git add .env.local README.md
git commit -m "docs(webhook): document webhook env vars and run/register commands"
```

---

## Done criteria

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all green.
- All `scripts/checks/*.ts` exit 0.
- Live: a push to a connected repo produces a `scans/{sha}` doc with rolled-up verdict, summed totals, and a per-file `files` subcollection with redacted findings + fixes; bad signature → 401; ack returns before scanning; one-line summary logged.
- No secret/token/file-content ever logged or persisted in plaintext.
- The Vertex-backed agents and Gemini auth strategy are unchanged; no `GEMINI_API_KEY` introduced.
