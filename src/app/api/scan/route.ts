import { Octokit } from '@octokit/rest';
import { optionalUid } from '@/lib/auth-server';
import { getOctokit, octokitForToken } from '@/lib/octokit';
import {
  getGithubToken,
  createScanReview,
  addScanFile,
  addScanFindings,
  finalizeScanReview,
} from '@/lib/firestore';
import { getPublicRepoInfo, PrivateRepoError } from '@/lib/github';
import { runSecurityAgent, runCorrectnessAgent, runReadabilityAgent } from '@/lib/agents';
import { isReviewableSourceFile } from '@/lib/scan-filter';
import { sseEncode } from '@/lib/sse';
import type { AgentReport, Severity } from '@/lib/types';
import type { ScanFinding, LensCounts, FileVerdict } from '@/lib/scan-types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_FILES = 150;
const CONCURRENCY = 4;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Best-effort Firestore persistence. A scan should still stream its live
 * build-out even when Firestore / Google Cloud credentials are unavailable —
 * revisit just won't work. Same graceful-degradation spirit as the agents.
 */
async function persist(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`[scan] persist ${label} failed:`, e instanceof Error ? e.message : e);
  }
}

function isBlocking(sev: Severity): boolean {
  return sev === 'CRITICAL' || sev === 'HIGH';
}

function reportToFindings(path: string, report: AgentReport): ScanFinding[] {
  return report.findings.map((f) => ({
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

export async function POST(req: Request): Promise<Response> {
  // Signed-in users scan their own repos with their stored token; anyone can
  // scan a PUBLIC repo unauthenticated via the shared server token.
  const uid = await optionalUid(req);
  const isPublic = uid === null;

  let body: { reviewId?: string; owner?: string; repo?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    // An empty or truncated body (e.g. a client-aborted request) lands here —
    // respond cleanly instead of throwing an unhandled SyntaxError.
    return jsonError('Invalid or empty request body', 400);
  }
  const reviewId = body.reviewId;
  const owner = body.owner;
  const repo = body.repo;
  let branch = body.branch?.trim() ?? '';
  if (!reviewId || !owner || !repo) {
    return jsonError('reviewId, owner and repo are required', 400);
  }

  let octokit: Octokit;
  let effectiveUid: string;

  if (isPublic) {
    octokit = getOctokit();
    effectiveUid = 'public';
    try {
      const info = await getPublicRepoInfo(octokit, owner, repo);
      if (!branch) branch = info.defaultBranch;
    } catch (err) {
      if (err instanceof PrivateRepoError) {
        return jsonError('This repository is private — sign in with GitHub to scan it.', 403);
      }
      return jsonError('Repository not found.', 404);
    }
  } else {
    const token = await getGithubToken(uid);
    if (!token) return jsonError('GitHub is not connected', 400);
    octokit = octokitForToken(token);
    effectiveUid = uid;
    if (!branch) {
      try {
        const { data } = await octokit.repos.get({ owner, repo });
        branch = data.default_branch;
      } catch {
        return jsonError('Repository not found.', 404);
      }
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(sseEncode(event, data));
      };

      const totals: LensCounts = { security: 0, correctness: 0, readability: 0 };
      let scanned = 0;
      let anyBlocked = false;

      try {
        const { data: treeData } = await octokit.git.getTree({
          owner,
          repo,
          tree_sha: branch,
          recursive: 'true',
        });

        const candidates: { path: string; size: number }[] = [];
        for (const entry of treeData.tree) {
          if (entry.type === 'blob' && entry.path && isReviewableSourceFile(entry.path, entry.size ?? 0)) {
            candidates.push({ path: entry.path, size: entry.size ?? 0 });
          }
        }

        const truncated = (treeData.truncated ?? false) || candidates.length > MAX_FILES;
        const files = candidates.slice(0, MAX_FILES);
        const total = files.length;

        await persist('createReview', () =>
          createScanReview(reviewId, { uid: effectiveUid, owner, repo, branch, truncated, total, isPublic })
        );
        send('review', { reviewId, owner, repo, branch, total, truncated, public: isPublic });

        if (total === 0) {
          await persist('finalize', () => finalizeScanReview(reviewId, { status: 'done', totals, verdict: 'safe' }));
          send('verdict', { verdict: 'safe', totals });
          send('done', { reviewId });
          controller.close();
          return;
        }

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
            const lines = content.length === 0 ? Math.max(1, Math.round(file.size / 40)) : content.split('\n').length;

            send('node', { path: file.path, size: file.size, lines });

            if (content.length === 0) {
              await persist('file', () =>
                addScanFile(reviewId, {
                  path: file.path,
                  size: file.size,
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
            const [correctnessReport, readabilityReport] = await Promise.all([
              runCorrectnessAgent(content, securityReport.findings),
              runReadabilityAgent(content),
            ]);

            const reports = [securityReport, correctnessReport, readabilityReport];
            const fileFindings: ScanFinding[] = reports.flatMap((r) => reportToFindings(file.path, r));

            for (const finding of fileFindings) {
              send('finding', finding);
            }

            const counts: LensCounts = {
              security: securityReport.findings.length,
              correctness: correctnessReport.findings.length,
              readability: readabilityReport.findings.length,
            };
            const blocked = fileFindings.some((f) => isBlocking(f.severity));
            const verdict: FileVerdict = blocked ? 'blocked' : 'safe';

            totals.security += counts.security;
            totals.correctness += counts.correctness;
            totals.readability += counts.readability;
            if (blocked) anyBlocked = true;

            await persist('file', () => addScanFile(reviewId, { path: file.path, size: file.size, lines, counts, verdict }));
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
        await persist('finalize', () => finalizeScanReview(reviewId, { status: 'done', totals, verdict: overall }));
        send('verdict', { verdict: overall, totals });
        send('done', { reviewId });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Scan failed';
        await finalizeScanReview(reviewId, { status: 'error', totals, verdict: anyBlocked ? 'blocked' : 'safe' }).catch(
          () => undefined
        );
        send('error', { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
