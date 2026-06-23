import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { fetchChangedFiles, type PushPayload } from './webhookFiles';
import { scanChangedFiles } from './scanRepo';
import { persistPushScan } from './lib/scan-persist';

/** Timing-safe HMAC-SHA256 check of the raw body against X-Hub-Signature-256. */
export function verifySignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

function branchOf(payload: PushPayload): string {
  return payload.ref?.replace('refs/heads/', '') ?? 'unknown';
}

async function processPush(payload: PushPayload): Promise<void> {
  const owner = payload.repository.owner.login ?? payload.repository.owner.name ?? '?';
  const repoFull = `${owner}/${payload.repository.name}`;
  const files = await fetchChangedFiles(payload);
  const results = await scanChangedFiles(files);
  const summary = await persistPushScan({
    repo: repoFull,
    branch: branchOf(payload),
    commitSha: payload.after,
    results,
  });
  const findingCount = summary.totals.critical + summary.totals.high + summary.totals.medium + summary.totals.low;
  // one-line summary; no secrets/contents
  console.log(`[scan] ${repoFull} ${payload.after.slice(0, 7)} files=${summary.filesScanned} findings=${findingCount} verdict=${summary.verdict}`);
}

export function createServer() {
  const app = express();

  app.post('/webhook/github', express.raw({ type: '*/*' }), (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';
    const signature = req.header('X-Hub-Signature-256') ?? '';
    const rawBody = req.body as Buffer;

    if (!verifySignature(rawBody, signature, secret)) {
      res.status(401).send('invalid signature');
      return;
    }
    if (req.header('X-GitHub-Event') !== 'push') {
      res.status(200).send('ignored');
      return;
    }

    let payload: PushPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as PushPayload;
    } catch {
      res.status(400).send('invalid json');
      return;
    }

    res.status(200).send('ok'); // ack BEFORE scanning (GitHub ~10s timeout)
    void processPush(payload).catch((err) => {
      console.error('[scan] processing failed:', err instanceof Error ? err.message : err);
    });
  });

  app.get('/health', (_req, res) => { res.status(200).send('ok'); });
  return app;
}

// Boot only when run directly (not when imported by a check).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  createServer().listen(port, () => console.log(`webhook server listening on :${port}`));
}
