import { Octokit } from '@octokit/rest';
import { getOctokit } from './octokit';
import type { PRContext, RankedFinding, Verdict } from './types';

/** Thrown by getPublicRepoInfo when a repo is private (or not visible). */
export class PrivateRepoError extends Error {
  constructor() {
    super('PRIVATE_REPO');
    this.name = 'PrivateRepoError';
  }
}

/**
 * Confirms a repo is public (guards the shared server token from being used to
 * read private repos in the unauthenticated public path) and returns its
 * default branch.
 */
export async function getPublicRepoInfo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ defaultBranch: string }> {
  const { data } = await octokit.repos.get({ owner, repo });
  if (data.private) throw new PrivateRepoError();
  return { defaultBranch: data.default_branch };
}

export function parsePRUrl(url: string): { owner: string; repo: string; pullNumber: number } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error(`Invalid GitHub PR URL: ${url}`);
  return { owner: match[1], repo: match[2], pullNumber: parseInt(match[3]) };
}

export async function fetchPRContext(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRContext> {
  const octokit = getOctokit();

  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: pullNumber });

  // Fetch file list
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  return {
    owner,
    repo,
    pullNumber,
    headSha: pr.head.sha,
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    files: files.map((f) => f.filename),
  };
}

export async function fetchPRDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
  const octokit = getOctokit();
  const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: pullNumber,
    headers: { accept: 'application/vnd.github.diff' },
  });
  return response.data as unknown as string;
}

interface DiffLocation {
  file: string;
  newFileLine: number;
}

function buildDiffMap(diff: string): Map<number, DiffLocation> {
  const map = new Map<number, DiffLocation>();
  let currentFile = '';
  let newLineNum = 0;
  let diffLineNum = 0;

  for (const line of diff.split('\n')) {
    diffLineNum++;
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim();
      newLineNum = 0;
    } else if (line.startsWith('@@')) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (m) newLineNum = parseInt(m[1]) - 1;
    } else if (line.startsWith('+')) {
      newLineNum++;
      if (currentFile) map.set(diffLineNum, { file: currentFile, newFileLine: newLineNum });
    } else if (!line.startsWith('-')) {
      newLineNum++;
    }
  }

  return map;
}

export async function postReviewComments(
  ctx: PRContext,
  diff: string,
  findings: RankedFinding[],
  verdict: Verdict
): Promise<number> {
  const octokit = getOctokit();
  const diffMap = buildDiffMap(diff);

  const comments: { path: string; line: number; body: string }[] = [];
  for (const f of findings) {
    if (!f.line) continue;
    const loc = diffMap.get(f.line);
    if (!loc) continue;
    comments.push({
      path: loc.file,
      line: loc.newFileLine,
      body: `**[${f.severity}] ${f.type}** — ${Math.round(f.confidence * 100)}% confidence\n\n${f.message}\n\n*Detected by Sidecode ${f.agent} agent*`,
    });
  }

  const summaryBody = verdict.safe
    ? `✅ **Sidecode: Safe to merge**\n\n${verdict.summary}`
    : `⛔ **Sidecode: Blocked on ${verdict.blockedOn} critical finding${verdict.blockedOn !== 1 ? 's' : ''}**\n\n${verdict.summary}`;

  await octokit.pulls.createReview({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.pullNumber,
    event: 'COMMENT',
    body: summaryBody,
    comments,
  });

  return comments.length;
}

export async function setCommitStatus(
  ctx: PRContext,
  verdict: Verdict
): Promise<void> {
  const octokit = getOctokit();
  await octokit.repos.createCommitStatus({
    owner: ctx.owner,
    repo: ctx.repo,
    sha: ctx.headSha,
    state: verdict.safe ? 'success' : 'failure',
    description: verdict.safe
      ? 'Sidecode: safe to merge'
      : `Sidecode: blocked on ${verdict.blockedOn} finding${verdict.blockedOn !== 1 ? 's' : ''}`,
    context: 'Sidecode / code-review',
  });
}

export async function createFixPR(
  ctx: PRContext,
  fixedCode: string,
  description: string
): Promise<string> {
  const octokit = getOctokit();

  if (ctx.files.length !== 1) {
    // Multi-file PRs: post fix as a PR comment instead of opening a branch
    await octokit.issues.createComment({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.pullNumber,
      body: `## Sidecode Automated Fix\n\n${description}\n\n\`\`\`\n${fixedCode}\n\`\`\``,
    });
    return '';
  }

  const filename = ctx.files[0];
  const fixBranch = `sidecode-fix-${ctx.pullNumber}-${Date.now()}`;

  // Create branch from head
  await octokit.git.createRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `refs/heads/${fixBranch}`,
    sha: ctx.headSha,
  });

  // Get current file SHA
  const { data: fileData } = await octokit.repos.getContent({
    owner: ctx.owner,
    repo: ctx.repo,
    path: filename,
    ref: ctx.headBranch,
  });
  const fileSha = 'sha' in fileData ? fileData.sha : '';

  // Commit fix
  await octokit.repos.createOrUpdateFileContents({
    owner: ctx.owner,
    repo: ctx.repo,
    path: filename,
    message: `fix: Sidecode automated fix for PR #${ctx.pullNumber}`,
    content: Buffer.from(fixedCode).toString('base64'),
    sha: fileSha,
    branch: fixBranch,
  });

  // Open fix PR
  const { data: fixPr } = await octokit.pulls.create({
    owner: ctx.owner,
    repo: ctx.repo,
    title: `fix: Sidecode automated fixes for PR #${ctx.pullNumber}`,
    body: `Automated fixes generated by Sidecode.\n\n${description}`,
    head: fixBranch,
    base: ctx.baseBranch,
  });

  return fixPr.html_url;
}
