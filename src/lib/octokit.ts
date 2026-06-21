import { Octokit } from '@octokit/rest';

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!_octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set');
    _octokit = new Octokit({ auth: token });
  }
  return _octokit;
}

/**
 * Per-user Octokit, authenticated with a user's stored GitHub OAuth token.
 * Used by the repo-scan feature (the global getOctokit() above still backs
 * the existing PR review flow).
 */
export function octokitForToken(token: string): Octokit {
  return new Octokit({ auth: token });
}
