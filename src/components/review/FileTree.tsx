'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { fileTypeMeta } from '@/lib/file-icons';
import { LENS_COLOR, type RFNode } from './graph-model';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

interface TreeFile {
  kind: 'file';
  name: string;
  path: string;
  node: RFNode;
}
interface TreeFolder {
  kind: 'folder';
  name: string;
  path: string;
  children: TreeEntry[];
}
type TreeEntry = TreeFile | TreeFolder;

function buildTree(files: RFNode[]): TreeEntry[] {
  const root: TreeFolder = { kind: 'folder', name: '', path: '', children: [] };
  const folders = new Map<string, TreeFolder>([['', root]]);

  const ensureFolder = (path: string): TreeFolder => {
    const existing = folders.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf('/');
    const parent = ensureFolder(slash === -1 ? '' : path.slice(0, slash));
    const folder: TreeFolder = { kind: 'folder', name: path.slice(slash + 1), path, children: [] };
    folders.set(path, folder);
    parent.children.push(folder);
    return folder;
  };

  for (const node of files) {
    const slash = node.path.lastIndexOf('/');
    const parent = ensureFolder(slash === -1 ? '' : node.path.slice(0, slash));
    parent.children.push({ kind: 'file', name: node.path.slice(slash + 1), path: node.path, node });
  }

  const sortEntries = (entries: TreeEntry[]): TreeEntry[] => {
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) if (e.kind === 'folder') sortEntries(e.children);
    return entries;
  };

  return sortEntries(root.children);
}

export default function FileTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: RFNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const files = useMemo(() => nodes.filter((n) => n.kind === 'file'), [nodes]);
  const tree = useMemo(() => buildTree(files), [files]);

  if (files.length === 0) {
    return (
      <div style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--tx3)', fontFamily: mono, fontSize: 12.5, lineHeight: 1.6 }}>
        No files discovered yet.
      </div>
    );
  }

  return (
    <div style={{ padding: '6px 6px 18px' }}>
      {tree.map((entry) => (
        <TreeRow key={entry.path} entry={entry} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TreeRow({
  entry,
  depth,
  selectedPath,
  onSelect,
}: {
  entry: TreeEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const indent = 8 + depth * 13;

  if (entry.kind === 'folder') {
    return (
      <>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ ...rowStyle, paddingLeft: indent, color: 'var(--tx2)' }}
          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {open ? <ChevronDown size={13} style={{ flex: 'none', color: 'var(--tx3)' }} /> : <ChevronRight size={13} style={{ flex: 'none', color: 'var(--tx3)' }} />}
          {open ? <FolderOpen size={14} style={{ flex: 'none', color: 'var(--tx3)' }} /> : <Folder size={14} style={{ flex: 'none', color: 'var(--tx3)' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
        </button>
        {open && entry.children.map((c) => (
          <TreeRow key={c.path} entry={c} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </>
    );
  }

  const meta = fileTypeMeta(entry.path);
  const node = entry.node;
  const selected = selectedPath === entry.path;
  const dotColor = node.worstAgent ? LENS_COLOR[node.worstAgent] : null;

  return (
    <button
      onClick={() => onSelect(entry.path)}
      title={entry.path}
      style={{
        ...rowStyle,
        paddingLeft: indent + 16,
        color: selected ? 'var(--tx)' : 'var(--tx2)',
        background: selected ? 'rgba(131,200,24,.12)' : 'transparent',
      }}
      onMouseOver={(e) => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,.04)'; }}
      onMouseOut={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        aria-hidden
        style={{
          flex: 'none',
          minWidth: 26,
          height: 15,
          padding: '0 4px',
          borderRadius: 4,
          background: `${meta.color}22`,
          color: meta.color,
          border: `1px solid ${meta.color}55`,
          fontFamily: mono,
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: '.02em',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {meta.label}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{entry.name}</span>
      {node.findingCount > 0 && dotColor && (
        <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
          <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--tx3)' }}>{node.findingCount}</span>
        </span>
      )}
    </button>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '4px 8px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 13,
  borderRadius: 6,
  fontFamily: 'inherit',
  transition: 'background .15s',
};
