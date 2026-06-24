import { Octokit } from '@octokit/rest';
import { optionalUid, errorResponse } from '@/lib/auth-server';
import { getOctokit, octokitForToken } from '@/lib/octokit';
import { getGithubToken } from '@/lib/firestore';
import { getPublicRepoInfo, PrivateRepoError, createScanFixPR } from '@/lib/github';

export const runtime = 'nodejs';
export const maxDuration = 60;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST { owner, repo, branch, description, files: [{ path, content }] } —
 * commits the supplied fixed files to a new branch off `branch` and opens one
 * PR back against it. Returns { prUrl }. The client generates `content` via
 * /api/patch first so the user previews the diff before this push.
 *
 * Opening a PR writes to the user's repo, so the public (unauthenticated) path
 * is rejected: a fix PR requires a connected GitHub account.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const uid = await optionalUid(req);

    const body: {
      owner?: string;
      repo?: string;
      branch?: string;
      description?: string;
      files?: { path?: string; content?: string }[];
    } = await req.json();
    const { owner, repo, branch, description } = body;
    if (!owner || !repo || !branch) {
      return jsonError('owner, repo and branch are required', 400);
    }

    const files = (body.files ?? [])
      .filter((f): f is { path: string; content: string } => !!f.path && typeof f.content === 'string')
      .map((f) => ({ path: f.path, content: f.content }));
    if (files.length === 0) {
      return jsonError('No files with fixes were supplied', 400);
    }

    let octokit: Octokit;
    if (uid) {
      const token = await getGithubToken(uid);
      if (!token) return jsonError('GitHub is not connected', 400);
      octokit = octokitForToken(token);
    } else {
      // Unauthenticated callers can only ever read public repos via the shared
      // token; they have no write access, so opening a PR is not allowed.
      octokit = getOctokit();
      try {
        await getPublicRepoInfo(octokit, owner, repo);
      } catch (err) {
        if (err instanceof PrivateRepoError) {
          return jsonError('This repository is private — sign in to open a fix PR.', 403);
        }
        return jsonError('Repository not found.', 404);
      }
      return jsonError('Sign in with GitHub to open a fix PR.', 401);
    }

    const prUrl = await createScanFixPR(
      octokit,
      owner,
      repo,
      branch,
      files,
      description ?? 'Automated fixes for issues found during the Sidecode scan.'
    );
    return Response.json({ prUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
