import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebase-admin';
import type { AgentReport, Verdict } from './types';
import type { LensCounts, FileVerdict, ScanFinding, ScanStatus, StoredReview, StoredFile, PublicReviewData } from './scan-types';

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
  params: { uid: string; owner: string; repo: string; branch: string; truncated: boolean; total: number; isPublic: boolean }
): Promise<void> {
  await getDb().collection('reviews').doc(reviewId).set({
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

export async function finalizeScanReview(
  reviewId: string,
  result: { status: ScanStatus; totals: LensCounts; verdict: FileVerdict }
): Promise<void> {
  await getDb().collection('reviews').doc(reviewId).set(
    { ...result, finishedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
