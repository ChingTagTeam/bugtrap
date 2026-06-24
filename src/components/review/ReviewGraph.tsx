'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import type {
  ForceGraphMethods,
  ForceGraphProps,
  NodeObject,
  LinkObject,
} from 'react-force-graph-2d';
import { PALETTE, LENS_COLOR, type RFNode, type RFLink } from './graph-model';
import { fileTypeMeta } from '@/lib/file-icons';
import { logoFor, badgeIcon, folderIcon } from '@/lib/node-logos';
import type { AgentName } from '@/lib/types';

type GraphProps = ForceGraphProps<RFNode, RFLink> & {
  ref?: Ref<ForceGraphMethods<RFNode, RFLink> | undefined>;
};

const AGENTS: AgentName[] = ['security', 'correctness', 'readability'];

function linkEndId(end: string | number | NodeObject<RFNode>): string {
  return typeof end === 'object' ? String(end.id) : String(end);
}

export interface ReviewGraphProps {
  graphData: { nodes: RFNode[]; links: RFLink[] };
  paintVersion: number;
  hoveredId: string | null;
  selectedId: string | null;
  activeAgents: Set<AgentName>;
  searchQuery: string;
  /** When set, the graph is filtered to this folder's subtree (drill-in). */
  focusFolder: string | null;
  reducedMotion: boolean;
  scanning: boolean;
  onHover: (id: string | null) => void;
  onSelect: (node: RFNode) => void;
}

