import type { FileScanResult, Totals, PushVerdict } from '../webhookTypes';

/** Sum per-file detector counts. Errored files contribute nothing. */
export function rollUpTotals(files: FileScanResult[]): Totals {
  const t: Totals = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of files) {
    for (const finding of f.findings ?? []) {
      if (finding.severity === 'CRITICAL') t.critical++;
      else if (finding.severity === 'HIGH') t.high++;
      else if (finding.severity === 'MEDIUM') t.medium++;
      else if (finding.severity === 'LOW') t.low++;
    }
  }
  return t;
}

/** Push headline: BLOCKED if any file BLOCKED, else WARN if any WARN, else CLEAN. */
export function rollUpVerdict(files: FileScanResult[]): PushVerdict {
  let sawWarn = false;
  for (const f of files) {
    if (f.verdict === 'BLOCKED') return 'BLOCKED';
    if (f.verdict === 'WARN') sawWarn = true;
  }
  return sawWarn ? 'WARN' : 'CLEAN';
}
