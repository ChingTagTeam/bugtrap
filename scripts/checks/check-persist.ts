import assert from 'node:assert/strict';
import { persistPushScan } from '../../src/lib/scan-persist';
import type { FileScanResult } from '../../src/webhookTypes';

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
function fakeDb() {
  const scanDoc = {
    set: async (data: Record<string, unknown>) => { writes.push({ path: 'scans/sha1', data }); },
    collection: () => ({ doc: () => ({ __fileDoc: true }) }),
  };
  return {
    collection: (c: string) => ({ doc: (id: string) => { assert.equal(`${c}/${id}`, 'scans/sha1'); return scanDoc; } }),
    batch: () => ({
      set: (_ref: unknown, data: Record<string, unknown>) => { writes.push({ path: 'scans/sha1/files', data }); },
      commit: async () => {},
    }),
  };
}

const files: FileScanResult[] = [
  { path: 'a.ts', verdict: 'CLEAN', findings: [], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'b.ts', verdict: 'BLOCKED', findings: [{ type: 'API_KEY', severity: 'HIGH', file: 'b.ts', line: 1, match_redacted: 'sk****', reason: '', recommendation: '', confidence: 0.9 }], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'c.ts', error: 'boom' },
];

const summary = await persistPushScan(
  { repo: 'o/r', branch: 'main', commitSha: 'sha1', results: files },
  { db: fakeDb() as never, now: () => 'TS' }
);

assert.equal(summary.verdict, 'BLOCKED');
assert.deepEqual(summary.totals, { critical: 0, high: 1, medium: 0, low: 0 });
assert.equal(summary.filesScanned, 3);
const head = writes.find((w) => w.path === 'scans/sha1')!;
assert.equal(head.data.repo, 'o/r');
assert.equal(head.data.commitSha, 'sha1');
assert.equal(head.data.verdict, 'BLOCKED');
assert.equal(writes.filter((w) => w.path === 'scans/sha1/files').length, 3);
console.log('check-persist OK');
