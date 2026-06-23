import assert from 'node:assert/strict';
import { scanChangedFiles } from '../../src/scanRepo';
import type { ChangedFile } from '../../src/webhookTypes';

let inFlight = 0, maxSeen = 0;
const detect = async (path: string) => {
  inFlight++; maxSeen = Math.max(maxSeen, inFlight);
  await new Promise((r) => setTimeout(r, 10));
  inFlight--;
  if (path === 'boom') throw new Error('detector failed');
  const high = path === 'bad';
  return {
    findings: high ? [{ type: 'API_KEY', severity: 'HIGH', file: path, line: 1, match_redacted: 'sk****', reason: '', recommendation: '', confidence: 0.9 }] : [],
    summary: { total: high ? 1 : 0, critical: 0, high: high ? 1 : 0, medium: 0, low: 0, verdict: high ? 'BLOCKED' : 'CLEAN' },
  };
};
const fix = async () => ({ fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } });

const files: ChangedFile[] = Array.from({ length: 10 }, (_, i) => ({ path: i === 3 ? 'bad' : i === 7 ? 'boom' : `f${i}`, contents: 'x', sha: 's' }));
const results = await scanChangedFiles(files, { concurrency: 4, scan: detect as never, fixer: fix as never });

assert.equal(results.length, 10);
assert.ok(maxSeen <= 4, `concurrency exceeded: ${maxSeen}`);
assert.equal(results.find((r) => r.path === 'boom')?.error, 'detector failed');
assert.equal(results.find((r) => r.path === 'bad')?.verdict, 'BLOCKED');
assert.equal(results.find((r) => r.path === 'f0')?.verdict, 'CLEAN');
console.log('check-scan-repo OK maxConcurrent=', maxSeen);
