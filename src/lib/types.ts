export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AgentName = 'security' | 'correctness' | 'readability';

/**
 * Controls which severity levels agents emit.
 * 'high_and_above' = only CRITICAL + HIGH (default — ignores nitpicks).
 * 'all' = include MEDIUM and LOW as well (toggle in UI).
 */
export type Sensitivity = 'high_and_above' | 'all';
export type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

export interface Finding {
  line: number | null;
  severity: Severity;
  confidence: number;
  type: string;
  message: string;
}

export interface RankedFinding extends Finding {
  agent: AgentName;
}

export interface AgentReport {
  agent: AgentName;
  findings: Finding[];
  degraded?: boolean;
}

export interface Disagreement {
  line: number | null;
  type: string;
  agents: AgentName[];
  severities: Partial<Record<AgentName, string>>;
  coordinatorRuling: string;
  reason: string;
}

export interface PatchOutput {
  description: string;
  fixedCode: string;
}

export interface Verdict {
  safe: boolean;
  blockedOn: number;
  summary: string;
  rankedFindings: RankedFinding[];
  disagreements: Disagreement[];
}

export interface PRContext {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  files: string[];
}

export type SSEEvent =
  | { type: 'agent_start'; agent: AgentName }
  | { type: 'agent_complete'; agent: AgentName; findings: Finding[] }
  | { type: 'agent_error'; agent: AgentName; message: string }
  | { type: 'coordinator_start' }
  | { type: 'verdict'; verdict: Verdict }
  | { type: 'patch_start' }
  | { type: 'patch_complete'; patch: PatchOutput }
  | { type: 'github_comments'; count: number }
  | { type: 'github_status'; state: 'success' | 'failure' }
  | { type: 'github_fix_pr'; prUrl: string }
  | { type: 'saved'; reviewId: string }
  | { type: 'error'; message: string };
