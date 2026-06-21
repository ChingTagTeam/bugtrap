'use client';

import { Lock, GitBranch, ArrowRight } from 'lucide-react';
import type { RepoSummary } from '@/lib/scan-types';
import { languageColor, formatRelativeTime } from '@/lib/format';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

export default function RepoCard({ repo, onSelect }: { repo: RepoSummary; onSelect: () => void }) {
  const updated = formatRelativeTime(repo.updatedAt);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="bt-repo-card"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        textAlign: 'left',
        width: '100%',
        padding: '18px 20px',
        border: '1px solid var(--line)',
        borderRadius: 14,
        background: 'var(--surf)',
        color: 'var(--tx)',
        cursor: 'pointer',
        transition: 'transform .25s, border-color .25s, box-shadow .25s',
        overflow: 'hidden',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'rgba(131,200,24,.45)';
        e.currentTarget.style.boxShadow = '0 22px 50px -30px rgba(131,200,24,.5)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--line)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repo.name}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            flex: 'none',
            fontFamily: mono,
            fontSize: 10.5,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 6,
            color: repo.private ? 'var(--high)' : 'var(--tx3)',
            background: repo.private ? 'rgba(240,180,84,.1)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${repo.private ? 'rgba(240,180,84,.3)' : 'var(--line2)'}`,
          }}
        >
          {repo.private ? <Lock size={10} strokeWidth={2.4} /> : null}
          {repo.private ? 'Private' : 'Public'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, color: 'var(--tx3)', fontFamily: mono }}>
        {repo.language ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: languageColor(repo.language), flex: 'none' }} />
            {repo.language}
          </span>
        ) : null}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <GitBranch size={12} strokeWidth={2} /> {repo.defaultBranch}
        </span>
        {updated ? <span style={{ marginLeft: 'auto' }}>updated {updated}</span> : null}
      </div>

      {/* Hover affordance */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: 16,
          top: 16,
          opacity: 0,
          color: 'var(--lime)',
          transition: 'opacity .25s',
        }}
        className="bt-repo-arrow"
      >
        <ArrowRight size={16} strokeWidth={2.4} />
      </span>
    </button>
  );
}