export default function ReviewGraph({
  graphData: rawGraphData,
  paintVersion,
  hoveredId,
  selectedId,
  activeAgents,
  searchQuery,
  focusFolder,
  reducedMotion,
  scanning,
  onHover,
  onSelect,
}: ReviewGraphProps) {
  const fgRef = useRef<ForceGraphMethods<RFNode, RFLink> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [Graph, setGraph] = useState<ComponentType<GraphProps> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const userMoved = useRef(false);
  const lastFit = useRef(0);

  // When a logo/badge bitmap finishes loading, nudge the engine so the cooled
  // render loop repaints the node with its now-ready image. Throttled so a
  // burst of loads coalesces into one reheat.
  const repaintScheduled = useRef(false);
  const requestRepaint = useRef(() => {
    if (repaintScheduled.current) return;
    repaintScheduled.current = true;
    requestAnimationFrame(() => {
      repaintScheduled.current = false;
      fgRef.current?.d3ReheatSimulation();
    });
  });

  // Client-only dynamic import (the lib touches window). One boundary cast to
  // pin the generic component to our node/link types.
  useEffect(() => {
    let active = true;
    import('react-force-graph-2d').then((m) => {
      if (active) setGraph(() => m.default as unknown as ComponentType<GraphProps>);
    });
    return () => {
      active = false;
    };
  }, []);

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Configure forces once the graph instance exists.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force('charge');
    // Gentler, range-limited repulsion keeps the web compact instead of
    // flinging clusters far apart.
    if (charge && 'strength' in charge && typeof charge.strength === 'function') charge.strength(-38);
    if (charge && 'distanceMax' in charge && typeof charge.distanceMax === 'function') charge.distanceMax(180);
    const link = fg.d3Force('link');
    if (link && 'distance' in link && typeof link.distance === 'function') {
      link.distance((l: LinkObject<RFNode, RFLink>) => {
        const tid = linkEndId(l.target);
        // Files hug their folder hub; folder-to-folder links sit a touch farther.
        return tid.startsWith('dir:') || tid === 'root' ? 26 : 15;
      });
    }
  }, [Graph]);

  // Drill-in: filter to the focused folder's subtree (its files + descendant
  // folder hubs + the hub chain back to root for context). When no folder is
  // focused, the full graph is shown.
  const graphData = useMemo(() => {
    if (!focusFolder) return rawGraphData;
    const prefix = `${focusFolder}/`;
    const keepIds = new Set<string>(['root', `dir:${focusFolder}`]);
    // Ancestor folder hubs for breadcrumb context.
    const parts = focusFolder.split('/');
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      keepIds.add(`dir:${acc}`);
    }
    for (const n of rawGraphData.nodes) {
      if (n.kind === 'file' && (n.path === focusFolder || n.path.startsWith(prefix))) keepIds.add(n.id);
      if (n.kind === 'folder' && (n.path === focusFolder || n.path.startsWith(prefix))) keepIds.add(n.id);
    }
    const nodes = rawGraphData.nodes.filter((n) => keepIds.has(n.id));
    const links = rawGraphData.links.filter(
      (l) => keepIds.has(linkEndId(l.source)) && keepIds.has(linkEndId(l.target)),
    );
    return { nodes, links };
  }, [rawGraphData, focusFolder]);

  // Adjacency for hover highlighting.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of graphData.links) {
      const s = linkEndId(l.source);
      const t = linkEndId(l.target);
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)?.add(t);
      map.get(t)?.add(s);
    }
    return map;
  }, [graphData]);

  const hoverSet = useMemo(() => {
    if (!hoveredId) return null;
    const set = new Set<string>([hoveredId]);
    for (const n of adjacency.get(hoveredId) ?? []) set.add(n);
    return set;
  }, [hoveredId, adjacency]);

  const query = searchQuery.trim().toLowerCase();

  // The force-graph render loop reads our latest closures each frame, so hover
  // repaints itself. Nudge the simulation when filters/selection change (and as
  // live updates stream in) to guarantee a repaint even if the engine has cooled.
  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [paintVersion, selectedId, query, activeAgents]);

  // On drill-in / drill-out, refit the camera to the (now different) node set.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    userMoved.current = false;
    fg.d3ReheatSimulation();
    const t = setTimeout(() => {
      if (!userMoved.current) fg.zoomToFit(reducedMotion ? 0 : 500, 120);
    }, reducedMotion ? 0 : 350);
    return () => clearTimeout(t);
  }, [focusFolder, reducedMotion]);

  // Anchor the repo root at the graph origin so the cluster grows outward from
  // the viewport center instead of drifting into a corner as nodes stream in.
  useEffect(() => {
    const root = graphData.nodes.find((n) => n.kind === 'root');
    if (root) {
      root.fx = 0;
      root.fy = 0;
    }
  }, [graphData]);

  // Keep the cluster framed in the CENTER as it grows. With only a handful of
  // nodes their bounding box is tiny and near the origin, so zoomToFit would
  // zoom in hugely (and read as "stuck in a corner"); in that case we instead
  // center on the origin at a calm fixed zoom. Once the cluster is meaningfully
  // sized we let zoomToFit frame it. Kept in a ref so the engine-tick callback
  // and the node-change effect share one implementation that sees live props.
  const nodeCountRef = useRef(0);
  useEffect(() => {
    nodeCountRef.current = graphData.nodes.length;
  }, [graphData]);

  const fitToCenter = useRef<(animate: boolean, force: boolean) => void>(() => {});
  useEffect(() => {
    fitToCenter.current = (animate: boolean, force: boolean) => {
      if (userMoved.current) return;
      const fg = fgRef.current;
      if (!fg) return;
      const now = Date.now();
      if (!force && now - lastFit.current < 250) return;
      lastFit.current = now;
      const ms = animate && !reducedMotion ? 300 : 0;
      if (nodeCountRef.current <= 3) {
        // Too few to "fit" sensibly — hold the center at a comfortable zoom.
        fg.centerAt(0, 0, ms);
        fg.zoom(2.2, ms);
      } else {
        fg.zoomToFit(ms, 90);
      }
    };
  }, [reducedMotion]);

  // Fit immediately whenever the node set changes (covers the cooled-engine
  // case where ticks have stopped but a new node arrived). Forces past the tick
  // throttle so the final node never gets left off-center.
  useEffect(() => {
    if (graphData.nodes.length > 0) fitToCenter.current(true, true);
  }, [graphData]);

  // Fly the camera to the selected node (covers selecting a search result or a
  // sidebar file): center on it and zoom in a touch.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !selectedId) return;
    const node = graphData.nodes.find((n) => n.id === selectedId);
    if (!node || node.x == null || node.y == null) return;
    const ms = reducedMotion ? 0 : 700;
    fg.centerAt(node.x, node.y, ms);
    fg.zoom(Math.max(2.4, node.radius * 0.4 + 2), ms);
  }, [selectedId, graphData, reducedMotion]);

  function isDim(node: RFNode): boolean {
    if (hoverSet && !hoverSet.has(node.id)) return true;
    if (query && node.kind === 'file' && !node.path.toLowerCase().includes(query)) return true;
    return false;
  }

  // Display lenses present on a node given active filters: a file can have a
  // SECURITY finding AND a BUG finding, so both badges may show. (correctness +
  // readability both fold into the "bug" display lens.)
  function activeBadges(node: RFNode): { kind: 'security' | 'bug'; color: string }[] {
    const out: { kind: 'security' | 'bug'; color: string }[] = [];
    if (activeAgents.has('security') && node.counts.security > 0) {
      out.push({ kind: 'security', color: LENS_COLOR.security });
    }
    const bugCount =
      (activeAgents.has('correctness') ? node.counts.correctness : 0) +
      (activeAgents.has('readability') ? node.counts.readability : 0);
    if (bugCount > 0) out.push({ kind: 'bug', color: LENS_COLOR.correctness });
    return out;
  }

  // The lens that colors the node ring/glow (worst active lens).
  function ringLens(node: RFNode): { agent: AgentName } | null {
    let count = 0;
    for (const a of AGENTS) if (activeAgents.has(a)) count += node.counts[a];
    if (count === 0) return null;
    if (node.worstAgent && activeAgents.has(node.worstAgent)) return { agent: node.worstAgent };
    for (const a of AGENTS) if (activeAgents.has(a) && node.counts[a] > 0) return { agent: a };
    return null;
  }

  function paintNode(node: NodeObject<RFNode>, ctx: CanvasRenderingContext2D, scale: number): void {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const dim = isDim(node);
    ctx.globalAlpha = dim ? 0.12 : 1;

    const drawLabel = (text: string, color: string, sizePx: number): void => {
      const fontSize = sizePx / scale;
      ctx.font = `600 ${fontSize}px ${getMono()}`;
      const tw = ctx.measureText(text).width;
      const pad = 4 / scale;
      const ly = y + node.radius + fontSize * 1.1;
      ctx.fillStyle = 'rgba(20,20,22,0.82)';
      ctx.fillRect(x - tw / 2 - pad, ly - fontSize / 2 - pad / 2, tw + pad * 2, fontSize + pad);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, ly);
    };

    if (node.kind === 'root') {
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(92,138,240,0.18)';
      ctx.fill();
      ctx.lineWidth = 1.4 / scale;
      ctx.strokeStyle = PALETTE.in;
      ctx.stroke();
      drawLabel(node.label, PALETTE.in, 12); // repo name always shown
      ctx.globalAlpha = 1;
      return;
    }
    if (node.kind === 'folder') {
      // Folder hub: a small neutral node that forms the web, with a folder
      // glyph at its center so directories read as directories at a glance.
      const r = Math.max(node.radius, 7);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(157,157,157,0.30)';
      ctx.fill();

      const folder = folderIcon(PALETTE.tx2, requestRepaint.current);
      if (folder) {
        const s = r * 1.5;
        ctx.drawImage(folder, x - s / 2, y - s / 2, s, s);
      }

      // Folder names appear once mildly zoomed (or hovered/selected) to avoid clutter.
      if ((scale > 1 || node.id === hoveredId || node.id === selectedId) && !dim) {
        drawLabel(node.label, PALETTE.tx2, 10);
      }
      ctx.globalAlpha = 1;
      return;
    }

    // ── File node ────────────────────────────────────────────────────
    // The center always shows the STANDARD file-type icon (the language
    // short-code in its type color). Findings are shown only as the RING
    // color + corner badge; a clean, fully-scanned file washes to green.
    const ring = ringLens(node);
    const badges = activeBadges(node);
    const hasFinding = ring != null;
    const clean =
      !hasFinding && node.verdict === 'safe' && node.findingCount === 0;
    const ringColor = ring
      ? LENS_COLOR[ring.agent]
      : clean
        ? PALETTE.safe
        : 'rgba(92,138,240,0.45)';

    // Glow.
    if (!dim) {
      ctx.shadowColor = hasFinding
        ? ringColor
        : clean
          ? 'rgba(78,201,168,0.55)'
          : 'rgba(92,138,240,0.55)';
      ctx.shadowBlur = hasFinding ? 16 : 8;
    }
    ctx.beginPath();
    ctx.arc(x, y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = hasFinding ? 'rgba(45,45,48,0.97)' : 'rgba(45,45,48,0.92)';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ring (worst-severity / lens color; green when clear).
    ctx.lineWidth = (hasFinding ? 2 : 1) / scale;
    ctx.strokeStyle = ringColor;
    ctx.stroke();

    // Selection ring.
    if (node.id === selectedId) {
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 4 / scale, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = PALETTE.inBright;
      ctx.setLineDash([3 / scale, 3 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Center: the real language logo (devicon). Until the bitmap is ready (or
    // for a type with no logo) fall back to the standard short-code glyph.
    if (!dim) {
      const logo = logoFor(node.path, requestRepaint.current);
      if (logo) {
        const s = node.radius * 1.25; // fit inside the circle
        ctx.drawImage(logo, x - s / 2, y - s / 2, s, s);
      } else {
        const meta = fileTypeMeta(node.path);
        const glyph = meta.label.length > 4 ? meta.label.slice(0, 4) : meta.label;
        const maxByWidth = (node.radius * 1.5) / Math.max(1, glyph.length * 0.62);
        const glyphSize = Math.min(node.radius * 0.95, maxByWidth);
        ctx.font = `700 ${glyphSize}px ${getMono()}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = meta.color;
        ctx.fillText(glyph, x, y + 0.5 / scale);
      }
    }

    // Finding badges: a security shield and/or a bug icon (NOT counts). When a
    // file has both, the shield sits top-right and the bug sits top-left.
    if (badges.length > 0 && !dim) {
      let pop = 1;
      if (scanning && !reducedMotion && node.lastFindingAt) {
        const dt = Date.now() - node.lastFindingAt;
        if (dt < 600) pop = 1 + 0.55 * (1 - dt / 600);
      }
      const br = Math.max(node.radius * 0.62, 5) * pop;
      // Anchor angles: single → top-right; two → top-right + top-left.
      const angles = badges.length === 1 ? [-Math.PI / 4] : [-Math.PI / 4, (-Math.PI * 3) / 4];
      badges.forEach((b, i) => {
        const ang = angles[i];
        const bx = x + Math.cos(ang) * node.radius * 1.05;
        const by = y + Math.sin(ang) * node.radius * 1.05;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.lineWidth = 1.2 / scale;
        ctx.strokeStyle = PALETTE.bg;
        ctx.stroke();
        const icon = badgeIcon(b.kind, requestRepaint.current);
        if (icon) {
          const is = br * 1.25;
          ctx.drawImage(icon, bx - is / 2, by - is / 2, is, is);
        }
      });
    }

    // File names show below the node at default zoom; always when active.
    const showLabel = scale > 0.5 || node.id === hoveredId || node.id === selectedId;
    if (showLabel && !dim) {
      drawLabel(node.label, PALETTE.tx, 11);
    }

    ctx.globalAlpha = 1;
  }

  function paintPointerArea(node: NodeObject<RFNode>, color: string, ctx: CanvasRenderingContext2D): void {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, node.kind === 'file' ? node.radius + 3 : node.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function linkColor(link: LinkObject<RFNode, RFLink>): string {
    if (hoveredId) {
      const s = linkEndId(link.source);
      const t = linkEndId(link.target);
      if (s === hoveredId || t === hoveredId) return 'rgba(130,168,246,0.6)';
      return 'rgba(255,255,255,0.04)';
    }
    return 'rgba(255,255,255,0.08)';
  }

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      {Graph && size.w > 0 && (
        <Graph
          ref={fgRef}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#1e1e1e"
          nodeRelSize={1}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          linkColor={linkColor}
          linkWidth={(l: LinkObject<RFNode, RFLink>) =>
            hoveredId && (linkEndId(l.source) === hoveredId || linkEndId(l.target) === hoveredId) ? 1.4 : 0.6
          }
          warmupTicks={reducedMotion ? 90 : 0}
          cooldownTicks={reducedMotion ? 0 : undefined}
          d3VelocityDecay={0.45}
          onNodeHover={(node) => onHover(node ? String(node.id) : null)}
          onNodeClick={(node) => {
            if (node.kind === 'file') onSelect(node);
          }}
          onNodeDrag={() => {
            userMoved.current = true;
          }}
          onBackgroundClick={() => onHover(null)}
          onEngineTick={() => {
            // Re-frame every simulation frame while building so the cluster
            // stays centered and zooms out as nodes stream in (throttled).
            if (scanning) fitToCenter.current(false, false);
          }}
          onEngineStop={() => {
            // Frame the settled layout (unless the user has taken control).
            if (!userMoved.current) fgRef.current?.zoomToFit(reducedMotion ? 0 : 400, 120);
          }}
        />
      )}
    </div>
  );
}

let _mono = '';
function getMono(): string {
  if (_mono) return _mono;
  if (typeof window !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-jetbrains-mono');
    _mono = v ? `${v.trim()}, monospace` : 'monospace';
  } else {
    _mono = 'monospace';
  }
  return _mono;
}
