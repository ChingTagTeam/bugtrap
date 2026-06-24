/**
 * Core scan engine — shared by the SSE route and the webhook handler.
 *
 * The SSE route passes a `send` function so events stream to the browser.
 * The webhook handler omits it; `send` defaults to a no-op.
 */

import type { Octokit } from '@octokit/rest';
import {
  createScanReview,
  addScanFile,
  addScanFindings,
  finalizeScanReview,
} from './firestore';
import { runSecurityAgent, runCorrectnessAgent } from './agents';
import { isReviewableSourceFile } from './scan-filter';
import type { AgentReport, Severity } from './types';
import type { ScanFinding, LensCounts, FileVerdict } from './scan-types';

export const MAX_FILES = 150;
// Each file runs two sequential Gemini calls (security → correctness). Keeping
// file-level concurrency low bounds peak QPS against the Vertex quota; the
// agents also retry on 429, but staying under the limit avoids the latency of
// backoff. Bump this only if the project's quota is raised.
const CONCURRENCY = 2;

export type ScanSender = (event: string, data: unknown) => void;

export interface ScanParams {
  reviewId: string;
  owner: string;
  repo: string;
  branch: string;
  uid: string;
  isPublic: boolean;
  octokit: Octokit;
  /** When set, only these paths are scanned (webhook incremental mode). */
  onlyPaths?: string[];
  /** SSE event emitter — no-op when omitted (webhook / background mode). */
  send?: ScanSender;
}

function isBlocking(sev: Severity): boolean {
  return sev === 'CRITICAL' || sev === 'HIGH';
}

/** Only major issues are surfaced; agents may still leak a stray lower severity. */
function isMajor(sev: Severity): boolean {
  return sev === 'CRITICAL' || sev === 'HIGH';
}

function reportToFindings(path: string, report: AgentReport): ScanFinding[] {
  return report.findings
    .filter((f) => isMajor(f.severity))
    .map((f) => ({
      path,
      line: f.line ?? null,
      endLine: f.line ?? null,
      severity: f.severity,
      agent: report.agent,
      message: f.message,
      confidence: f.confidence,
      type: f.type,
    }));
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  async function next(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    await worker(items[index], index);
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

async function persist(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`[scan] persist ${label} failed:`, e instanceof Error ? e.message : e);
  }
}

export async function runScan({
  reviewId,
  owner,
  repo,
  branch,
  uid,
  isPublic,
  octokit,
  onlyPaths,
  send = () => {},
}: ScanParams): Promise<void> {
  const totals: LensCounts = { security: 0, correctness: 0, readability: 0 };
  let scanned = 0;
  let anyBlocked = false;

  // ── build the file list ───────────────────────────────────────────────────
  let files: { path: string; size: number }[];
  let truncated = false;

  if (onlyPaths && onlyPaths.length > 0) {
    // Incremental (webhook) mode: caller already narrowed the set.
    // Pass size=1 to skip the size filter — actual content length is checked below.
    files = onlyPaths
      .filter((p) => isReviewableSourceFile(p, 1))
      .map((p) => ({ path: p, size: 0 }));
  } else {
    // Full-tree scan mode.
    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: 'true',
    });

    const candidates: { path: string; size: number }[] = [];
    for (const entry of treeData.tree) {
      if (
        entry.type === 'blob' &&
        entry.path &&
        isReviewableSourceFile(entry.path, entry.size ?? 0)
      ) {
        candidates.push({ path: entry.path, size: entry.size ?? 0 });
      }
    }
    truncated = (treeData.truncated ?? false) || candidates.length > MAX_FILES;
    files = candidates.slice(0, MAX_FILES);
  }

  const total = files.length;

  await persist('createReview', () =>
    createScanReview(reviewId, { uid, owner, repo, branch, truncated, total, isPublic })
  );
  send('review', { reviewId, owner, repo, branch, total, truncated, public: isPublic });

  if (total === 0) {
    await persist('finalize', () =>
      finalizeScanReview(reviewId, { status: 'done', totals, verdict: 'safe' })
    );
    send('verdict', { verdict: 'safe', totals });
    send('done', { reviewId });
    return;
  }

  // ── process each file ─────────────────────────────────────────────────────
  await runPool(files, CONCURRENCY, async (file) => {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path,
        ref: branch,
      });

      const content =
        !Array.isArray(data) && data.type === 'file' && data.encoding === 'base64'
          ? Buffer.from(data.content, 'base64').toString('utf-8')
          : '';

      // Honour the size cap even for files where size was unknown at list time.
      if (content.length > 120_000) {
        scanned += 1;
        send('progress', { scanned, total, agent: null, path: file.path });
        return;
      }

      const effectiveSize = file.size > 0 ? file.size : content.length;
      const lines =
        content.length === 0
          ? Math.max(1, Math.round(effectiveSize / 40))
          : content.split('\n').length;

      send('node', { path: file.path, size: effectiveSize, lines });

      if (content.length === 0) {
        await persist('file', () =>
          addScanFile(reviewId, {
            path: file.path,
            size: effectiveSize,
            lines,
            counts: { security: 0, correctness: 0, readability: 0 },
            verdict: 'safe',
          })
        );
        send('fileVerdict', {
          path: file.path,
          verdict: 'safe',
          counts: { security: 0, correctness: 0, readability: 0 },
        });
        scanned += 1;
        send('progress', { scanned, total, agent: null, path: file.path });
        return;
      }

      send('progress', { scanned, total, agent: 'security', path: file.path });
      const securityReport = await runSecurityAgent(content);

      send('progress', { scanned, total, agent: 'correctness', path: file.path });
      const correctnessReport = await runCorrectnessAgent(content, securityReport.findings);

      const reports: AgentReport[] = [securityReport, correctnessReport];
      const fileFindings: ScanFinding[] = reports.flatMap((r) => reportToFindings(file.path, r));

      for (const finding of fileFindings) {
        send('finding', finding);
      }

      const counts: LensCounts = {
        security: fileFindings.filter((f) => f.agent === 'security').length,
        correctness: fileFindings.filter((f) => f.agent === 'correctness').length,
        readability: 0,
      };
      const blocked = fileFindings.some((f) => isBlocking(f.severity));
      const verdict: FileVerdict = blocked ? 'blocked' : 'safe';

      totals.security += counts.security;
      totals.correctness += counts.correctness;
      totals.readability += counts.readability;
      if (blocked) anyBlocked = true;

      await persist('file', () =>
        addScanFile(reviewId, { path: file.path, size: effectiveSize, lines, counts, verdict })
      );
      await persist('findings', () => addScanFindings(reviewId, fileFindings));

      send('fileVerdict', { path: file.path, verdict, counts });
      scanned += 1;
      send('progress', { scanned, total, agent: null, path: file.path });
    } catch {
      scanned += 1;
      send('fileVerdict', {
        path: file.path,
        verdict: 'safe',
        counts: { security: 0, correctness: 0, readability: 0 },
      });
      send('progress', { scanned, total, agent: null, path: file.path });
    }
  });

  const overall: FileVerdict = anyBlocked ? 'blocked' : 'safe';
  await persist('finalize', () =>
    finalizeScanReview(reviewId, { status: 'done', totals, verdict: overall })
  );
  send('verdict', { verdict: overall, totals });
  send('done', { reviewId });
}
