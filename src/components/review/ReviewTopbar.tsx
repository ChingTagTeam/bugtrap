'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, GitBranch, RefreshCw, ShieldAlert, Check, Loader2 } from 'lucide-react';
import type { ScanPhase, ScanMeta } from './useScanStream';
import type { ProgressPayload, LensCounts, FileVerdict } from '@/lib/scan-types';
import { LENS_COLOR } from './graph-model';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

const AGENT_TEXT: Record<string, string> = {
  security: 'Security agent analyzing',
  correctness: 'Bug agent analyzing',
  readability: 'Bug agent analyzing',
  coordinator: 'Reconciling findings',
};

export default function ReviewTopbar({
  meta,
  phase,
  progress,
  verdict,
  totals,
  criticalCount,
  reducedMotion,
  onRescan,
}: {
  meta: ScanMeta | null;
  phase: ScanPhase;
  progress: ProgressPayload | null;
  verdict: FileVerdict | null;
  totals: LensCounts;
  criticalCount: number;
  reducedMotion: boolean;
  onRescan: () => void;
}) {
  const scanning = phase === 'connecting' || phase === 'scanning';

  return (
    <header
      style={{
        position: 'relative',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 18px',
        background: 'rgba(30,30,30,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <Link
        href="/scan"
        aria-label="Back to repositories"
        title="Back to repositories"
        style={{
          display: 'inline-flex',
          width: 34,
          height: 34,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 9,
          background: 'rgba(255,255,255,.04)',
          border: '1px solid var(--line2)',
          color: 'var(--tx2)',
          flex: 'none',
        }}
      >
        <ArrowLeft size={16} />
      </Link>

      <Link href="/" aria-label="Sidecode home" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none', textDecoration: 'none', color: 'var(--tx)' }}>
        <Image src="/Sidecode-logo.png" alt="Sidecode" width={22} height={22} style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span className="bt-nav-name" style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.025em' }}>Sidecode</span>
      </Link>

      <span style={{ width: 1, height: 20, background: 'var(--line)', flex: 'none' }} />

      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta ? `${meta.owner}/${meta.repo}` : 'Loading…'}
        </span>
        {meta && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              flex: 'none',
              fontFamily: mono,
              fontSize: 11.5,
              color: 'var(--tx3)',
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--line)',
            }}
          >
            <GitBranch size={11} /> {meta.branch}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        {scanning ? (
          <LiveReadout progress={progress} reducedMotion={reducedMotion} />
        ) : phase === 'done' && verdict ? (
          <VerdictGate verdict={verdict} totals={totals} criticalCount={criticalCount} />
        ) : null}
      </div>

      <button
        onClick={onRescan}
        disabled={scanning}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          flex: 'none',
          padding: '8px 14px',
          borderRadius: 9,
          background: 'rgba(255,255,255,.04)',
          border: '1px solid var(--line2)',
          color: scanning ? 'var(--tx3)' : 'var(--tx)',
          fontSize: 13,
          fontWeight: 600,
          cursor: scanning ? 'not-allowed' : 'pointer',
        }}
      >
        <RefreshCw size={14} /> Rescan
      </button>
    </header>
  );
}

function LiveReadout({ progress, reducedMotion }: { progress: ProgressPayload | null; reducedMotion: boolean }) {
  const scanned = progress?.scanned ?? 0;
  const total = progress?.total ?? 0;
  const agent = progress?.agent ?? null;
  const text = agent ? AGENT_TEXT[agent] ?? 'Analyzing' : 'Discovering files';
  const file = progress?.path ? progress.path.slice(progress.path.lastIndexOf('/') + 1) : null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '7px 16px',
        borderRadius: 999,
        background: 'rgba(92,138,240,.08)',
        border: '1px solid rgba(92,138,240,.3)',
        fontFamily: mono,
        fontSize: 12.5,
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <Loader2 size={14} color="var(--lime)" className={reducedMotion ? undefined : 'bt-spin'} />
      <span style={{ color: 'var(--lime)', fontWeight: 700 }}>
        Scanning {scanned} / {total || '…'}
      </span>
      <span style={{ color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        · {text}
        {file ? ` ${file}` : ''}
        <span className={reducedMotion ? undefined : 'bt-dots'}>…</span>
      </span>
    </div>
  );
}

function VerdictGate({
  verdict,
  totals,
  criticalCount,
}: {
  verdict: FileVerdict;
  totals: LensCounts;
  criticalCount: number;
}) {
  const blocked = verdict === 'blocked';
  // Verdict scale: safe → green, blocked → security red.
  const color = blocked ? 'var(--sec)' : 'var(--safe)';
  const bugTotal = totals.correctness + totals.readability;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '7px 8px 7px 16px',
        borderRadius: 999,
        background: blocked ? 'rgba(242,109,120,.1)' : 'rgba(78,201,168,.1)',
        border: `1px solid ${blocked ? 'rgba(242,109,120,.4)' : 'rgba(78,201,168,.4)'}`,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color, fontWeight: 800, fontSize: 13.5, letterSpacing: '.01em' }}>
        {blocked ? <ShieldAlert size={15} /> : <Check size={15} strokeWidth={3} />}
        {blocked ? `Blocked — ${criticalCount} critical` : 'Safe to merge'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid var(--line2)' }}>
        <LensDot color={LENS_COLOR.security} n={totals.security} />
        <LensDot color={LENS_COLOR.correctness} n={bugTotal} />
      </span>
    </div>
  );
}

function LensDot({ color, n }: { color: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: mono, fontSize: 12, color: 'var(--tx2)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {n}
    </span>
  );
}
