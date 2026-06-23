import { getOctokit } from './lib/octokit';
import type { Octokit } from '@octokit/rest';

export interface RegisterResult {
  id: number;
  action: 'created' | 'updated';
}

function webhookUrl(): string {
  const base = process.env.PUBLIC_URL;
  if (!base) throw new Error('PUBLIC_URL is not set');
  return `${base.replace(/\/$/, '')}/webhook/github`;
}

/**
 * Register (or update) the BugTrap push webhook on a repo. Idempotent: a hook
 * whose config.url already matches ours is updated in place, never duplicated.
 * This is the shared core the CLI and the future connect-repo endpoint both call.
 */
export async function registerRepoWebhook(
  owner: string,
  repo: string,
  opts: { octokit?: Octokit } = {}
): Promise<RegisterResult> {
  const octokit = opts.octokit ?? getOctokit();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET is not set');
  const url = webhookUrl();
  const config = { url, content_type: 'json' as const, secret };

  const { data: hooks } = await octokit.repos.listWebhooks({ owner, repo });
  const existing = hooks.find((h) => h.config?.url === url);

  if (existing) {
    const { data } = await octokit.repos.updateWebhook({
      owner, repo, hook_id: existing.id, config, events: ['push'], active: true,
    });
    return { id: data.id, action: 'updated' };
  }
  const { data } = await octokit.repos.createWebhook({
    owner, repo, config, events: ['push'], active: true,
  });
  return { id: data.id, action: 'created' };
}
