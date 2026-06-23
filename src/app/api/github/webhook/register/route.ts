import crypto from 'crypto';
import { requireUid, errorResponse } from '@/lib/auth-server';
import { getGithubToken, registerWebhook, getWebhook } from '@/lib/firestore';
import { octokitForToken } from '@/lib/octokit';

export const runtime = 'nodejs';

/**
 * POST { owner, repo, branch? }
 *
 * Registers a GitHub webhook on the given repo so Sidecode receives push /
 * pull_request events and re-scans automatically.
 *
 * The webhook URL is derived from the incoming request's origin so it works
 * in both preview and production deployments without needing an extra env var.
 *
 * Requires the user to be signed in and to have connected GitHub.
 * The user must have push (or admin) access to the repo.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const uid = await requireUid(req);
    const body: { owner?: string; repo?: string; branch?: string } = await req.json();
    const { owner, repo } = body;
    if (!owner || !repo) {
      return Response.json({ error: 'owner and repo are required' }, { status: 400 });
    }

    const token = await getGithubToken(uid);
    if (!token) {
      return Response.json({ error: 'GitHub is not connected' }, { status: 400 });
    }

    // Bail early if already registered to avoid creating duplicate webhooks.
    const existing = await getWebhook(owner, repo);
    if (existing) {
      return Response.json({ ok: true, alreadyRegistered: true, branch: existing.branch });
    }

    const octokit = octokitForToken(token);

    // Resolve the default branch if the caller didn't specify one.
    let branch = body.branch?.trim() ?? '';
    if (!branch) {
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      branch = repoData.default_branch;
    }

    // Derive the webhook callback URL from the incoming request's origin.
    const webhookUrl = new URL('/api/github/webhook', new URL(req.url).origin).toString();

    // Generate a cryptographically random secret for payload signature verification.
    const secret = crypto.randomBytes(32).toString('hex');

    const { data: hook } = await octokit.repos.createWebhook({
      owner,
      repo,
      name: 'web',
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret,
        insecure_ssl: '0',
      },
      events: ['push', 'pull_request'],
      active: true,
    });

    await registerWebhook(uid, owner, repo, hook.id, secret, branch);

    return Response.json({ ok: true, webhookId: hook.id, branch, webhookUrl });
  } catch (err) {
    // Surface GitHub 403 (no push access) or 422 (webhook already exists) clearly.
    const status =
      err instanceof Error && 'status' in err
        ? (err as { status: number }).status
        : undefined;
    if (status === 403) {
      return Response.json(
        { error: 'You need admin or push access to register a webhook on this repository.' },
        { status: 403 }
      );
    }
    if (status === 422) {
      return Response.json(
        { error: 'A webhook for this URL already exists on the repository.' },
        { status: 409 }
      );
    }
    return errorResponse(err);
  }
}
