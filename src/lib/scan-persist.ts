import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getDb } from './firebase-admin';
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
