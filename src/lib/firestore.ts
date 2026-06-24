import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebase-admin';
import type { AgentReport, Verdict } from './types';
import type { LensCounts, FileVerdict, ScanFinding, ScanStatus, StoredReview, StoredFile, PublicReviewData, WebhookRecord } from './scan-types';

/** Existing paste/PR review persistence — unchanged behavior. */
export async function saveReview(
  code: string,
  reports: AgentReport[],
  verdict: Verdict
): Promise<string> {
  const ref = await getDb().collection('reviews').add({
    code,
    reports,
    verdict,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/* ── GitHub OAuth token (server-only, per user) ────────────────────── */

export async function storeGithubToken(uid: string, token: string, login: string): Promise<void> {
  await getDb().collection('users').doc(uid).set(
    {
      githubToken: token,
      githubLogin: login,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getGithubToken(uid: string): Promise<string | null> {
  const snap = await getDb().collection('users').doc(uid).get();
  const token = snap.data()?.githubToken;
  return typeof token === 'string' ? token : null;
}

/* ── Repo-scan review lifecycle ────────────────────────────────────── */

export async function createScanReview(
  reviewId: string,
  params: { uid: string; owner: string; repo: string; branch: string; truncated: boolean; total: number; isPublic: boolean },
  incremental = false
): Promise<void> {
  const ref = getDb().collection('reviews').doc(reviewId);

  if (incremental) {
    // Push-driven rescan of an existing rolling review: flip status back to
    // "scanning" and merge metadata, but preserve totals/verdict (recomputed at
    // finalize) and the existing files/findings for untouched paths.
    await ref.set(
      {
        uid: params.uid,
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        status: 'scanning' satisfies ScanStatus,
        public: params.isPublic,
      },
      { merge: true }
    );
    return;
  }

  // Full scan (interactive own-repo scan or first watch): fresh document.
  await ref.set({
    uid: params.uid,
    owner: params.owner,
    repo: params.repo,
    branch: params.branch,
    status: 'scanning' satisfies ScanStatus,
    totals: { security: 0, correctness: 0, readability: 0 },
    verdict: 'safe' satisfies FileVerdict,
    truncated: params.truncated,
    total: params.total,
    public: params.isPublic,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Read all stored file docs for a review — used to recompute rolling totals
 *  after an incremental (push) scan touches only a subset of files. */
export async function getScanFiles(reviewId: string): Promise<StoredFile[]> {
  const snap = await getDb().collection('reviews').doc(reviewId).collection('files').get();
  return snap.docs.map((d) => d.data() as StoredFile);
}

/** Delete all files + findings under a review. Used before a full rebuild so a
 *  re-scan of a rolling review doesn't accumulate stale docs from prior scans. */
export async function purgeScanContents(reviewId: string): Promise<void> {
  const db = getDb();
  const ref = db.collection('reviews').doc(reviewId);
  const [files, findings] = await Promise.all([
    ref.collection('files').get(),
    ref.collection('findings').get(),
  ]);
  const docs = [...files.docs, ...findings.docs];
  // Firestore batches cap at 500 ops — chunk to stay under the limit.
  for (let i = 0; i < docs.length; i += 450) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }
}

/** Admin read of a full review (doc + files + findings). Used by the public
 *  revisit endpoint, which gates on review.public before returning. */
export async function getScanReview(reviewId: string): Promise<PublicReviewData | null> {
  const ref = getDb().collection('reviews').doc(reviewId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const [filesSnap, findingsSnap] = await Promise.all([
    ref.collection('files').get(),
    ref.collection('findings').get(),
  ]);
  return {
    review: snap.data() as StoredReview,
    files: filesSnap.docs.map((d) => d.data() as StoredFile),
    findings: findingsSnap.docs.map((d) => d.data() as ScanFinding),
  };
}

export async function addScanFile(
  reviewId: string,
  file: { path: string; size: number; lines: number; counts: LensCounts; verdict: FileVerdict }
): Promise<void> {
  await getDb().collection('reviews').doc(reviewId).collection('files').add(file);
}

export async function addScanFindings(reviewId: string, findings: ScanFinding[]): Promise<void> {
  if (findings.length === 0) return;
  const db = getDb();
  const col = db.collection('reviews').doc(reviewId).collection('findings');
  const batch = db.batch();
  for (const f of findings) batch.set(col.doc(), { ...f });
  await batch.commit();
}

/**
 * Incremental (push) upsert for a single file in a rolling review.
 *
 * Keys the file doc by a deterministic id derived from its path, so a re-push
 * of the same file overwrites the prior entry instead of duplicating it. Then
 * replaces just that path's findings: deletes any existing findings for the
 * path, then writes the new set. Files NOT touched by the push are left intact,
 * so the graph stays a living map of the whole repo (merge semantics).
 */
export async function upsertScanFile(
  reviewId: string,
  file: { path: string; size: number; lines: number; counts: LensCounts; verdict: FileVerdict },
  findings: ScanFinding[]
): Promise<void> {
  const db = getDb();
  const reviewRef = db.collection('reviews').doc(reviewId);

  // Deterministic file-doc id from path (path chars unsafe for doc ids → encode).
  const fileDocId = encodeURIComponent(file.path).replace(/\./g, '%2E');
  await reviewRef.collection('files').doc(fileDocId).set(file);

  // Replace this path's findings: clear old, then write new.
  const findingsCol = reviewRef.collection('findings');
  const stale = await findingsCol.where('path', '==', file.path).get();
  const batch = db.batch();
  for (const doc of stale.docs) batch.delete(doc.ref);
  for (const f of findings) batch.set(findingsCol.doc(), { ...f });
  await batch.commit();
}

export async function finalizeScanReview(
  reviewId: string,
  result: { status: ScanStatus; totals: LensCounts; verdict: FileVerdict }
): Promise<void> {
  await getDb().collection('reviews').doc(reviewId).set(
    { ...result, finishedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/* ── Webhook registration (server-only) ────────────────────────────── */

function webhookDocId(owner: string, repo: string): string {
  // Double-underscore separator: GitHub usernames cannot contain underscores,
  // so owner__repo is unambiguous.
  return `${owner}__${repo}`;
}

export async function registerWebhook(
  uid: string,
  owner: string,
  repo: string,
  webhookId: number,
  secret: string,
  branch: string
): Promise<void> {
  await getDb()
    .collection('webhooks')
    .doc(webhookDocId(owner, repo))
    .set({ uid, owner, repo, webhookId, secret, branch, createdAt: FieldValue.serverTimestamp() });
}

export async function getWebhook(owner: string, repo: string): Promise<WebhookRecord | null> {
  const snap = await getDb().collection('webhooks').doc(webhookDocId(owner, repo)).get();
  return snap.exists ? (snap.data() as WebhookRecord) : null;
}

export async function deleteWebhook(owner: string, repo: string): Promise<void> {
  await getDb().collection('webhooks').doc(webhookDocId(owner, repo)).delete();
}

export async function listUserWebhooks(uid: string): Promise<WebhookRecord[]> {
  const snaps = await getDb().collection('webhooks').where('uid', '==', uid).get();
  return snaps.docs.map((d) => d.data() as WebhookRecord);
}
