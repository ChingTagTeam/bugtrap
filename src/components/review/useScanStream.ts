'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase.client';
import { scanFetch } from '@/lib/api-client';
import { parseSSEStream } from '@/lib/sse';
import {
  type RFNode,
  type RFLink,
  ROOT_ID,
  makeRootNode,
  makeFolderNode,
  makeFileNode,
  folderChain,
  moreSevere,
} from './graph-model';
import type {
  ScanFinding,
  LensCounts,
  FileVerdict,
  NodePayload,
  ProgressPayload,
  FileVerdictPayload,
  ReviewPayload,
  VerdictPayload,
  ErrorPayload,
  StoredReview,
  StoredFile,
  PublicReviewData,
} from '@/lib/scan-types';

export type ScanPhase = 'loading' | 'connecting' | 'scanning' | 'done' | 'error' | 'notfound' | 'needsauth';

export interface ScanMeta {
  owner: string;
  repo: string;
  branch: string;
  total: number;
  truncated: boolean;
}

export interface ScanState {
  phase: ScanPhase;
  graphData: { nodes: RFNode[]; links: RFLink[] };
  paintVersion: number;
  findings: ScanFinding[];
  meta: ScanMeta | null;
  progress: ProgressPayload | null;
  totals: LensCounts;
  verdict: FileVerdict | null;
  error: string | null;
  publicMode: boolean;
}

const ZERO: LensCounts = { security: 0, correctness: 0, readability: 0 };

