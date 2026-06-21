/**
 * Maps a file path to a small file-type badge (IDE/editor style): a short
 * language label and an accent color. Used by the file-tree explorer and the
 * graph so each file reads as a recognizable type at a glance.
 */
export interface FileTypeMeta {
  label: string;
  color: string;
}

const BY_EXT: Record<string, FileTypeMeta> = {
  ts: { label: 'TS', color: '#3178c6' },
  tsx: { label: 'TSX', color: '#3178c6' },
  js: { label: 'JS', color: '#f0db4f' },
  jsx: { label: 'JSX', color: '#f0db4f' },
  mjs: { label: 'JS', color: '#f0db4f' },
  cjs: { label: 'JS', color: '#f0db4f' },
  css: { label: 'CSS', color: '#54b8ff' },
  scss: { label: 'SCSS', color: '#cd6799' },
  sass: { label: 'SASS', color: '#cd6799' },
  html: { label: 'HTML', color: '#e34c26' },
  htm: { label: 'HTML', color: '#e34c26' },
  json: { label: 'JSON', color: '#cbcb41' },
  md: { label: 'MD', color: '#a3a3a8' },
  mdx: { label: 'MDX', color: '#a3a3a8' },
  py: { label: 'PY', color: '#3572a5' },
  rb: { label: 'RB', color: '#cc342d' },
  go: { label: 'GO', color: '#00add8' },
  rs: { label: 'RS', color: '#dea584' },
  java: { label: 'JAVA', color: '#b07219' },
  kt: { label: 'KT', color: '#a97bff' },
  swift: { label: 'SWIFT', color: '#f05138' },
  c: { label: 'C', color: '#555555' },
  h: { label: 'H', color: '#555555' },
  cpp: { label: 'C++', color: '#f34b7d' },
  cc: { label: 'C++', color: '#f34b7d' },
  cs: { label: 'C#', color: '#178600' },
  php: { label: 'PHP', color: '#4f5d95' },
  sh: { label: 'SH', color: '#89e051' },
  bash: { label: 'SH', color: '#89e051' },
  yml: { label: 'YML', color: '#cb171e' },
  yaml: { label: 'YML', color: '#cb171e' },
  toml: { label: 'TOML', color: '#9c4221' },
  sql: { label: 'SQL', color: '#e38c00' },
  vue: { label: 'VUE', color: '#41b883' },
  svelte: { label: 'SV', color: '#ff3e00' },
  dart: { label: 'DART', color: '#00b4ab' },
};

const DEFAULT_META: FileTypeMeta = { label: 'FILE', color: '#6f6f76' };

export function fileTypeMeta(path: string): FileTypeMeta {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return DEFAULT_META;
  const ext = base.slice(dot + 1).toLowerCase();
  return BY_EXT[ext] ?? DEFAULT_META;
}
