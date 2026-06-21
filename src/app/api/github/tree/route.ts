import { requireUid, errorResponse } from '@/lib/auth-server';
import { octokitForToken } from '@/lib/octokit';
import { getGithubToken } from '@/lib/firestore';
import type { TreeEntry } from '@/lib/scan-types';

export const runtime = 'nodejs';

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET ?owner&repo&branch — the recursive git tree for a repository. */
export async function GET(req: Request): Promise<Response> {
  try {
    const uid = await requireUid(req);
    const token = await getGithubToken(uid);
    if (!token) return jsonError('GitHub is not connected', 400);

    const { searchParams } = new URL(req.url);
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const branch = searchParams.get('branch');
    if (!owner || !repo || !branch) return jsonError('owner, repo and branch are required', 400);

    const octokit = octokitForToken(token);
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: 'true',
    });

    const tree: TreeEntry[] = [];
    for (const entry of data.tree) {
      if (entry.path && (entry.type === 'blob' || entry.type === 'tree')) {
        tree.push({ path: entry.path, type: entry.type, size: entry.size ?? 0 });
      }
    }

    return Response.json({ branch, tree, truncated: data.truncated ?? false });
  } catch (err) {
    return errorResponse(err);
  }
}
