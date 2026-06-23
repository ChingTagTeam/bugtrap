/**
 * Types for the GitHub-push webhook scan path. These mirror the JSON the
 * Vertex-backed agents (secret-detector-agent.md, fix-agent.md) actually
 * return — deliberately NOT the SSE shapes in scan-types.ts.
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type DetectorVerdict = 'BLOCKED' | 'WARN' | 'CLEAN';
export type PushVerdict = DetectorVerdict;

/** One finding as emitted by the Secret Detector agent (already redacted). */
export interface DetectorFinding {
  type: string;
  severity: Severity;
  file: string;
  line: number;
  match_redacted: string;
  reason: string;
  recommendation: string;
  confidence: number;
}

/** Full Secret Detector output (matches secret-detector-agent.md schema). */
export interface DetectorOutput {
  findings: DetectorFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    verdict: DetectorVerdict;
  };
}

/** Fix Agent output (matches fix-agent.md / generateFixes return). */
export interface FixOutput {
  fixes: unknown[];
  summary: { auto_fixes: number; suggested_fixes: number };
}

/** A changed file fetched at the push head SHA. */
export interface ChangedFile {
  path: string;
  contents: string;
  sha: string;
}

/** Result of scanning one file. Either a successful scan or an error record. */
export interface FileScanResult {
  path: string;
  verdict?: DetectorVerdict;
  findings?: DetectorFinding[];
  fixes?: FixOutput;
  error?: string;
}

/** Summed severity counts across a push. */
export interface Totals {
  critical: number;
  high: number;
  medium: number;
  low: number;
}
