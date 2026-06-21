/**
 * Parses a GitHub repo reference into { owner, repo, branch? }.
 * Accepts full URLs, git@ SSH, host-relative, and owner/repo shorthand:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/main
 *   git@github.com:owner/repo.git
 *   github.com/owner/repo
 *   owner/repo
 * Returns null if it can't find an owner and repo.
 */
export function parseRepoUrl(input: string): { owner: string; repo: string; branch?: string } | null {
  let s = input.trim();
  if (!s) return null;

  s = s
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/\.git(\/|$)/i, '$1')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^github\.com\//i, '');

  const parts = s.split(/[/]/).filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) return null;

  let branch: string | undefined;
  if (parts[2] === 'tree' && parts[3]) branch = parts.slice(3).join('/');

  return { owner, repo, branch };
}
