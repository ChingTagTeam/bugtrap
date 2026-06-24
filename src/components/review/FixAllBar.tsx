'use client';

import { useMemo, useState } from 'react';
import { Wand2, Loader2, GitPullRequest, Check, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { scanFetch } from '@/lib/api-client';
import { inferLanguage } from '@/lib/scan-filter';
import { defineBrandTheme, BRAND_THEME } from './brandMonacoTheme';
import type { ScanFinding, FileResult } from '@/lib/scan-types';
import type { PatchOutput } from '@/lib/types';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

type Phase = 'idle' | 'generating' | 'review' | 'opening' | 'done' | 'error';

/** One file's proposed edit: original content + the agent's fixed version. */
interface FileEdit {
  path: string;
  original: string;
  fixed: string;
  description: string;
}

/**
 * Repo-wide "fix all": generates a patch for every file with findings, then
 * shows a review modal with each file's before/after diff. The user confirms,
 * and all edits are committed into one PR off the scanned branch. Only rendered
 * for signed-in scans — opening a PR needs write access.
 */
export default function FixAllBar({
  owner,
  repo,
  branch,
  findings,
}: {
  owner: string;
  repo: string;
  branch: string;
  findings: ScanFinding[];
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [edits, setEdits] = useState<FileEdit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filePaths = useMemo(() => {
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const f of findings) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        paths.push(f.path);
      }
    }
    return paths;
  }, [findings]);

  if (filePaths.length === 0) return null;

  // Fetch the original file + generate its fix; returns null if either fails.
  async function buildEdit(path: string): Promise<FileEdit | null> {
    const fileFindings = findings.filter((f) => f.path === path);
    const qs = new URLSearchParams({ owner, repo, ref: branch, path });
    const [origRes, patchRes] = await Promise.all([
      scanFetch(false, `/api/github/file?${qs.toString()}`),
      scanFetch(false, '/api/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, branch, path, findings: fileFindings }),
      }),
    ]);
    if (!origRes.ok || !patchRes.ok) return null;
    const orig: FileResult = await origRes.json();
    const patch: PatchOutput = await patchRes.json();
    if (!patch.fixedCode || patch.fixedCode === orig.content) return null;
    return { path, original: orig.content, fixed: patch.fixedCode, description: patch.description };
  }

  async function generate(): Promise<void> {
    setError(null);
    setPrUrl(null);
    setEdits([]);
    setActiveIdx(0);
    setPhase('generating');
    setProgress({ done: 0, total: filePaths.length });

    try {
      const results: FileEdit[] = [];
      const queue = [...filePaths];
      const CONCURRENCY = 3;
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next === undefined) break;
          const edit = await buildEdit(next);
          if (edit) results.push(edit);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      });
      await Promise.all(workers);

      if (results.length === 0) {
        throw new Error('No fixes could be generated for the flagged files.');
      }
      results.sort((a, b) => a.path.localeCompare(b.path));
      setEdits(results);
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix-all failed.');
      setPhase('error');
    }
  }

  async function push(): Promise<void> {
    setError(null);
    setPhase('opening');
    try {
      const res = await scanFetch(false, '/api/open-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          description: `Automated fixes for ${edits.length} file${edits.length !== 1 ? 's' : ''} flagged during the Sidecode scan.`,
          files: edits.map((e) => ({ path: e.path, content: e.fixed })),
        }),
      });
      const data: { prUrl?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.prUrl) throw new Error(data.error ?? 'Could not open the pull request.');
      setPrUrl(data.prUrl);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the pull request.');
      setPhase('error');
    }
  }

  const generating = phase === 'generating';
  const triggerLabel = generating
    ? `Generating fixes ${progress.done}/${progress.total}…`
    : `Fix all ${filePaths.length} file${filePaths.length !== 1 ? 's' : ''} & open PR`;

  // The modal stays up through review → push → done, and also on a push
  // failure (phase 'error' while edits exist) so the user can see why and
  // retry. A generate failure has no edits yet, so it falls through to the
  // inline trigger error instead.
  const modalOpen =
    phase === 'review' || phase === 'opening' || phase === 'done' || (phase === 'error' && edits.length > 0);
  const active = edits[activeIdx];

  return (
    <>
      {/* Floating trigger / inline error (hidden while the modal is up) */}
      {!modalOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 'calc(100% - 32px)',
          }}
        >
          <button
            onClick={() => void generate()}
            disabled={generating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              padding: '11px 18px',
              borderRadius: 12,
              background: generating ? 'rgba(255,255,255,.06)' : 'var(--in)',
              border: '1px solid var(--in)',
              color: generating ? 'var(--tx2)' : '#0e1626',
              fontSize: 13.5,
              fontWeight: 700,
              cursor: generating ? 'wait' : 'pointer',
              boxShadow: generating ? 'none' : '0 8px 28px rgba(92,138,240,.34)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            {generating ? <Loader2 size={15} className="bt-spin" /> : phase === 'error' ? <Wand2 size={15} /> : <GitPullRequest size={15} />}
            {triggerLabel}
          </button>

          {phase === 'error' && error && (
            <span
              role="alert"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 13px',
                borderRadius: 10,
                background: 'rgba(242,109,120,.1)',
                border: '1px solid rgba(242,109,120,.32)',
                color: '#f58b94',
                fontFamily: mono,
                fontSize: 11.5,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <AlertTriangle size={13} /> {error}
            </span>
          )}
        </div>
      )}

      {/* Review modal: every proposed edit as a before/after diff */}
      {modalOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(0,0,0,.5)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 'min(1040px, 100%)',
              height: '100%',
              maxHeight: '100%',
              borderRadius: 14,
              background: 'var(--bg)',
              border: '1px solid var(--line2)',
              boxShadow: '0 30px 80px -20px rgba(0,0,0,.7)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg2)' }}>
              <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--tx)' }}>
                {phase === 'done' ? 'Fixes pushed' : 'Review fixes before opening a PR'}
              </span>
              <span style={{ fontFamily: mono, fontSize: 11.5, color: 'var(--tx3)' }}>
                {edits.length} file{edits.length !== 1 ? 's' : ''} · {owner}/{repo} → {branch}
              </span>
              <button
                onClick={() => { setPhase('idle'); setEdits([]); }}
                aria-label="Close"
                title="Close"
                style={{ marginLeft: 'auto', display: 'inline-flex', padding: 7, borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid var(--line2)', color: 'var(--tx2)', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              {/* File list */}
              <div className="bt-scroll" style={{ width: 230, flex: 'none', borderRight: '1px solid var(--line)', overflowY: 'auto', background: 'var(--bg2)', padding: 8 }}>
                {edits.map((e, i) => {
                  const base = e.path.slice(e.path.lastIndexOf('/') + 1);
                  const sel = i === activeIdx;
                  return (
                    <button
                      key={e.path}
                      onClick={() => setActiveIdx(i)}
                      title={e.path}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        marginBottom: 2,
                        borderRadius: 7,
                        border: 'none',
                        background: sel ? 'rgba(92,138,240,.14)' : 'transparent',
                        color: sel ? 'var(--tx)' : 'var(--tx2)',
                        cursor: 'pointer',
                        fontFamily: mono,
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {base}
                    </button>
                  );
                })}
              </div>

              {/* Diff for the active file */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {active && (
                  <>
                    <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--line)', background: 'rgba(92,138,240,.06)', fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: 'var(--lime)', letterSpacing: '.06em' }}>{active.path} · </span>
                      {active.description}
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <DiffEditor
                        key={active.path}
                        height="100%"
                        theme={BRAND_THEME}
                        language={inferLanguage(active.path).language}
                        original={active.original}
                        modified={active.fixed}
                        beforeMount={(m) => defineBrandTheme(m)}
                        options={{
                          readOnly: true,
                          fontFamily: mono,
                          fontSize: 12.5,
                          renderSideBySide: true,
                          automaticLayout: true,
                          scrollBeyondLastLine: false,
                          minimap: { enabled: false },
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--line)', background: 'var(--bg2)' }}>
              {phase === 'done' && prUrl ? (
                <>
                  <Check size={16} color="var(--safe)" />
                  <span style={{ color: 'var(--safe)', fontSize: 13.5, fontWeight: 600 }}>
                    PR opened with {edits.length} file{edits.length !== 1 ? 's' : ''}.
                  </span>
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, background: 'var(--in)', color: '#0e1626', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                  >
                    View pull request <ExternalLink size={14} />
                  </a>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: mono, fontSize: 11.5, color: 'var(--tx3)' }}>
                    {phase === 'opening' ? 'Committing to a new branch…' : 'These edits will be committed to a new branch and opened as one PR.'}
                  </span>
                  {phase === 'error' && error && (
                    <span role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#f58b94', fontFamily: mono, fontSize: 11.5 }}>
                      <AlertTriangle size={13} /> {error}
                    </span>
                  )}
                  <button
                    onClick={() => void push()}
                    disabled={phase === 'opening'}
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '9px 18px',
                      borderRadius: 10,
                      background: phase === 'opening' ? 'rgba(255,255,255,.06)' : 'var(--in)',
                      border: 'none',
                      color: phase === 'opening' ? 'var(--tx2)' : '#0e1626',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: phase === 'opening' ? 'wait' : 'pointer',
                    }}
                  >
                    {phase === 'opening' ? <Loader2 size={14} className="bt-spin" /> : <GitPullRequest size={14} />}
                    {phase === 'opening' ? 'Opening…' : 'Push fixes & open PR'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
