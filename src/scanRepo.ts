import type { ChangedFile, DetectorOutput, FileScanResult, FixOutput } from './webhookTypes';

type ScanFn = (path: string, contents: string) => Promise<DetectorOutput>;
type FixFn = (path: string, contents: string, findings: DetectorOutput['findings']) => Promise<FixOutput>;

interface Options {
  concurrency?: number;
  scan?: ScanFn;
  fixer?: FixFn;
}

/**
 * Load the real Vertex-backed agents lazily. They construct a GoogleGenAI
 * client at module-load time, so importing them eagerly would throw when no
 * Vertex/Gemini auth is configured (e.g. in the offline check scripts that
 * inject their own scan/fixer). Deferring the import means only callers that
 * actually use the defaults pay that cost.
 */
async function defaultAgents(): Promise<{ scan: ScanFn; fixer: FixFn }> {
  const [{ scanForSecrets }, { generateFixes }] = await Promise.all([
    import('./secretDetector.js'),
    import('./fixAgent.js'),
  ]);
  return { scan: scanForSecrets as ScanFn, fixer: generateFixes as FixFn };
}

async function scanOne(file: ChangedFile, scan: ScanFn, fixer: FixFn): Promise<FileScanResult> {
  try {
    const detected = await scan(file.path, file.contents);
    const findings = detected.findings ?? [];
    const fixes = findings.length > 0
      ? await fixer(file.path, file.contents, findings)
      : { fixes: [], summary: { auto_fixes: 0, suggested_fixes: 0 } };
    return { path: file.path, verdict: detected.summary.verdict, findings, fixes };
  } catch (err) {
    // graceful degradation — never include file contents in the message
    return { path: file.path, error: err instanceof Error ? err.message : 'scan failed' };
  }
}

/** Scan each file through detector→fix, capped at `concurrency` in flight. */
export async function scanChangedFiles(
  files: ChangedFile[],
  opts: Options = {}
): Promise<FileScanResult[]> {
  const concurrency = opts.concurrency ?? 4;
  // Only load the real agents (and trigger their Vertex client) when an
  // override is missing for either function. When both overrides are present
  // the agents are never imported (keeps offline callers off the Vertex path).
  const loaded = opts.scan && opts.fixer
    ? { scan: opts.scan, fixer: opts.fixer }
    : await defaultAgents();
  const scan: ScanFn = opts.scan ?? loaded.scan;
  const fixer: FixFn = opts.fixer ?? loaded.fixer;

  const results: FileScanResult[] = new Array(files.length);
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const i = cursor++;
      results[i] = await scanOne(files[i], scan, fixer);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, files.length) }, worker);
  await Promise.all(workers);
  return results;
}
