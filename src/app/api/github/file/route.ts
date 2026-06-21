import { Octokit } from '@octokit/rest';
import { optionalUid, errorResponse } from '@/lib/auth-server';
import { getOctokit, octokitForToken } from '@/lib/octokit';
import { getGithubToken } from '@/lib/firestore';
import { getPublicRepoInfo, PrivateRepoError } from '@/lib/github';
import { inferLanguage } from '@/lib/scan-filter';
import type { FileResult } from '@/lib/scan-types';

export const runtime = 'nodejs';

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET ?owner&repo&ref&path — raw decoded text of a single file.
 *  Authenticated users read via their token; otherwise public repos only. */
export async function GET(req: Request): Promise<Response> {
  try {
    const uid = await optionalUid(req);

    const { searchParams } = new URL(req.url);
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const ref = searchParams.get('ref');
    const path = searchParams.get('path');
    if (!owner || !repo || !ref || !path) {
      return jsonError('owner, repo, ref and path are required', 400);
    }

    let octokit: Octokit;
    if (uid) {
      const token = await getGithubToken(uid);
      if (!token) return jsonError('GitHub is not connected', 400);
      octokit = octokitForToken(token);
    } else {
      octokit = getOctokit();
      try {
        await getPublicRepoInfo(octokit, owner, repo);
      } catch (err) {
        if (err instanceof PrivateRepoError) {
          return jsonError('This repository is private — sign in to view its files.', 403);
        }
        return jsonError('Repository not found.', 404);
      }
    }

    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== 'file') {
      return jsonError('Path is not a file', 400);
    }

    const content =
      data.encoding === 'base64'
        ? Buffer.from(data.content, 'base64').toString('utf-8')
        : data.content;
    const { language } = inferLanguage(path);
    const lineCount = content.length === 0 ? 0 : content.split('\n').length;

    const result: FileResult = { path, language, content, lineCount };
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
