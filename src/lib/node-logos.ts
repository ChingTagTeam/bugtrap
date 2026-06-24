/**
 * Real language logos (devicon) for graph file nodes.
 *
 * Each devicon SVG is imported as a static asset URL. At paint time we can't
 * draw an SVG React component onto a canvas, so we rasterize each logo to an
 * <img> exactly once, cache it by file extension, and let the canvas draw the
 * cached bitmap. A repaint is triggered via the onLoaded callback once the
 * bitmap is ready.
 */

import ts from 'devicon/icons/typescript/typescript-original.svg';
import js from 'devicon/icons/javascript/javascript-original.svg';
import py from 'devicon/icons/python/python-original.svg';
import rb from 'devicon/icons/ruby/ruby-original.svg';
import go from 'devicon/icons/go/go-original.svg';
import rs from 'devicon/icons/rust/rust-original.svg';
import java from 'devicon/icons/java/java-original.svg';
import kt from 'devicon/icons/kotlin/kotlin-original.svg';
import swift from 'devicon/icons/swift/swift-original.svg';
import scala from 'devicon/icons/scala/scala-original.svg';
import c from 'devicon/icons/c/c-original.svg';
import cpp from 'devicon/icons/cplusplus/cplusplus-original.svg';
import cs from 'devicon/icons/csharp/csharp-original.svg';
import php from 'devicon/icons/php/php-original.svg';
import html from 'devicon/icons/html5/html5-original.svg';
import css from 'devicon/icons/css3/css3-original.svg';
import json from 'devicon/icons/json/json-original.svg';
import yaml from 'devicon/icons/yaml/yaml-original.svg';
import bash from 'devicon/icons/bash/bash-original.svg';
import dart from 'devicon/icons/dart/dart-original.svg';
import lua from 'devicon/icons/lua/lua-original.svg';
import r from 'devicon/icons/r/r-original.svg';
import elixir from 'devicon/icons/elixir/elixir-original.svg';
import vue from 'devicon/icons/vuejs/vuejs-original.svg';
import svelte from 'devicon/icons/svelte/svelte-original.svg';
import markdown from 'devicon/icons/markdown/markdown-original.svg';

/** Some devicon imports resolve to a URL string, others to `{ src }`. */
function urlOf(mod: unknown): string {
  if (typeof mod === 'string') return mod;
  if (mod && typeof mod === 'object' && 'src' in mod) {
    const src = (mod as { src: unknown }).src;
    if (typeof src === 'string') return src;
  }
  return '';
}

/** ext → devicon logo URL. Extensions with no logo simply have no entry. */
const LOGO_URL: Record<string, string> = {
  ts: urlOf(ts), tsx: urlOf(ts), mts: urlOf(ts), cts: urlOf(ts),
  js: urlOf(js), jsx: urlOf(js), mjs: urlOf(js), cjs: urlOf(js),
  py: urlOf(py),
  rb: urlOf(rb),
  go: urlOf(go),
  rs: urlOf(rs),
  java: urlOf(java),
  kt: urlOf(kt), kts: urlOf(kt),
  swift: urlOf(swift),
  scala: urlOf(scala),
  c: urlOf(c), h: urlOf(c),
  cpp: urlOf(cpp), cc: urlOf(cpp), cxx: urlOf(cpp), hpp: urlOf(cpp),
  cs: urlOf(cs),
  php: urlOf(php),
  html: urlOf(html), htm: urlOf(html),
  css: urlOf(css),
  json: urlOf(json),
  yaml: urlOf(yaml), yml: urlOf(yaml),
  sh: urlOf(bash), bash: urlOf(bash), zsh: urlOf(bash),
  dart: urlOf(dart),
  lua: urlOf(lua),
  r: urlOf(r),
  ex: urlOf(elixir), exs: urlOf(elixir),
  vue: urlOf(vue),
  svelte: urlOf(svelte),
  md: urlOf(markdown), mdx: urlOf(markdown),
};

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/* ── Finding badge icons (security shield / bug), drawn white on the badge ──
 * lucide path data, inlined so a node badge can show an icon instead of a
 * count. Rendered white so it reads on the security-red / bug-amber badge. */
const BADGE_SVG: Record<'security' | 'bug', string> = {
  // lucide "shield-alert"
  security:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  // lucide "bug"
  bug: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>',
};

/* ── Folder glyph (lucide "folder"), drawn at a folder node's center ──
 * Tinted to the neutral folder text color so it reads on the grey hub. */
const FOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%STROKE%" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';

const folderCache = new Map<string, HTMLImageElement | null>();

/** Cached folder glyph, tinted to `stroke`. Loads once; repaints via onLoaded. */
export function folderIcon(stroke: string, onLoaded: () => void): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  const cached = folderCache.get(stroke);
  if (cached !== undefined) return cached;

  const img = new Image();
  folderCache.set(stroke, null);
  img.onload = () => {
    folderCache.set(stroke, img);
    onLoaded();
  };
  img.onerror = () => folderCache.set(stroke, null);
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(FOLDER_SVG.replace('%STROKE%', stroke))}`;
  return img.complete && img.naturalWidth > 0 ? img : null;
}

const badgeCache = new Map<'security' | 'bug', HTMLImageElement | null>();

/** Cached white badge icon (security shield / bug). Loads once; repaints via onLoaded. */
export function badgeIcon(kind: 'security' | 'bug', onLoaded: () => void): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  const cached = badgeCache.get(kind);
  if (cached !== undefined) return cached;

  const img = new Image();
  badgeCache.set(kind, null);
  img.onload = () => {
    badgeCache.set(kind, img);
    onLoaded();
  };
  img.onerror = () => badgeCache.set(kind, null);
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(BADGE_SVG[kind])}`;
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Rasterized-logo cache, keyed by extension. */
const imageCache = new Map<string, HTMLImageElement | null>();

/**
 * Returns the cached, loaded logo image for a path, or null if there's no logo
 * or it hasn't finished loading. The first miss kicks off the load and calls
 * `onLoaded` once the bitmap is decoded so the canvas can repaint.
 */
export function logoFor(path: string, onLoaded: () => void): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  const ext = extOf(path);
  const url = LOGO_URL[ext];
  if (!url) return null;

  const cached = imageCache.get(ext);
  if (cached !== undefined) return cached; // null = loading/failed, img = ready

  const img = new Image();
  imageCache.set(ext, null); // mark in-flight so we only load once
  img.onload = () => {
    imageCache.set(ext, img);
    onLoaded();
  };
  img.onerror = () => {
    imageCache.set(ext, null);
  };
  img.src = url;
  return null;
}
