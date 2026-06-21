'use client';

import { useMemo, useState } from 'react';
import { ShieldAlert, Bug, Eye, Search, PanelLeftClose, PanelLeftOpen, FolderTree, ListTree } from 'lucide-react';
import type { AgentName } from '@/lib/types';
import type { ScanFinding, LensCounts } from '@/lib/scan-types';
import { LENS_COLOR, LENS_LABEL, SEVERITY_COLOR, severityRank, type RFNode } from './graph-model';
import FileTree from './FileTree';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

const LENS_ICONS: Record<AgentName, typeof ShieldAlert> = {
  security: ShieldAlert,
  correctness: Bug,
  readability: Eye,
};

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

type Tab = 'files' | 'findings';

export default function ReviewSidePanel({
  nodes,
  selectedPath,
  onSelectFile,
  findings,
  activeAgents,
  onToggleAgent,
  searchQuery,
  onSearch,
  onOpenFinding,
  collapsed,
  onToggleCollapsed,
}: {
  nodes: RFNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  findings: ScanFinding[];
  activeAgents: Set<AgentName>;
  onToggleAgent: (a: AgentName) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onOpenFinding: (f: ScanFinding) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [tab, setTab] = useState<Tab>('files');

  const fileCount = useMemo(() => nodes.filter((n) => n.kind === 'file').length, [nodes]);

  const lensCounts: LensCounts = useMemo(() => {
    const c = { security: 0, correctness: 0, readability: 0 };
    for (const f of findings) c[f.agent] += 1;
    return c;
  }, [findings]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return findings
      .filter((f) => activeAgents.has(f.agent))
      .filter((f) => (q ? f.path.toLowerCase().includes(q) || f.message.toLowerCase().includes(q) : true))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.confidence - a.confidence);
  }, [findings, activeAgents, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, ScanFinding[]>();
    for (const f of visible) {
      const key = SEVERITY_ORDER.includes(f.severity as (typeof SEVERITY_ORDER)[number]) ? f.severity : 'INFO';
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return map;
  }, [visible]);

  if (collapsed) {
    return (
      <div
        style={{
          width: 48,
          flex: 'none',
          borderRight: '1px solid var(--line)',
          background: 'rgba(37,37,41,.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 14,
          gap: 14,
        }}
      >
        <button onClick={onToggleCollapsed} aria-label="Expand panel" title="Expand" style={iconBtnStyle}>
          <PanelLeftOpen size={16} />
        </button>
        <span
          style={{
            writingMode: 'vertical-rl',
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: '.12em',
            color: 'var(--tx3)',
            textTransform: 'uppercase',
          }}
        >
          {fileCount} files · {findings.length} findings
        </span>
      </div>
    );
  }

  return (
    <aside
      className="bt-scroll"
      style={{
        width: 332,
        flex: 'none',
        borderRight: '1px solid var(--line)',
        background: 'rgba(37,37,41,.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 12px 0', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <TabBtn active={tab === 'files'} onClick={() => setTab('files')} icon={<FolderTree size={14} />} label="Files" count={fileCount} />
          <TabBtn active={tab === 'findings'} onClick={() => setTab('findings')} icon={<ListTree size={14} />} label="Findings" count={findings.length} />
          <button
            onClick={onToggleCollapsed}
            aria-label="Collapse panel"
            title="Collapse"
            style={{ ...iconBtnStyle, marginLeft: 'auto' }}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {tab === 'findings' && (
          <div style={{ paddingBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(['security', 'correctness', 'readability'] as AgentName[]).map((a) => {
                const Icon = LENS_ICONS[a];
                const active = activeAgents.has(a);
                const color = LENS_COLOR[a];
                return (
                  <button
                    key={a}
                    onClick={() => onToggleAgent(a)}
                    aria-pressed={active}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 11px',
                      borderRadius: 9,
                      border: `1px solid ${active ? color : 'var(--line2)'}`,
                      background: active ? `${color}1f` : 'transparent',
                      color: active ? 'var(--tx)' : 'var(--tx3)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      opacity: active ? 1 : 0.65,
                    }}
                  >
                    <span style={{ color, display: 'inline-flex' }}>
                      <Icon size={15} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{LENS_LABEL[a]}</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--tx2)' }}>{lensCounts[a]}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', marginTop: 12 }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
              <input
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Filter by file or message…"
                aria-label="Filter findings"
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 9,
                  background: 'var(--surf)',
                  border: '1px solid var(--line2)',
                  color: 'var(--tx)',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--lime)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line2)')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="bt-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'files' ? (
          <FileTree nodes={nodes} selectedPath={selectedPath} onSelect={onSelectFile} />
        ) : visible.length === 0 ? (
          <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--tx3)', fontFamily: mono, fontSize: 12.5, lineHeight: 1.6 }}>
            {findings.length === 0 ? 'No findings yet.' : 'Nothing matches the current filters.'}
          </div>
        ) : (
          <div style={{ padding: '6px 10px 18px' }}>
            {SEVERITY_ORDER.map((sev) => {
              const items = grouped.get(sev);
              if (!items || items.length === 0) return null;
              return (
                <div key={sev} style={{ marginTop: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0 6px 6px',
                      fontFamily: mono,
                      fontSize: 10.5,
                      letterSpacing: '.1em',
                      color: SEVERITY_COLOR[sev],
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: SEVERITY_COLOR[sev] }} />
                    {sev} · {items.length}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((f, i) => (
                      <FindingRow key={`${f.path}:${f.line}:${i}`} finding={f} onClick={() => onOpenFinding(f)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Legend />
    </aside>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '7px 11px',
        borderRadius: 9,
        border: `1px solid ${active ? 'var(--lime)' : 'var(--line2)'}`,
        background: active ? 'rgba(131,200,24,.14)' : 'transparent',
        color: active ? 'var(--tx)' : 'var(--tx3)',
        cursor: 'pointer',
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      <span style={{ display: 'inline-flex', color: active ? 'var(--lime)' : 'var(--tx3)' }}>{icon}</span>
      {label}
      <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--tx3)' }}>{count}</span>
    </button>
  );
}

function FindingRow({ finding, onClick }: { finding: ScanFinding; onClick: () => void }) {
  const base = finding.path.slice(finding.path.lastIndexOf('/') + 1);
  const color = LENS_COLOR[finding.agent];
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 11px',
        borderRadius: 9,
        background: 'var(--surf)',
        border: '1px solid var(--line)',
        cursor: 'pointer',
        transition: 'border-color .18s, background .18s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = 'var(--line2)';
        e.currentTarget.style.background = 'rgba(255,255,255,.04)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = 'var(--line)';
        e.currentTarget.style.background = 'var(--surf)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: 'none' }} />
        <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--tx)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {base}
        </span>
        {finding.line != null && (
          <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--tx3)', flex: 'none' }}>:{finding.line}</span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 10.5, color: 'var(--tx3)', flex: 'none' }}>
          {Math.round(finding.confidence * 100)}%
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {finding.message}
      </div>
    </button>
  );
}

function Legend() {
  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      {(['security', 'correctness', 'readability'] as AgentName[]).map((a) => (
        <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: mono, fontSize: 10.5, color: 'var(--tx3)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: LENS_COLOR[a] }} />
          {LENS_LABEL[a]}
        </span>
      ))}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  width: 30,
  height: 30,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  background: 'rgba(255,255,255,.04)',
  border: '1px solid var(--line2)',
  color: 'var(--tx2)',
  cursor: 'pointer',
};
