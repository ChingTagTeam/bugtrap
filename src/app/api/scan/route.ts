import { Octokit } from '@octokit/rest';
import { optionalUid } from '@/lib/auth-server';
import { getOctokit, octokitForToken } from '@/lib/octokit';
import { getGithubToken, finalizeScanReview } from '@/lib/firestore';
import { getPublicRepoInfo, PrivateRepoError } from '@/lib/github';
import { runScan } from '@/lib/scan-runner';
import { sseEncode } from '@/lib/sse';

export const runtime = 'nodejs';
export const maxDuration = 300;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request): Promise<Response> {
  const uid = await optionalUid(req);
  const isPublic = uid === null;

  let body: { reviewId?: string; owner?: string; repo?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
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

      try {
        await runScan({
          reviewId,
          owner,
          repo,
          branch,
          uid: effectiveUid,
          isPublic,
          octokit,
          send,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Scan failed';
        await finalizeScanReview(reviewId, {
          status: 'error',
          totals: { security: 0, correctness: 0, readability: 0 },
          verdict: 'safe',
        }).catch(() => undefined);
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
