import type { Severity, AgentName, Verdict } from './types';

/** A repository as surfaced to the picker. */
export interface RepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  private: boolean;
  language: string | null;
  sizeKb: number;
  updatedAt: string;
}

/** One entry from the recursive git tree. */
export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size: number;
}

/** A single file's decoded content (for the Monaco panel). */
export interface FileResult {
  path: string;
  language: string;
  content: string;
  lineCount: number;
}

export type LensCounts = { security: number; correctness: number; readability: number };
export type FileVerdict = 'safe' | 'blocked';
export type ScanStatus = 'scanning' | 'done' | 'error';

/** Per-finding payload streamed during a scan and persisted under findings/. */
export interface ScanFinding {
  path: string;
  line: number | null;
  endLine: number | null;
  severity: Severity;
  agent: AgentName;
  message: string;
  confidence: number;
  type: string;
}

/* ── SSE payloads (one per event name) ─────────────────────────────── */

export interface ReviewPayload {
  reviewId: string;
  owner: string;
  repo: string;
  branch: string;
  total: number;
  truncated: boolean;
  public: boolean;
}
export interface NodePayload {
  path: string;
  size: number;
  lines: number;
}
export interface ProgressPayload {
  scanned: number;
  total: number;
  agent: AgentName | 'coordinator' | null;
  path: string | null;
}
export interface FileVerdictPayload {
  path: string;
  verdict: FileVerdict;
  counts: LensCounts;
}
export interface VerdictPayload {
  verdict: FileVerdict;
  totals: LensCounts;
}
export interface DonePayload {
  reviewId: string;
}
export interface ErrorPayload {
  message: string;
}

/* ── Graph model (built client-side from files + findings) ─────────── */

export interface GraphFileNode {
  id: string; // = path
  kind: 'file';
  path: string;
  label: string; // basename
  dir: string;
  lines: number;
  size: number;
  counts: LensCounts;
  worst: Severity | null;
  verdict: FileVerdict | 'pending';
}
export interface GraphFolderNode {
  id: string; // = `dir:${path}`
  kind: 'folder';
  path: string;
  label: string;
  depth: number;
}
export type GraphNodeData = GraphFileNode | GraphFolderNode;
export interface GraphLinkData {
  source: string;
  target: string;
}

/** Persisted shape of reviews/{reviewId} read by the client on revisit. */
export interface StoredReview {
  uid: string;
  owner: string;
  repo: string;
  branch: string;
  status: ScanStatus;
  totals: LensCounts;
  verdict: FileVerdict;
  truncated: boolean;
  public?: boolean;
}

/** Returned by GET /api/review/[reviewId] for unauthenticated public revisits. */
export interface PublicReviewData {
  review: StoredReview;
  files: StoredFile[];
  findings: ScanFinding[];
}

/** Persisted shape of reviews/{reviewId}/files/{id}. */
export interface StoredFile {
  path: string;
  size: number;
  lines: number;
  counts: LensCounts;
  verdict: FileVerdict;
}

export type { Severity, AgentName, Verdict };

/* ── Webhook registration (server-only) ────────────────────────────── */

/** Stored in Firestore webhooks/{owner}__{repo} — never client-readable. */
export interface WebhookRecord {
  uid: string;
  owner: string;
  repo: string;
  /** GitHub numeric hook ID — needed to delete the hook via API. */
  webhookId: number;
  /** HMAC-SHA256 secret used to verify incoming payloads. */
  secret: string;
  branch: string;
  createdAt: FirebaseFirestore.Timestamp;
}
