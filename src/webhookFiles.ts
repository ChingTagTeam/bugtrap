import { getOctokit } from './lib/octokit';
import { isReviewableSourceFile } from './lib/scan-filter';
import type { ChangedFile } from './webhookTypes';

const MAX_FILE_BYTES = 120_000; // mirror scan-filter's cap for the post-fetch check

interface PushCommit {
  added?: string[];
  modified?: string[];
  removed?: string[];
}
export interface PushPayload {
  after: string;
  repository: { name: string; owner: { login?: string; name?: string } };
  commits?: PushCommit[];
  ref?: string;
}

/** Deduped, source-only list of added/modified paths (removed ignored). */
export function collectChangedPaths(payload: PushPayload): Set<string> {
  const paths = new Set<string>();
  for (const c of payload.commits ?? []) {
    for (const p of [...(c.added ?? []), ...(c.modified ?? [])]) {
      if (isReviewableSourceFile(p, 1)) paths.add(p); // sentinel size: ext/dir rules only
    }
  }
  return paths;
}

function ownerOf(payload: PushPayload): string {
  const o = payload.repository.owner;
  const login = o.login ?? o.name;
  if (!login) throw new Error('push payload missing repository owner');
  return login;
}

/** Fetch each changed source file's contents at the push head SHA. */
export async function fetchChangedFiles(payload: PushPayload): Promise<ChangedFile[]> {
  const octokit = getOctokit();
  const owner = ownerOf(payload);
  const repo = payload.repository.name;
  const sha = payload.after;
  const out: ChangedFile[] = [];

  for (const path of collectChangedPaths(payload)) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref: sha });
      if (Array.isArray(data) || data.type !== 'file' || typeof data.content !== 'string') {
        continue; // directory or non-file content
      }
      const contents = Buffer.from(data.content, 'base64').toString('utf-8');
      if (Buffer.byteLength(contents) > MAX_FILE_BYTES) continue; // enforce real size
      out.push({ path, contents, sha });
    } catch {
      // 404 / decode / API error: drop this file, keep the batch alive. No content logged.
      continue;
    }
  }
  return out;
}
