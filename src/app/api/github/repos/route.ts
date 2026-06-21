import { requireUid, errorResponse } from '@/lib/auth-server';
import { octokitForToken } from '@/lib/octokit';
import { getGithubToken } from '@/lib/firestore';
import type { RepoSummary } from '@/lib/scan-types';

export const runtime = 'nodejs';

/** GET → the signed-in user's repositories (most-recently-updated first). */
export async function GET(req: Request): Promise<Response> {
  try {
    const uid = await requireUid(req);
    const token = await getGithubToken(uid);
    if (!token) {
      return new Response(JSON.stringify({ error: 'GitHub is not connected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const octokit = octokitForToken(token);
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      visibility: 'all',
    });

    const repos: RepoSummary[] = data.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      defaultBranch: r.default_branch,
      private: r.private,
      language: r.language ?? null,
      sizeKb: r.size ?? 0,
      updatedAt: r.updated_at ?? '',
    }));

    return Response.json({ repos });
  } catch (err) {
    return errorResponse(err);
  }
}
