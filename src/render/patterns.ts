import type { Paint, PatternId, Sketch } from '../model/types';
import { f2, h, toSvgString, type El } from './el';

export function hex(c: string | undefined, fallback = '999'): string {
  let s = (c ?? fallback).replace(/^#/, '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  return '#' + s;
}

function rgb(c: string): [number, number, number] {
  const s = hex(c).slice(1);
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mix toward black (k < 0) or white (k > 0). */
export function shade(c: string, k: number): string {
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  return '#' + rgb(c).map((v) => Math.round(v + (t - v) * a).toString(16).padStart(2, '0')).join('');
}

export function luminance(c: string): number {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text color that reads on top of `c`. */
export function inkOn(c: string): string {
  return luminance(c) > 0.22 ? '#1d2420' : '#f3f5f2';
}

// Deterministic pseudo-random numbers for organic patterns.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

interface Tile {
  w: number;
  h: number;
  body: (c1: string, c2: string) => El[];
}

const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, extra: Record<string, string | number> = {}) =>
  h('line', { x1: f2(x1), y1: f2(y1), x2: f2(x2), y2: f2(y2), stroke, 'stroke-width': sw, ...extra });
const rect = (x: number, y: number, w: number, hh: number, fill: string, extra: Record<string, string | number> = {}) =>
  h('rect', { x: f2(x), y: f2(y), width: f2(w), height: f2(hh), fill, ...extra });

export const PATTERN_TILES: Record<Exclude<PatternId, 'solid'>, Tile> = {
  stripe: { w: 6, h: 6, body: (_a, b) => [rect(0, 0, 3, 6, b)] },
  check: { w: 8, h: 8, body: (_a, b) => [rect(0, 0, 4, 4, b), rect(4, 4, 4, 4, b)] },
  plaid: {
    w: 12,
    h: 12,
    body: (_a, b) => [
      rect(0, 3, 12, 4, b, { opacity: 0.45 }),
      rect(3, 0, 4, 12, b, { opacity: 0.45 }),
      line(0, 10, 12, 10, b, 0.4),
      line(10, 0, 10, 12, b, 0.4),
    ],
  },
  herringbone: {
    w: 8,
    h: 8,
    body: (_a, b) => [
      h('path', { d: 'M0 4L4 0M4 8L8 4M0 8L4 4', stroke: b, 'stroke-width': 0.5, fill: 'none' }),
      h('path', { d: 'M4 0L8 4M0 4L4 8', stroke: b, 'stroke-width': 0.25, fill: 'none', opacity: 0.6 }),
    ],
  },
  wood: {
    w: 30,
    h: 6,
    body: (_a, b) => [
      h('path', { d: 'M0 1.2C8 0.6 14 2 22 1.3S28 1 30 1.2', stroke: b, 'stroke-width': 0.35, fill: 'none' }),
      h('path', { d: 'M0 3.4C6 3.9 12 2.8 19 3.5S26 4 30 3.4', stroke: b, 'stroke-width': 0.25, fill: 'none' }),
      h('path', { d: 'M0 5.2C9 5 15 5.6 30 5.2', stroke: b, 'stroke-width': 0.3, fill: 'none', opacity: 0.7 }),
      h('ellipse', { cx: 12, cy: 3.3, rx: 1.6, ry: 0.5, fill: 'none', stroke: b, 'stroke-width': 0.2 }),
    ],
  },
  dots: { w: 6, h: 6, body: (_a, b) => [h('circle', { cx: 1.5, cy: 1.5, r: 0.9, fill: b }), h('circle', { cx: 4.5, cy: 4.5, r: 0.9, fill: b })] },
  grid: { w: 12, h: 12, body: (_a, b) => [line(0, 0, 12, 0, b, 0.5), line(0, 0, 0, 12, b, 0.5)] },
  tile: { w: 12, h: 12, body: (_a, b) => [rect(0, 0, 12, 0.6, b), rect(0, 0, 0.6, 12, b)] },
  brick: {
    w: 8,
    h: 6,
    body: (_a, b) => [rect(0, 0, 8, 0.5, b), rect(0, 3, 8, 0.5, b), rect(0, 0, 0.5, 3, b), rect(4, 3, 0.5, 3, b)],
  },
  diamond: {
    w: 12,
    h: 12,
    body: (_a, b) => [
      h('path', { d: 'M6 0L12 6L6 12L0 6Z', fill: b, opacity: 0.55 }),
      h('path', { d: 'M6 3L9 6L6 9L3 6Z', fill: b }),
    ],
  },
  chevron: { w: 12, h: 8, body: (_a, b) => [h('path', { d: 'M0 2L6 6L12 2V5L6 9L0 5Z', fill: b })] },
  terrazzo: {
    w: 16,
    h: 16,
    body: (_a, b) => {
      const r = rng(7);
      const out: El[] = [];
      for (let i = 0; i < 14; i++) {
        const x = r() * 16;
        const y = r() * 16;
        const s = 0.4 + r() * 1.1;
        out.push(h('path', { d: `M${f2(x)} ${f2(y)}l${f2(s)} ${f2(s * 0.4)}l${f2(-s * 0.3)} ${f2(s)}z`, fill: b, opacity: f2(0.5 + r() * 0.5) }));
      }
      return out;
    },
  },
  shag: {
    w: 6,
    h: 6,
    body: (_a, b) => {
      const r = rng(3);
      const out: El[] = [];
      for (let i = 0; i < 12; i++) {
        const x = r() * 6;
        const y = r() * 6;
        const a = r() * Math.PI;
        out.push(line(x, y, x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, b, 0.35, { 'stroke-linecap': 'round' }));
      }
      return out;
    },
  },
  boucle: {
    w: 3,
    h: 3,
    body: (_a, b) => [
      h('circle', { cx: 0.8, cy: 0.8, r: 0.45, fill: 'none', stroke: b, 'stroke-width': 0.2, opacity: 0.7 }),
      h('circle', { cx: 2.3, cy: 2.2, r: 0.45, fill: 'none', stroke: b, 'stroke-width': 0.2, opacity: 0.7 }),
    ],
  },
  floral: {
    w: 18,
    h: 18,
    body: (_a, b) => {
      const petals = (cx: number, cy: number, r: number) =>
        [0, 72, 144, 216, 288].map((d) => {
          const a = (d * Math.PI) / 180;
          return h('ellipse', {
            cx: f2(cx + Math.cos(a) * r),
            cy: f2(cy + Math.sin(a) * r),
            rx: f2(r * 0.8),
            ry: f2(r * 0.45),
            transform: `rotate(${d} ${f2(cx + Math.cos(a) * r)} ${f2(cy + Math.sin(a) * r)})`,
            fill: 'none',
            stroke: b,
            'stroke-width': 0.35,
          });
        });
      return [...petals(4.5, 4.5, 1.8), ...petals(13.5, 13.5, 1.8), h('circle', { cx: 13.5, cy: 4.5, r: 0.6, fill: b }), h('circle', { cx: 4.5, cy: 13.5, r: 0.6, fill: b })];
    },
  },
};

export function defaultColor2(c1: string, pattern?: PatternId): string {
  if (pattern === 'tile' || pattern === 'brick' || pattern === 'grid') return shade(c1, luminance(c1) > 0.4 ? -0.25 : 0.25);
  return shade(c1, luminance(c1) > 0.15 ? -0.2 : 0.18);
}

function paintKey(p: Paint): string {
  const s = JSON.stringify(p);
  let x = 5381;
  for (let i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0;
  return x.toString(36);
}

/** Collects <pattern> defs as paints are used. */
export class PaintDefs {
  private defs = new Map<string, El>();
  constructor(
    private sketches: Sketch[] = [],
    private prefix = 'p',
  ) {}

  /** A fill value for this paint: a color, or url(#id) for a pattern. */
  fill(p: Paint | undefined, fallback: string): string {
    if (!p) return fallback;
    const c1 = p.color ? hex(p.color) : fallback;
    if (p.sketch !== undefined && this.sketches[p.sketch]) return this.sketchFill(p, c1);
    if (!p.pattern || p.pattern === 'solid') return c1;
    const tile = PATTERN_TILES[p.pattern];
    if (!tile || !c1.startsWith('#')) return c1;
    const id = `${this.prefix}${paintKey(p)}`;
    if (!this.defs.has(id)) {
      const c2 = p.color2 ? hex(p.color2) : defaultColor2(c1, p.pattern);
      const s = p.scale && p.scale > 0 ? p.scale : 1;
      const tf = [p.angle ? `rotate(${p.angle})` : '', s !== 1 ? `scale(${s})` : ''].filter(Boolean).join(' ');
      this.defs.set(
        id,
        h(
          'pattern',
          { id, width: tile.w, height: tile.h, patternUnits: 'userSpaceOnUse', patternTransform: tf || undefined },
          rect(0, 0, tile.w, tile.h, c1),
          ...tile.body(c1, c2),
        ),
      );
    }
    return `url(#${id})`;
  }

  private sketchFill(p: Paint, c1: string): string {
    const sk = this.sketches[p.sketch!];
    const id = `${this.prefix}s${paintKey(p)}`;
    if (!this.defs.has(id)) {
      const s = p.scale && p.scale > 0 ? p.scale : 1;
      const tf = [p.angle ? `rotate(${p.angle})` : '', s !== 1 ? `scale(${s})` : ''].filter(Boolean).join(' ');
      this.defs.set(
        id,
        h('pattern', { id, width: sk.w, height: sk.h, patternUnits: 'userSpaceOnUse', patternTransform: tf || undefined }, rect(0, 0, sk.w, sk.h, c1), ...sketchPaths(sk)),
      );
    }
    return `url(#${id})`;
  }

  el(): El | null {
    return this.defs.size ? h('defs', {}, ...this.defs.values()) : null;
  }
}

export function sketchPaths(sk: Sketch): El[] {
  return sk.paths.map(([ci, d]) => h('path', { d, fill: hex(sk.pal[ci] ?? '000') }));
}

/** A sketch drawn into a box, stretched to fit (wall art). */
export function sketchInBox(sk: Sketch, x: number, y: number, w: number, hh: number, extra: Record<string, string | number> = {}): El {
  return h(
    'svg',
    { x: f2(x), y: f2(y), width: f2(w), height: f2(hh), viewBox: `0 0 ${sk.w} ${sk.h}`, preserveAspectRatio: 'none', ...extra },
    ...sketchPaths(sk),
  );
}

/** Small standalone swatch SVG string for UI previews and 3D textures. */
export function swatchSvg(p: Paint, sketches: Sketch[] = [], size = 24, fallback = '#999999'): string {
  const defs = new PaintDefs(sketches, 'w');
  const fill = defs.fill(p, fallback);
  const d = defs.el();
  const parts = [d, h('rect', { x: 0, y: 0, width: size, height: size, fill })].filter(Boolean) as El[];
  return toSvgString(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: `0 0 ${size} ${size}` }, ...parts));
}
