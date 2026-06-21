'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, FileSearch } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import GithubMark from '@/components/icons/GithubMark';
import ReviewGraph from '@/components/review/ReviewGraph';
import ReviewTopbar from '@/components/review/ReviewTopbar';
import ReviewSidePanel from '@/components/review/ReviewSidePanel';
import CodePanel from '@/components/review/CodePanel';
import { useScanStream } from '@/components/review/useScanStream';
import type { RFNode } from '@/components/review/graph-model';
import type { AgentName } from '@/lib/types';
import type { ScanFinding } from '@/lib/scan-types';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";
const ALL_AGENTS: AgentName[] = ['security', 'correctness', 'readability'];

interface Selection {
  path: string;
  focusLine: number | null;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const raw = params.reviewId;
  const reviewId = Array.isArray(raw) ? raw[0] : raw ?? '';

  const { user, loading: authLoading, signInWithGitHub, error: authError } = useAuth();
  const ready = !authLoading;
  const scan = useScanStream(reviewId, ready, !!user);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeAgents, setActiveAgents] = useState<Set<AgentName>>(new Set(ALL_AGENTS));
  const [searchQuery, setSearchQuery] = useState('');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = (): void => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = (): void => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const criticalCount = useMemo(
    () => scan.findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length,
    [scan.findings]
  );

  const toggleAgent = useCallback((a: AgentName) => {
    setActiveAgents((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }, []);

  const onSelectNode = useCallback((node: RFNode) => {
    setSelection({ path: node.path, focusLine: null });
  }, []);

  const onOpenFinding = useCallback((f: ScanFinding) => {
    setSelection({ path: f.path, focusLine: f.line });
  }, []);

  const rescan = useCallback(() => {
    if (!scan.meta) return;
    const id = crypto.randomUUID();
    sessionStorage.setItem(
      `bugtrap:scan:${id}`,
      JSON.stringify({ owner: scan.meta.owner, repo: scan.meta.repo, branch: scan.meta.branch, public: scan.publicMode })
    );
    router.push(`/review/${id}`);
  }, [scan.meta, scan.publicMode, router]);

  // ESC closes the code panel.
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  const selectedFindings = useMemo(
    () => (selection ? scan.findings.filter((f) => f.path === selection.path) : []),
    [selection, scan.findings]
  );

  if (scan.phase === 'needsauth') {
    return (
      <SignInGate
        busy={signingIn}
        error={authError}
        onSignIn={async () => {
          setSigningIn(true);
          await signInWithGitHub();
          setSigningIn(false);
        }}
      />
    );
  }

  const showGraph = !isMobile;
  const nodeCount = scan.graphData.nodes.length;
  const buildingOverlay =
    nodeCount === 0 && (scan.phase === 'loading' || scan.phase === 'connecting' || scan.phase === 'scanning');

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      <ReviewTopbar
        meta={scan.meta}
        phase={scan.phase}
        progress={scan.progress}
        verdict={scan.verdict}
        totals={scan.totals}
        criticalCount={criticalCount}
        reducedMotion={reducedMotion}
        onRescan={rescan}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {!isMobile && (
          <ReviewSidePanel
            nodes={scan.graphData.nodes}
            selectedPath={selection?.path ?? null}
            onSelectFile={(path) => setSelection({ path, focusLine: null })}
            findings={scan.findings}
            activeAgents={activeAgents}
            onToggleAgent={toggleAgent}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onOpenFinding={onOpenFinding}
            collapsed={panelCollapsed}
            onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
          />
        )}

        {/* Graph / mobile findings area */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {showGraph ? (
            <>
              <ReviewGraph
                graphData={scan.graphData}
                paintVersion={scan.paintVersion}
                hoveredId={hoveredId}
                selectedId={selection?.path ?? null}
                activeAgents={activeAgents}
                searchQuery={searchQuery}
                reducedMotion={reducedMotion}
                scanning={scan.phase === 'scanning' || scan.phase === 'connecting'}
                onHover={setHoveredId}
                onSelect={onSelectNode}
              />
              {buildingOverlay && <BuildingOverlay phase={scan.phase} />}
              {scan.phase === 'error' && <ErrorOverlay message={scan.error} onBack={() => router.push('/scan')} />}
              {scan.phase === 'notfound' && <NotFoundOverlay onBack={() => router.push('/scan')} />}
              {scan.phase === 'done' && nodeCount === 0 && <EmptyOverlay />}
            </>
          ) : (
            <MobileFindings
              findings={scan.findings}
              phase={scan.phase}
              onOpenFinding={onOpenFinding}
            />
          )}
        </div>

        {/* Slide-in IDE panel */}
        {selection && scan.meta && (
          <CodePanel
            key={selection.path}
            owner={scan.meta.owner}
            repo={scan.meta.repo}
            branch={scan.meta.branch}
            path={selection.path}
            focusLine={selection.focusLine}
            findings={selectedFindings}
            reducedMotion={reducedMotion}
            isMobile={isMobile}
            publicMode={scan.publicMode}
            onClose={() => setSelection(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ── overlays ──────────────────────────────────────────────────────── */

function OverlayShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        padding: 24,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
}

function BuildingOverlay({ phase }: { phase: string }) {
  return (
    <OverlayShell>
      <Loader2 size={28} color="var(--lime)" className="bt-spin" />
      <div style={{ fontFamily: mono, fontSize: 13, color: 'var(--tx2)', letterSpacing: '.04em' }}>
        {phase === 'connecting' ? 'Connecting to the scan…' : 'Discovering source files…'}
      </div>
    </OverlayShell>
  );
}

function ErrorOverlay({ message, onBack }: { message: string | null; onBack: () => void }) {
  return (
    <OverlayShell>
      <AlertTriangle size={28} color="var(--sec)" />
      <div style={{ fontFamily: mono, fontSize: 13, color: 'var(--tx2)', maxWidth: 420, lineHeight: 1.6 }}>
        {message ?? 'The scan failed.'}
      </div>
      <button onClick={onBack} style={{ ...overlayBtn, pointerEvents: 'auto' }}>
        Back to repositories
      </button>
    </OverlayShell>
  );
}

function NotFoundOverlay({ onBack }: { onBack: () => void }) {
  return (
    <OverlayShell>
      <FileSearch size={28} color="var(--tx3)" />
      <div style={{ fontFamily: mono, fontSize: 13, color: 'var(--tx2)', maxWidth: 420, lineHeight: 1.6 }}>
        This review doesn&apos;t exist or has been removed.
      </div>
      <button onClick={onBack} style={{ ...overlayBtn, pointerEvents: 'auto' }}>
        Back to repositories
      </button>
    </OverlayShell>
  );
}

function EmptyOverlay() {
  return (
    <OverlayShell>
      <FileSearch size={28} color="var(--tx3)" />
      <div style={{ fontFamily: mono, fontSize: 13, color: 'var(--tx2)', maxWidth: 420, lineHeight: 1.6 }}>
        No reviewable source files were found in this repository.
      </div>
    </OverlayShell>
  );
}

function MobileFindings({
  findings,
  phase,
  onOpenFinding,
}: {
  findings: ScanFinding[];
  phase: string;
  onOpenFinding: (f: ScanFinding) => void;
}) {
  return (
    <div className="bt-scroll" style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: 16 }}>
      <div
        style={{
          fontFamily: mono,
          fontSize: 11,
          color: 'var(--tx3)',
          letterSpacing: '.08em',
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        The interactive graph is desktop-first. Here&apos;s the readable findings list for this scan.
      </div>
      {phase === 'scanning' && findings.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--tx2)', fontFamily: mono, fontSize: 13 }}>
          <Loader2 size={15} className="bt-spin" color="var(--lime)" /> Scanning…
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {findings.map((f, i) => (
          <button
            key={`${f.path}:${i}`}
            onClick={() => onOpenFinding(f)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--surf)',
              border: '1px solid var(--line)',
              color: 'var(--tx)',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--tx2)', marginBottom: 4 }}>
              {f.path}
              {f.line != null ? `:${f.line}` : ''}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{f.message}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SignInGate({ busy, error, onSignIn }: { busy: boolean; error: string | null; onSignIn: () => void }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>Sign in to view this review</h1>
      <p style={{ color: 'var(--tx2)', fontSize: 16, maxWidth: 420, margin: 0, lineHeight: 1.55 }}>
        Reviews are private to the GitHub account that ran them.
      </p>
      <button
        onClick={onSignIn}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--lime)',
          color: '#15150f',
          border: 'none',
          borderRadius: 11,
          padding: '14px 24px',
          fontSize: 15,
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <GithubMark size={18} />
        {busy ? 'Connecting…' : 'Sign in with GitHub'}
      </button>
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
            maxWidth: 460,
            padding: '11px 14px',
            borderRadius: 10,
            background: 'rgba(255,93,108,.08)',
            border: '1px solid rgba(255,93,108,.3)',
            color: '#ff8a95',
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: 'left',
          }}
        >
          <AlertTriangle size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

const overlayBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  background: 'rgba(255,255,255,.04)',
  border: '1px solid var(--line2)',
  color: 'var(--tx)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
