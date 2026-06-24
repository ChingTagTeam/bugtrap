/**
 * Decides which repository files are worth running the review pipeline on,
 * and maps extensions to a Monaco language id + display label.
 */

const MAX_FILE_BYTES = 120_000; // skip generated / vendored monsters

const SKIP_DIR_SEGMENTS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', 'dist', 'build',
  'out', 'coverage', 'vendor', 'third_party', 'target', 'bin', 'obj',
  '__pycache__', '.venv', 'venv', '.cache', '.turbo', '.gradle', 'Pods',
  'DerivedData', '.terraform', 'migrations',
]);

const SKIP_FILE_RE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|composer\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|bun\.lockb)$/i;

const MINIFIED_RE = /\.(min|bundle|chunk)\.(js|css|mjs|cjs)$/i;

/** ext → { Monaco language id, human label } */
const SOURCE_EXT: Record<string, { language: string; label: string }> = {
  ts: { language: 'typescript', label: 'TypeScript' },
  tsx: { language: 'typescript', label: 'TypeScript' },
  mts: { language: 'typescript', label: 'TypeScript' },
  cts: { language: 'typescript', label: 'TypeScript' },
  js: { language: 'javascript', label: 'JavaScript' },
  jsx: { language: 'javascript', label: 'JavaScript' },
  mjs: { language: 'javascript', label: 'JavaScript' },
  cjs: { language: 'javascript', label: 'JavaScript' },
  py: { language: 'python', label: 'Python' },
  rb: { language: 'ruby', label: 'Ruby' },
  go: { language: 'go', label: 'Go' },
  rs: { language: 'rust', label: 'Rust' },
  java: { language: 'java', label: 'Java' },
  kt: { language: 'kotlin', label: 'Kotlin' },
  kts: { language: 'kotlin', label: 'Kotlin' },
  swift: { language: 'swift', label: 'Swift' },
  scala: { language: 'scala', label: 'Scala' },
  c: { language: 'c', label: 'C' },
  h: { language: 'c', label: 'C' },
  cpp: { language: 'cpp', label: 'C++' },
  cc: { language: 'cpp', label: 'C++' },
  cxx: { language: 'cpp', label: 'C++' },
  hpp: { language: 'cpp', label: 'C++' },
  cs: { language: 'csharp', label: 'C#' },
  php: { language: 'php', label: 'PHP' },
  sh: { language: 'shell', label: 'Shell' },
  bash: { language: 'shell', label: 'Shell' },
  zsh: { language: 'shell', label: 'Shell' },
  sql: { language: 'sql', label: 'SQL' },
  html: { language: 'html', label: 'HTML' },
  vue: { language: 'html', label: 'Vue' },
  svelte: { language: 'html', label: 'Svelte' },
  css: { language: 'css', label: 'CSS' },
  scss: { language: 'scss', label: 'SCSS' },
  sass: { language: 'scss', label: 'Sass' },
  less: { language: 'less', label: 'Less' },
  json: { language: 'json', label: 'JSON' },
  yaml: { language: 'yaml', label: 'YAML' },
  yml: { language: 'yaml', label: 'YAML' },
  toml: { language: 'ini', label: 'TOML' },
  dart: { language: 'dart', label: 'Dart' },
  lua: { language: 'lua', label: 'Lua' },
  r: { language: 'r', label: 'R' },
  ex: { language: 'elixir', label: 'Elixir' },
  exs: { language: 'elixir', label: 'Elixir' },
};

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

/** True if the path should be reviewed (source file, not vendored/binary/huge). */
export function isReviewableSourceFile(path: string, size: number): boolean {
  const segments = path.split('/');
  if (segments.some((s) => SKIP_DIR_SEGMENTS.has(s) || s.startsWith('.'))) return false;
  if (SKIP_FILE_RE.test(path)) return false;
  if (MINIFIED_RE.test(path)) return false;
  if (size <= 0 || size > MAX_FILE_BYTES) return false;
  return extOf(path) in SOURCE_EXT;
}

/** Monaco language id + label for a path; falls back to plaintext. */
export function inferLanguage(path: string): { language: string; label: string } {
  return SOURCE_EXT[extOf(path)] ?? { language: 'plaintext', label: 'Text' };
}
