'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import type {
  ForceGraphMethods,
  ForceGraphProps,
  NodeObject,
  LinkObject,
} from 'react-force-graph-2d';
import { PALETTE, LENS_COLOR, type RFNode, type RFLink } from './graph-model';
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
  reducedMotion: boolean;
  scanning: boolean;
  onHover: (id: string | null) => void;
  onSelect: (node: RFNode) => void;
}

export default function ReviewGraph({
  graphData,
  paintVersion,
  hoveredId,
  selectedId,
  activeAgents,
  searchQuery,
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

  // Gentle auto-fit while building, unless the user has taken control.
  useEffect(() => {
    if (userMoved.current) return;
    const fg = fgRef.current;
    if (!fg || graphData.nodes.length === 0) return;
    const now = Date.now();
    if (now - lastFit.current < 700) return;
    lastFit.current = now;
    fg.zoomToFit(reducedMotion ? 0 : 600, 120);
  }, [graphData, reducedMotion]);

  function isDim(node: RFNode): boolean {
    if (hoverSet && !hoverSet.has(node.id)) return true;
    if (query && node.kind === 'file' && !node.path.toLowerCase().includes(query)) return true;
    return false;
  }

  // Returns the lens that should color a file's ring/badge given active filters.
  function activeBadge(node: RFNode): { agent: AgentName; count: number } | null {
    let count = 0;
    for (const a of AGENTS) if (activeAgents.has(a)) count += node.counts[a];
    if (count === 0) return null;
    if (node.worstAgent && activeAgents.has(node.worstAgent)) return { agent: node.worstAgent, count };
    for (const a of AGENTS) if (activeAgents.has(a) && node.counts[a] > 0) return { agent: a, count };
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
      ctx.fillStyle = 'rgba(131,200,24,0.18)';
      ctx.fill();
      ctx.lineWidth = 1.4 / scale;
      ctx.strokeStyle = PALETTE.lime;
      ctx.stroke();
      drawLabel(node.label, PALETTE.lime, 12); // repo name always shown
      ctx.globalAlpha = 1;
      return;
    }
    if (node.kind === 'folder') {
      ctx.beginPath();
      ctx.arc(x, y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(163,163,168,0.30)';
      ctx.fill();
      // Folder names appear once mildly zoomed (or hovered/selected) to avoid clutter.
      if ((scale > 1 || node.id === hoveredId || node.id === selectedId) && !dim) {
        drawLabel(node.label, PALETTE.tx2, 10);
      }
      ctx.globalAlpha = 1;
      return;
    }

    // File node.
    const badge = activeBadge(node);
    const ringColor = badge ? LENS_COLOR[badge.agent] : 'rgba(131,200,24,0.45)';

    // Glow.
    if (!dim) {
      ctx.shadowColor = badge ? ringColor : 'rgba(131,200,24,0.55)';
      ctx.shadowBlur = (badge ? 16 : 8) / 1;
    }
    ctx.beginPath();
    ctx.arc(x, y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = badge ? 'rgba(40,40,45,0.96)' : 'rgba(40,40,45,0.9)';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ring.
    ctx.lineWidth = (badge ? 2 : 1) / scale;
    ctx.strokeStyle = ringColor;
    ctx.stroke();

    // Selection ring.
    if (node.id === selectedId) {
      ctx.beginPath();
      ctx.arc(x, y, node.radius + 4 / scale, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = PALETTE.limeBright;
      ctx.setLineDash([3 / scale, 3 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Finding badge (color = worst active lens, with count).
    if (badge) {
      let pop = 1;
      if (scanning && !reducedMotion && node.lastFindingAt) {
        const dt = Date.now() - node.lastFindingAt;
        if (dt < 600) pop = 1 + 0.55 * (1 - dt / 600);
      }
      const bx = x + node.radius * 0.78;
      const by = y - node.radius * 0.78;
      const br = Math.max(node.radius * 0.62, 4.5) * pop;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = LENS_COLOR[badge.agent];
      ctx.fill();
      ctx.lineWidth = 1.2 / scale;
      ctx.strokeStyle = PALETTE.bg;
      ctx.stroke();
      const label = badge.count > 9 ? '9+' : String(badge.count);
      ctx.font = `700 ${br * 1.15}px ${getMono()}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = badge.agent === 'correctness' ? '#15150f' : '#15150f';
      ctx.fillText(label, bx, by + 0.5 / scale);
    }

    // File names show at the default zoom now (was only when deeply zoomed in),
    // so every file in the web reads as a name. Always shown when hovered/selected.
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
      if (s === hoveredId || t === hoveredId) return 'rgba(131,200,24,0.5)';
      return 'rgba(255,255,255,0.04)';
    }
    return 'rgba(255,255,255,0.09)';
  }

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      {Graph && size.w > 0 && (
        <Graph
          ref={fgRef}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#1d1d20"
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
