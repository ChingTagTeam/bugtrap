import {
  runSecurityAgent,
  runCorrectnessAgent,
  runReadabilityAgent,
  runCoordinatorAgent,
  runPatchAgent,
} from '@/lib/agents';
import { saveReview } from '@/lib/firestore';
import { parsePRUrl, fetchPRContext, fetchPRDiff, postReviewComments, setCommitStatus, createFixPR } from '@/lib/github';
import type { SSEEvent, AgentName, Finding, PRContext } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

function encode(event: SSEEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { code?: string; mode?: 'paste' | 'pr'; prUrl?: string };
  const { mode = 'paste', prUrl } = body;
  let { code = '' } = body;

  if (mode === 'paste' && !code.trim()) {
    return new Response(JSON.stringify({ error: 'code is required' }), { status: 400 });
  }
  if (mode === 'pr' && !prUrl) {
    return new Response(JSON.stringify({ error: 'prUrl is required' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent): void => {
        controller.enqueue(encode(event));
      };

      let prContext: PRContext | null = null;

      try {
        // Fetch PR diff if PR mode
        if (mode === 'pr' && prUrl) {
          const { owner, repo, pullNumber } = parsePRUrl(prUrl);
          [prContext, code] = await Promise.all([
            fetchPRContext(owner, repo, pullNumber),
            fetchPRDiff(owner, repo, pullNumber),
          ]);
        }

        // Phase 1: security runs first (its findings feed into correctness)
        send({ type: 'agent_start', agent: 'security' });
        const securityReport = await runSecurityAgent(code);
        if (securityReport.degraded) {
          send({ type: 'agent_error', agent: 'security', message: 'timed out' });
        } else {
          send({ type: 'agent_complete', agent: 'security', findings: securityReport.findings });
        }

        // Phase 2: correctness (with security context) + readability in parallel
        const runWithProgress = async (
          name: AgentName,
          fn: () => Promise<{ agent: AgentName; findings: Finding[]; degraded?: boolean }>
        ) => {
          send({ type: 'agent_start', agent: name });
          const report = await fn();
          if (report.degraded) {
            send({ type: 'agent_error', agent: name, message: 'timed out' });
          } else {
            send({ type: 'agent_complete', agent: name, findings: report.findings });
          }
          return report;
        };

        const [correctnessReport, readabilityReport] = await Promise.all([
          runWithProgress('correctness', () =>
            runCorrectnessAgent(code, securityReport.findings)
          ),
          runWithProgress('readability', () => runReadabilityAgent(code)),
        ]);

        // Coordinator
        send({ type: 'coordinator_start' });
        const verdict = await runCoordinatorAgent([securityReport, correctnessReport, readabilityReport]);
        send({ type: 'verdict', verdict });

        // Patch agent (only if there are high/critical findings)
        let patch = null;
        if (!verdict.safe) {
          send({ type: 'patch_start' });
          patch = await runPatchAgent(code, verdict);
          send({ type: 'patch_complete', patch });
        }

        // Save to Firestore
        const reviewId = await saveReview(
          code,
          [securityReport, correctnessReport, readabilityReport],
          verdict
        );
        send({ type: 'saved', reviewId });

        // GitHub actions if PR mode
        if (prContext) {
          const diff = code; // code is the diff in PR mode

          const commentCount = await postReviewComments(prContext, diff, verdict.rankedFindings, verdict);
          send({ type: 'github_comments', count: commentCount });

          await setCommitStatus(prContext, verdict);
          send({ type: 'github_status', state: verdict.safe ? 'success' : 'failure' });

          if (patch && !verdict.safe) {
            const fixPrUrl = await createFixPR(prContext, patch.fixedCode, patch.description);
            if (fixPrUrl) send({ type: 'github_fix_pr', prUrl: fixPrUrl });
          }
        }
      } catch (err) {
        send({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
