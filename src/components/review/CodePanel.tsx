'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor, DiffEditor, type Monaco, type OnMount } from '@monaco-editor/react';
import { X, ExternalLink, Loader2, Wand2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { scanFetch } from '@/lib/api-client';
import { inferLanguage } from '@/lib/scan-filter';
import { LENS_COLOR, LENS_LABEL, SEVERITY_COLOR } from './graph-model';
import { defineBrandTheme, BRAND_THEME } from './brandMonacoTheme';
import type { FileResult, ScanFinding } from '@/lib/scan-types';
import type { PatchOutput as Patch } from '@/lib/types';

type CodeEditor = Parameters<OnMount>[0];

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

function hoverMarkdown(f: ScanFinding): string {
  return [
    `**[${f.severity}] ${f.type}** · ${Math.round(f.confidence * 100)}% confidence`,
    '',
    f.message,
    '',
    `_Sidecode ${LENS_LABEL[f.agent]} agent_`,
  ].join('\n');
}

export default function CodePanel({
  owner,
  repo,
  branch,
  path,
  focusLine,
  findings,
  reducedMotion,
  isMobile,
  publicMode,
  onClose,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  focusLine: number | null;
  findings: ScanFinding[];
  reducedMotion: boolean;
  isMobile: boolean;
  publicMode: boolean;
  onClose: () => void;
}) {
  const [file, setFile] = useState<FileResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const [patch, setPatch] = useState<Patch | null>(null);
  const [patchStatus, setPatchStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [showDiff, setShowDiff] = useState(false);

  const editorRef = useRef<CodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decoRef = useRef<ReturnType<CodeEditor['createDecorationsCollection']> | null>(null);

  // Fetch file content.
  useEffect(() => {
    // This panel is keyed by path (it remounts per file), so initial state
    // already represents the loading/idle reset — no synchronous reset needed.
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ owner, repo, ref: branch, path });
        const res = await scanFetch(publicMode, `/api/github/file?${qs.toString()}`);
        if (!res.ok) {
          const b: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(b.error ?? `Could not load file (${res.status})`);
        }
        const data: FileResult = await res.json();
        if (!cancelled) {
          setFile(data);
          setStatus('ready');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load file');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, path, publicMode]);

  const applyDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    decoRef.current?.clear();
    const decos: Parameters<CodeEditor['createDecorationsCollection']>[0] = [];
    for (const f of findings) {
      if (f.line == null) continue;
      const line = f.line;
      const endLine = f.endLine ?? line;
      const color = LENS_COLOR[f.agent];
      decos.push({
        range: new monaco.Range(line, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: `bt-dec-${f.severity}`,
          glyphMarginClassName: `bt-glyph bt-glyph-${f.agent}`,
          glyphMarginHoverMessage: { value: hoverMarkdown(f) },
          hoverMessage: { value: hoverMarkdown(f) },
          overviewRuler: { color, position: monaco.editor.OverviewRulerLane.Right },
          minimap: { color, position: monaco.editor.MinimapPosition.Inline },
        },
      });
    }
    decoRef.current = editor.createDecorationsCollection(decos);
  }, [findings]);

  const revealLine = useCallback((line: number | null) => {
    const editor = editorRef.current;
    if (!editor || !line) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }, []);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyDecorations();
    if (focusLine) revealLine(focusLine);
  };

  // Re-decorate when findings change after mount.
  useEffect(() => {
    if (status === 'ready') applyDecorations();
  }, [status, applyDecorations]);

  // Reveal a newly-focused line (e.g. another finding clicked while open).
  useEffect(() => {
    if (status === 'ready' && !showDiff) revealLine(focusLine);
  }, [focusLine, status, showDiff, revealLine]);

  async function suggestFix(): Promise<void> {
    setPatchStatus('loading');
    try {
      const res = await scanFetch(publicMode, '/api/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, branch, path, findings }),
      });
      if (!res.ok) {
        const b: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(b.error ?? 'Fix generation failed');
      }
      const data: Patch = await res.json();
      setPatch(data);
      setPatchStatus('ready');
      setShowDiff(true);
    } catch {
      setPatchStatus('error');
    }
  }

  const language = file?.language ?? inferLanguage(path).language;
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const base = path.slice(path.lastIndexOf('/') + 1);
  const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${path}${focusLine ? `#L${focusLine}` : ''}`;

  const panelStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 60, width: '100%' }
    : { position: 'relative', width: 'min(760px, 56vw)', flex: 'none' };

  return (
    <section
      style={{
        ...panelStyle,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        borderLeft: '1px solid var(--line2)',
        boxShadow: '-30px 0 60px -30px rgba(0,0,0,.6)',
        animation: reducedMotion ? undefined : 'bt-panel-in .28s ease',
        minWidth: 0,
      }}
      aria-label={`Code for ${base}`}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 12px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg2)',
        }}
      >
        <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {dir && (
            <span style={{ fontFamily: mono, fontSize: 11.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dir}/
            </span>
          )}
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', flex: 'none' }}>{base}</span>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: 'var(--tx3)', flex: 'none' }}>
            {inferLanguage(path).label}
          </span>
        </div>

        {findings.length > 0 && !showDiff && (
          <button onClick={() => void suggestFix()} disabled={patchStatus === 'loading'} style={headerBtn} title="Generate a suggested fix">
            {patchStatus === 'loading' ? <Loader2 size={14} className="bt-spin" /> : <Wand2 size={14} />}
            <span className="bt-nav-name">{patchStatus === 'loading' ? 'Fixing…' : 'Suggest fix'}</span>
          </button>
        )}
        {showDiff && (
          <button onClick={() => setShowDiff(false)} style={headerBtn} title="Back to source">
            <ArrowLeft size={14} />
            <span className="bt-nav-name">Source</span>
          </button>
        )}
        <a href={githubUrl} target="_blank" rel="noreferrer" style={{ ...headerBtn, textDecoration: 'none' }} title="Open on GitHub">
          <ExternalLink size={14} />
          <span className="bt-nav-name">GitHub</span>
        </a>
        <button onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)" style={{ ...headerBtn, padding: '7px 8px' }}>
          <X size={15} />
        </button>
      </div>

      {/* Findings strip */}
      {findings.length > 0 && (
        <div className="bt-scroll" style={{ display: 'flex', gap: 7, padding: '8px 12px', borderBottom: '1px solid var(--line)', overflowX: 'auto', background: 'var(--bg2)' }}>
          {findings.map((f, i) => (
            <button
              key={`${f.line}:${i}`}
              onClick={() => {
                setShowDiff(false);
                revealLine(f.line);
              }}
              title={f.message}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                flex: 'none',
                padding: '5px 10px',
                borderRadius: 8,
                background: 'var(--surf)',
                border: `1px solid ${SEVERITY_COLOR[f.severity] ?? 'var(--line2)'}55`,
                color: 'var(--tx2)',
                fontFamily: mono,
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: LENS_COLOR[f.agent] }} />
              {f.line != null ? `L${f.line}` : 'file'}
              <span style={{ color: 'var(--tx3)' }}>{f.severity}</span>
            </button>
          ))}
        </div>
      )}

      {/* Patch description */}
      {showDiff && patch && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'rgba(92,138,240,.06)', fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5 }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: 'var(--lime)', letterSpacing: '.08em' }}>SUGGESTED FIX · </span>
          {patch.description}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {status === 'loading' && (
          <CenterMsg>
            <Loader2 size={22} className="bt-spin" color="var(--lime)" /> Loading {base}…
          </CenterMsg>
        )}
        {status === 'error' && (
          <CenterMsg>
            <AlertTriangle size={22} color="var(--sec)" /> {error}
          </CenterMsg>
        )}
        {status === 'ready' && file && !showDiff && (
          <Editor
            height="100%"
            theme={BRAND_THEME}
            language={language}
            value={file.content}
            beforeMount={(m) => defineBrandTheme(m)}
            onMount={onMount}
            loading={<CenterMsg><Loader2 size={22} className="bt-spin" color="var(--lime)" /> Loading editor…</CenterMsg>}
            options={{
              readOnly: true,
              glyphMargin: true,
              fontFamily: mono,
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: true, renderCharacters: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: 'all',
              smoothScrolling: !reducedMotion,
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            }}
          />
        )}
        {status === 'ready' && file && showDiff && patch && (
          <DiffEditor
            height="100%"
            theme={BRAND_THEME}
            language={language}
            original={file.content}
            modified={patch.fixedCode}
            beforeMount={(m) => defineBrandTheme(m)}
            loading={<CenterMsg><Loader2 size={22} className="bt-spin" color="var(--lime)" /> Loading diff…</CenterMsg>}
            options={{
              readOnly: true,
              fontFamily: mono,
              fontSize: 13,
              renderSideBySide: !isMobile,
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        )}
        {patchStatus === 'error' && !showDiff && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(242,109,120,.1)', border: '1px solid rgba(242,109,120,.3)', color: '#f58b94', fontFamily: mono, fontSize: 12 }}>
            Couldn&apos;t generate a fix. Try again.
          </div>
        )}
      </div>
    </section>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: 'var(--tx2)',
        fontFamily: mono,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flex: 'none',
  padding: '7px 11px',
  borderRadius: 8,
  background: 'rgba(255,255,255,.04)',
  border: '1px solid var(--line2)',
  color: 'var(--tx2)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
};
