/** GitHub-linguist-style colors for the common languages we surface. */
const LANGUAGE_COLOR: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Ruby: '#701516',
  PHP: '#4F5D95',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Shell: '#89e051',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Lua: '#000080',
  R: '#198CE7',
};

export function languageColor(lang: string | null): string {
  if (!lang) return 'var(--tx3)';
  return LANGUAGE_COLOR[lang] ?? 'var(--tx3)';
}

/** Compact relative time, e.g. "3d ago". Empty string for unknown dates. */
export function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}
