import type { DetectorOutput, FixOutput, FileScanResult, PushVerdict } from '../../src/webhookTypes';

// Compile-time only: if the types don't exist or shapes change, tsc fails.
const _d: DetectorOutput = {
  findings: [{ type: 'API_KEY', severity: 'HIGH', file: 'a.ts', line: 1, match_redacted: 'sk_l****', reason: 'r', recommendation: 'x', confidence: 0.9 }],
  summary: { total: 1, critical: 0, high: 1, medium: 0, low: 0, verdict: 'BLOCKED' },
};
const _f: FixOutput = { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } };
const _r: FileScanResult = { path: 'a.ts', verdict: 'BLOCKED', findings: _d.findings, fixes: _f };
const _v: PushVerdict = 'CLEAN';
console.log('check-types OK', _r.path, _v, _f.summary.auto_fixes);
