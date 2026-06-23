import { scaleSqrt } from 'd3-scale';
import type { Severity, AgentName } from '@/lib/types';
import type { LensCounts, FileVerdict } from '@/lib/scan-types';

/** Literal hex palette — canvas fillStyle can't resolve CSS variables.
 *  Sidecode tokens. Indigo is brand-only; findings use security red / bug
 *  amber; a clean node washes toward verdict green. */
export const PALETTE = {
  bg: '#1e1e1e',
  surf: '#2d2d30',
  line: '#3c3c3c',
  in: '#5c8af0',
  inBright: '#82a8f6',
  // legacy keys kept for any existing references, repointed to Sidecode
  lime: '#5c8af0',
  limeBright: '#82a8f6',
  tx: '#d4d4d4',
  tx2: '#9d9d9d',
  tx3: '#6e6e6e',
  sec: '#f26d78',
  bug: '#e8a33d',
  safe: '#4ec9a8',
  warn: '#e5c07b',
  // legacy lens keys fold into the two Sidecode finding colors
  cor: '#e8a33d',
  read: '#e8a33d',
  high: '#e5c07b',
  folder: 'rgba(157,157,157,0.5)',
} as const;

/** Each backend lens maps to one of the two Sidecode finding colors:
 *  security → security red; correctness + readability → bug amber. */
export const LENS_COLOR: Record<AgentName, string> = {
  security: PALETTE.sec,
  correctness: PALETTE.bug,
  readability: PALETTE.bug,
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: '#f26d78',
  HIGH: '#e8a33d',
  MEDIUM: '#e5c07b',
  LOW: '#e5c07b',
  INFO: '#6e6e6e',
};

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

const AGENT_PRIORITY: Record<AgentName, number> = {
  security: 3,
  correctness: 2,
  readability: 1,
};

/** lucide-style icon name to render on a node badge, keyed by lens. The two
 *  Sidecode agents are Security and Bug; correctness + readability both
 *  surface under the Bug lens. */
export const LENS_ICON: Record<AgentName, 'shield-alert' | 'bug'> = {
  security: 'shield-alert',
  correctness: 'bug',
  readability: 'bug',
};

export const LENS_LABEL: Record<AgentName, string> = {
  security: 'Security',
  correctness: 'Bug',
  readability: 'Bug',
};

/** True if `sev`/`agent` is more severe than the current worst on a node. */
export function moreSevere(
  curSev: Severity | null,
  curAgent: AgentName | null,
  sev: Severity,
  agent: AgentName
): boolean {
  const cur = curSev ? SEVERITY_RANK[curSev] : -1;
  const next = SEVERITY_RANK[sev] ?? 0;
  if (next !== cur) return next > cur;
  const curA = curAgent ? AGENT_PRIORITY[curAgent] : -1;
  return AGENT_PRIORITY[agent] > curA;
}

export function severityRank(sev: Severity): number {
  return SEVERITY_RANK[sev] ?? 0;
}

const radiusScale = scaleSqrt().domain([1, 600]).range([4.5, 20]).clamp(true);

export function radiusForLines(lines: number): number {
  return radiusScale(Math.max(1, lines));
}

/* ── Runtime graph node/link (force-graph mutates x/y/vx/vy in place) ── */

export interface RFNode {
  id: string;
  kind: 'root' | 'folder' | 'file';
  path: string;
  label: string;
  depth: number;
  lines: number;
  radius: number;
  counts: LensCounts;
  findingCount: number;
  worstSev: Severity | null;
  worstAgent: AgentName | null;
  verdict: FileVerdict | 'pending';
  lastFindingAt: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export interface RFLink {
  source: string;
  target: string;
}

export const ROOT_ID = 'root';

export function makeRootNode(repo: string): RFNode {
  return {
    id: ROOT_ID,
    kind: 'root',
    path: '',
    label: repo,
    depth: 0,
    lines: 0,
    radius: 9,
    counts: { security: 0, correctness: 0, readability: 0 },
    findingCount: 0,
    worstSev: null,
    worstAgent: null,
    verdict: 'safe',
    lastFindingAt: 0,
  };
}

export function makeFolderNode(path: string, depth: number): RFNode {
  const label = path.slice(path.lastIndexOf('/') + 1);
  return {
    id: `dir:${path}`,
    kind: 'folder',
    path,
    label,
    depth,
    lines: 0,
    radius: 3.5,
    counts: { security: 0, correctness: 0, readability: 0 },
    findingCount: 0,
    worstSev: null,
    worstAgent: null,
    verdict: 'safe',
    lastFindingAt: 0,
  };
}

export function makeFileNode(path: string, lines: number): RFNode {
  return {
    id: path,
    kind: 'file',
    path,
    label: path.slice(path.lastIndexOf('/') + 1),
    depth: path.split('/').length,
    lines,
    radius: radiusForLines(lines),
    counts: { security: 0, correctness: 0, readability: 0 },
    findingCount: 0,
    worstSev: null,
    worstAgent: null,
    verdict: 'pending',
    lastFindingAt: 0,
  };
}

/** Directory prefixes for a file path: "a/b/c.ts" → ["a", "a/b"]. */
export function folderChain(path: string): string[] {
  const parts = path.split('/');
  parts.pop(); // drop filename
  const chain: string[] = [];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    chain.push(acc);
  }
  return chain;
}
