import assert from 'node:assert/strict';
import { rollUpTotals, rollUpVerdict } from '../../src/lib/scan-persist';
import type { FileScanResult } from '../../src/webhookTypes';

const files: FileScanResult[] = [
  { path: 'a', verdict: 'CLEAN', findings: [], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'b', verdict: 'WARN', findings: [{ type: 'WEBHOOK_URL', severity: 'MEDIUM', file: 'b', line: 2, match_redacted: 'http****', reason: '', recommendation: '', confidence: 0.7 }], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
  { path: 'c', error: 'boom' },
];
assert.deepEqual(rollUpTotals(files), { critical: 0, high: 0, medium: 1, low: 0 });
assert.equal(rollUpVerdict(files), 'WARN');

const withBlock: FileScanResult[] = [
  ...files,
  { path: 'd', verdict: 'BLOCKED', findings: [{ type: 'API_KEY', severity: 'HIGH', file: 'd', line: 1, match_redacted: 'sk****', reason: '', recommendation: '', confidence: 0.9 }], fixes: { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } } },
];
assert.equal(rollUpVerdict(withBlock), 'BLOCKED');
assert.deepEqual(rollUpTotals(withBlock), { critical: 0, high: 1, medium: 1, low: 0 });

assert.equal(rollUpVerdict([{ path: 'x', error: 'e' }]), 'CLEAN'); // errors only → CLEAN
console.log('check-verdict OK');