export function useScanStream(reviewId: string, ready: boolean, userPresent: boolean): ScanState {
  const nodesById = useRef(new Map<string, RFNode>());
  const links = useRef<RFLink[]>([]);
  const linkSet = useRef(new Set<string>());
  const findingsRef = useRef<ScanFinding[]>([]);
  const flushScheduled = useRef(false);
  // Scan params are read from sessionStorage exactly once and cached here so a
  // StrictMode remount (or a dep change) reuses them instead of finding the
  // key already consumed. `undefined` means "not yet read".
  const pendingRef = useRef<{ owner: string; repo: string; branch?: string; public?: boolean } | null | undefined>(
    undefined
  );

  const [graphData, setGraphData] = useState<{ nodes: RFNode[]; links: RFLink[] }>({ nodes: [], links: [] });
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [paint, setPaint] = useState(0);
  const [phase, setPhase] = useState<ScanPhase>('loading');
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [totals, setTotals] = useState<LensCounts>(ZERO);
  const [verdict, setVerdict] = useState<FileVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publicMode, setPublicMode] = useState(false);

  useEffect(() => {
    if (!ready) return;

    const publishGraph = (): void => {
      setGraphData({ nodes: Array.from(nodesById.current.values()), links: links.current.slice() });
    };

    const scheduleFlush = (): void => {
      if (flushScheduled.current) return;
      flushScheduled.current = true;
      requestAnimationFrame(() => {
        flushScheduled.current = false;
        setFindings(findingsRef.current.slice());
        setPaint((p) => p + 1);
      });
    };

    const ensureRoot = (repo: string): void => {
      if (!nodesById.current.has(ROOT_ID)) nodesById.current.set(ROOT_ID, makeRootNode(repo));
    };

    const addLink = (source: string, target: string): void => {
      const key = `${source}>${target}`;
      if (linkSet.current.has(key)) return;
      linkSet.current.add(key);
      links.current.push({ source, target });
    };

    const ensureFolders = (path: string): string => {
      const chain = folderChain(path);
      let parent = ROOT_ID;
      chain.forEach((dir, i) => {
        const id = `dir:${dir}`;
        if (!nodesById.current.has(id)) nodesById.current.set(id, makeFolderNode(dir, i + 1));
        addLink(parent, id);
        parent = id;
      });
      return parent;
    };

    const addFileNode = (path: string, lines: number): RFNode | null => {
      const existing = nodesById.current.get(path);
      if (existing) return existing;
      const node = makeFileNode(path, lines);
      nodesById.current.set(path, node);
      const parent = ensureFolders(path);
      addLink(parent, path);
      return node;
    };

    const bumpWorst = (node: RFNode, f: ScanFinding): void => {
      if (moreSevere(node.worstSev, node.worstAgent, f.severity, f.agent)) {
        node.worstSev = f.severity;
        node.worstAgent = f.agent;
      }
    };

    // Build the graph from persisted data (authed revisit/live snapshot or
    // public revisit). Idempotent: clears accumulators first, so a live
    // onSnapshot can re-run it on every update (e.g. a push-triggered rescan)
    // and rebuild the whole graph from the latest Firestore state.
    const buildFromStored = (review: StoredReview, files: StoredFile[], stored: ScanFinding[]): void => {
      nodesById.current.clear();
      links.current = [];
      linkSet.current.clear();
      findingsRef.current = [];

      ensureRoot(review.repo);
      for (const f of files) {
        const node = addFileNode(f.path, f.lines);
        if (node) {
          node.counts = f.counts;
          node.verdict = f.verdict;
        }
      }
      for (const f of stored) {
        findingsRef.current.push(f);
        const node = nodesById.current.get(f.path);
        if (node) bumpWorst(node, f);
      }
      setMeta({ owner: review.owner, repo: review.repo, branch: review.branch, total: files.length, truncated: review.truncated });
      setTotals(review.totals);
      setVerdict(review.verdict);
      setProgress({ scanned: files.length, total: files.length, agent: null, path: null });
      publishGraph();
      setFindings(findingsRef.current.slice());
      setPaint((p) => p + 1);
      // Reflect the stored status so a push-triggered rescan (status flips back
      // to 'scanning') shows the scanning state live, then settles on 'done'.
      setPhase(review.status === 'scanning' ? 'scanning' : review.status === 'error' ? 'error' : 'done');
    };

    /* ── Fresh scan over SSE ─────────────────────────────────────── */
    const runLiveScan = async (
      params: { owner: string; repo: string; branch: string },
      pub: boolean,
      signal: AbortSignal
    ): Promise<void> => {
      setPublicMode(pub);
      setPhase('connecting');
      try {
        const res = await scanFetch(pub, '/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewId, ...params }),
          signal,
        });
        if (!res.ok || !res.body) {
          const body: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Scan failed (${res.status})`);
        }
        setPhase('scanning');

        await parseSSEStream(res.body, (event, data) => {
          switch (event) {
            case 'review': {
              const p = data as ReviewPayload;
              ensureRoot(p.repo);
              setMeta({ owner: p.owner, repo: p.repo, branch: p.branch, total: p.total, truncated: p.truncated });
              publishGraph();
              break;
            }
            case 'node': {
              const p = data as NodePayload;
              addFileNode(p.path, p.lines);
              publishGraph();
              break;
            }
            case 'finding': {
              const f = data as ScanFinding;
              const node = nodesById.current.get(f.path);
              if (node) {
                node.counts[f.agent] += 1;
                node.findingCount += 1;
                node.lastFindingAt = Date.now();
                bumpWorst(node, f);
              }
              findingsRef.current.push(f);
              scheduleFlush();
              break;
            }
            case 'progress': {
              setProgress(data as ProgressPayload);
              break;
            }
            case 'fileVerdict': {
              const p = data as FileVerdictPayload;
              const node = nodesById.current.get(p.path);
              if (node) {
                node.counts = p.counts;
                node.verdict = p.verdict;
              }
              scheduleFlush();
              break;
            }
            case 'verdict': {
              const p = data as VerdictPayload;
              setTotals(p.totals);
              setVerdict(p.verdict);
              break;
            }
            case 'done': {
              setPhase('done');
              break;
            }
            case 'error': {
              setError((data as ErrorPayload).message);
              setPhase('error');
              break;
            }
          }
        });

        setPhase((prev) => (prev === 'scanning' || prev === 'connecting' ? 'done' : prev));
      } catch (e) {
        if (signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Scan failed');
        setPhase('error');
      }
    };

    /* ── Authed revisit — LIVE (client Firestore, owner-scoped by rules) ──
     * Three listeners (review doc + files + findings) fire independently. We
     * cache the latest of each and rebuild the graph whenever any changes, once
     * the review doc exists. This is what makes a push-triggered rescan stream
     * into an already-open review without a reload. Returns an unsubscribe fn. */
    const subscribePersisted = (): (() => void) => {
      const db = getClientDb();
      const reviewRef = doc(db, 'reviews', reviewId);
      let latestReview: StoredReview | null = null;
      let latestFiles: StoredFile[] = [];
      let latestFindings: ScanFinding[] = [];
      let reviewLoaded = false;

      const rebuild = (): void => {
        if (!latestReview) return;
        setPublicMode(Boolean(latestReview.public));
        buildFromStored(latestReview, latestFiles, latestFindings);
      };

      const onErr = (e: unknown): void => {
        setError(e instanceof Error ? e.message : 'Could not load this review');
        setPhase('error');
      };

      const unsubReview = onSnapshot(
        reviewRef,
        (snap) => {
          if (!snap.exists()) {
            setPhase('notfound');
            return;
          }
          latestReview = snap.data() as StoredReview;
          reviewLoaded = true;
          rebuild();
        },
        onErr
      );
      const unsubFiles = onSnapshot(
        collection(db, 'reviews', reviewId, 'files'),
        (snap) => {
          latestFiles = snap.docs.map((d) => d.data() as StoredFile);
          if (reviewLoaded) rebuild();
        },
        onErr
      );
      const unsubFindings = onSnapshot(
        collection(db, 'reviews', reviewId, 'findings'),
        (snap) => {
          latestFindings = snap.docs.map((d) => d.data() as ScanFinding);
          if (reviewLoaded) rebuild();
        },
        onErr
      );

      return () => {
        unsubReview();
        unsubFiles();
        unsubFindings();
      };
    };

    /* ── Public revisit (server endpoint, public reviews only) ───── */
    const loadPublic = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/review/${reviewId}`);
        if (res.status === 403) {
          setPhase('needsauth');
          return;
        }
        if (res.status === 404) {
          setPhase('notfound');
          return;
        }
        if (!res.ok) throw new Error(`Could not load review (${res.status})`);
        const data: PublicReviewData = await res.json();
        setPublicMode(true);
        buildFromStored(data.review, data.files, data.findings);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this review');
        setPhase('error');
      }
    };

    // Read the one-shot scan params once, then cache them. A StrictMode
    // remount aborts the first run's fetch and re-runs this effect; without the
    // cache the sessionStorage key would already be gone and the re-run would
    // fall through to a revisit lookup, leaving a fresh scan stuck connecting.
    if (pendingRef.current === undefined) {
      const key = `bugtrap:scan:${reviewId}`;
      const stored = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (stored) {
        try {
          pendingRef.current = JSON.parse(stored) as { owner: string; repo: string; branch?: string; public?: boolean };
        } catch {
          pendingRef.current = null;
        }
      } else {
        pendingRef.current = null;
      }
    }

    const controller = new AbortController();
    let unsubscribe: (() => void) | null = null;
    const pending = pendingRef.current;
    if (pending) {
      const pub = Boolean(pending.public);
      // After the one-shot SSE scan finishes, a watched review (signed-in,
      // own repo) hands off to the live Firestore subscription so a later
      // push-triggered rescan streams into this same open tab without a
      // reload. Without this the scan tab goes inert once SSE closes and only
      // a manual revisit picks up pushes. Public scans stay one-shot.
      void runLiveScan(
        { owner: pending.owner, repo: pending.repo, branch: pending.branch ?? '' },
        pub,
        controller.signal
      ).then(() => {
        if (controller.signal.aborted || pub || !userPresent) return;
        const unsub = subscribePersisted();
        // The effect's cleanup may have already run (unmount / dep change)
        // before this late hand-off; if so, abort fired — tear down at once so
        // the listeners don't leak. Otherwise expose it for normal cleanup.
        if (controller.signal.aborted) unsub();
        else unsubscribe = unsub;
      });
    } else if (userPresent) {
      unsubscribe = subscribePersisted();
    } else {
      void loadPublic();
    }

    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [ready, reviewId, userPresent]);

  return {
    phase,
    graphData,
    paintVersion: paint,
    findings,
    meta,
    progress,
    totals,
    verdict,
    error,
    publicMode,
  };
}
