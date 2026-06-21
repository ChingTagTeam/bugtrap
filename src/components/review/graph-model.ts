import { scaleSqrt } from 'd3-scale';
import type { Severity, AgentName } from '@/lib/types';
import type { LensCounts, FileVerdict } from '@/lib/scan-types';

/** Literal hex palette — canvas fillStyle can't resolve CSS variables. */
export const PALETTE = {
  bg: '#1d1d20',
  surf: '#28282d',
  line: 'rgba(255,255,255,0.10)',
  lime: '#83c818',
  limeBright: '#a6f02e',
  tx: '#f2f2ef',
  tx2: '#a3a3a8',
  tx3: '#6f6f76',
  sec: '#ff5d6c',
  cor: '#83c818',
  read: '#54b8ff',
  high: '#f0b454',
  folder: 'rgba(163,163,168,0.5)',
} as const;

export const LENS_COLOR: Record<AgentName, string> = {
  security: PALETTE.sec,
  correctness: PALETTE.cor,
  readability: PALETTE.read,
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: '#ff5d6c',
  HIGH: '#f0b454',
  MEDIUM: '#f4c430',
  LOW: '#54b8ff',
  INFO: '#6f6f76',
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

/** lucide-style icon name to render on a node badge, keyed by lens. */
export const LENS_ICON: Record<AgentName, 'shield-alert' | 'bug' | 'eye'> = {
  security: 'shield-alert',
  correctness: 'bug',
  readability: 'eye',
};

export const LENS_LABEL: Record<AgentName, string> = {
  security: 'Security',
  correctness: 'Correctness',
  readability: 'Readability',
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
