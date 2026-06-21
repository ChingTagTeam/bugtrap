import { Octokit } from '@octokit/rest';
import { optionalUid, errorResponse } from '@/lib/auth-server';
import { getOctokit, octokitForToken } from '@/lib/octokit';
import { getGithubToken } from '@/lib/firestore';
import { getPublicRepoInfo, PrivateRepoError } from '@/lib/github';
import { runPatchAgent } from '@/lib/agents';
import type { Verdict, RankedFinding } from '@/lib/types';
import type { ScanFinding } from '@/lib/scan-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST { owner, repo, branch, path, findings } — runs the EXISTING patch agent
 * on a single file's findings and returns { description, fixedCode }.
 * Authenticated users use their token; otherwise public repos only.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const uid = await optionalUid(req);

    const body: {
      owner?: string;
      repo?: string;
      branch?: string;
      path?: string;
      findings?: ScanFinding[];
    } = await req.json();
    const { owner, repo, branch, path, findings } = body;
    if (!owner || !repo || !branch || !path) {
      return jsonError('owner, repo, branch and path are required', 400);
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
          return jsonError('This repository is private — sign in to generate fixes.', 403);
        }
        return jsonError('Repository not found.', 404);
      }
    }

    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if (Array.isArray(data) || data.type !== 'file') return jsonError('Path is not a file', 400);
    const content =
      data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf-8') : data.content;

    const rankedFindings: RankedFinding[] = (findings ?? []).map((f) => ({
      line: f.line,
      severity: f.severity,
      confidence: f.confidence,
      type: f.type,
      message: f.message,
      agent: f.agent,
    }));
    const blocking = rankedFindings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
    const verdict: Verdict = {
      safe: blocking === 0,
      blockedOn: blocking,
      summary: '',
      rankedFindings,
      disagreements: [],
    };

    const patch = await runPatchAgent(content, verdict);
    return Response.json(patch);
  } catch (err) {
    return errorResponse(err);
  }
}
