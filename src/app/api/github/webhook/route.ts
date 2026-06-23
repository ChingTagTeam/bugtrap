import crypto, { randomUUID } from 'crypto';
import { after } from 'next/server';
import { getWebhook, getGithubToken, finalizeScanReview } from '@/lib/firestore';
import { octokitForToken } from '@/lib/octokit';
import { isReviewableSourceFile } from '@/lib/scan-filter';
import { runScan } from '@/lib/scan-runner';

export const runtime = 'nodejs';

// GitHub's HMAC-SHA256 signature is in the X-Hub-Signature-256 header.
function verifySignature(rawBody: string, secret: string, sigHeader: string | null): boolean {
  if (!sigHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    // Buffers must be the same byte length for timingSafeEqual.
    const a = Buffer.from(sigHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  const event = req.headers.get('x-github-event') ?? '';
  const sigHeader = req.headers.get('x-hub-signature-256');

  // Read raw body first — needed for HMAC verification before any parsing.
  const rawBody = await req.text();

  // Quick filter: only handle event types we care about.
  if (event !== 'push' && event !== 'pull_request' && event !== 'ping') {
    return new Response('OK', { status: 200 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // GitHub sends a `ping` on webhook creation — acknowledge it and return.
  if (event === 'ping') return new Response('pong', { status: 200 });

  const repoData = payload.repository as { name: string; owner: { login: string } } | undefined;
  if (!repoData?.name || !repoData?.owner?.login) {
    return new Response('Missing repository in payload', { status: 400 });
  }

  const owner = repoData.owner.login;
  const repo = repoData.name;

  // Look up the registered webhook — tells us which user owns it + the secret.
  const webhook = await getWebhook(owner, repo);
  if (!webhook) {
    // Repo isn't registered with Sidecode; ignore silently.
    return new Response('OK', { status: 200 });
  }

  if (!verifySignature(rawBody, webhook.secret, sigHeader)) {
    return new Response('Invalid signature', { status: 403 });
  }

  // For push events, only act on the registered branch.
  if (event === 'push') {
    const ref = payload.ref as string | undefined;
    if (ref !== `refs/heads/${webhook.branch}`) {
      return new Response('OK', { status: 200 });
    }
  }

  // For pull_request events, only act on opened or synchronize.
  if (event === 'pull_request') {
    const action = payload.action as string | undefined;
    if (action !== 'opened' && action !== 'synchronize') {
      return new Response('OK', { status: 200 });
    }
  }

  // Respond to GitHub immediately (it times out after 10 s), then scan.
  after(async () => {
    const reviewId = randomUUID();
    let branch = webhook.branch;
    let onlyPaths: string[] | undefined;

    try {
      const token = await getGithubToken(webhook.uid);
      if (!token) {
        console.warn(`[webhook] no GitHub token for uid ${webhook.uid}`);
        return;
      }
      const octokit = octokitForToken(token);

      if (event === 'push') {
        // Collect all added + modified files across every commit in the push.
        type Commit = { added?: string[]; modified?: string[]; removed?: string[] };
        const commits = (payload.commits as Commit[] | undefined) ?? [];
        const changed = new Set<string>();
        for (const commit of commits) {
          for (const f of [...(commit.added ?? []), ...(commit.modified ?? [])]) {
            changed.add(f);
          }
        }
        // Filter to reviewable source files (path-based only; size validated during fetch).
        onlyPaths = [...changed].filter((p) => isReviewableSourceFile(p, 1));
        if (onlyPaths.length === 0) return;
      } else if (event === 'pull_request') {
        const pr = payload.pull_request as {
          number: number;
          head: { ref: string };
        };
        branch = pr.head.ref;
        const { data: prFiles } = await octokit.pulls.listFiles({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 100,
        });
        onlyPaths = prFiles
          .filter((f) => f.status !== 'removed')
          .map((f) => f.filename)
          .filter((p) => isReviewableSourceFile(p, 1));
        if (onlyPaths.length === 0) return;
      }

      await runScan({
        reviewId,
        owner,
        repo,
        branch,
        uid: webhook.uid,
        isPublic: false,
        octokit,
        onlyPaths,
        // No `send` — background scan; results go straight to Firestore.
      });
    } catch (err) {
      console.error('[webhook] background scan failed:', err);
      await finalizeScanReview(reviewId, {
        status: 'error',
        totals: { security: 0, correctness: 0, readability: 0 },
        verdict: 'safe',
      }).catch(() => undefined);
    }
  });

  return new Response('OK', { status: 200 });
}
