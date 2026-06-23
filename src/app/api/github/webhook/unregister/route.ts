import { requireUid, errorResponse } from '@/lib/auth-server';
import { getGithubToken, getWebhook, deleteWebhook } from '@/lib/firestore';
import { octokitForToken } from '@/lib/octokit';

export const runtime = 'nodejs';

/**
 * POST { owner, repo }
 *
 * Deletes the GitHub webhook for the given repo and removes the registration
 * from Firestore. Safe to call even if the webhook no longer exists on GitHub
 * (e.g., the user deleted it manually).
 *
 * Only the user who registered the webhook can unregister it.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const uid = await requireUid(req);
    const body: { owner?: string; repo?: string } = await req.json();
    const { owner, repo } = body;
    if (!owner || !repo) {
      return Response.json({ error: 'owner and repo are required' }, { status: 400 });
    }

    const webhook = await getWebhook(owner, repo);
    if (!webhook) {
      return Response.json({ ok: true, wasRegistered: false });
    }

    // Only the registering user may unregister.
    if (webhook.uid !== uid) {
      return Response.json({ error: 'Not authorised' }, { status: 403 });
    }

    const token = await getGithubToken(uid);
    if (token) {
      const octokit = octokitForToken(token);
      try {
        await octokit.repos.deleteWebhook({ owner, repo, hook_id: webhook.webhookId });
      } catch (err) {
        // 404 means the hook was already deleted on GitHub — that's fine.
        const status =
          err instanceof Error && 'status' in err
            ? (err as { status: number }).status
            : undefined;
        if (status !== 404) throw err;
      }
    }

    await deleteWebhook(owner, repo);

    return Response.json({ ok: true, wasRegistered: true });
  } catch (err) {
    return errorResponse(err);
  }
}
