import { anchorDistance } from '../model/anchors';
import { clearances } from '../model/clearance';
import { itemPaint, itemType, LIGHT_GLOW } from '../model/defaults';
import { wallName } from '../model/estimates';
import {
  bounds,
  frameMatrix,
  itemExtent,
  offsetPolygon,
  readableAngle,
  rotate,
  wallFrame,
  wallFrames,
  wallPoint,
  type WallFrame,
} from '../model/geometry';
import type { Feature, Item, Plan, Units, Vec } from '../model/types';
import { fmtLen } from '../model/units';
import { f2, h, type Attrs, type El } from './el';
import { hex, inkOn, PaintDefs, sketchInBox } from './patterns';
import { LIGHT, type Theme } from './theme';

export const WALL_T = 5;

export type Selection =
  | { kind: 'item'; id: string }
  | { kind: 'wall'; wall: number }
  | { kind: 'feature'; wall: number; index: number }
  | null;

export interface PlanOptions {
  theme?: Theme;
  units?: Units;
  selection?: Selection;
  /** 'room' shows corner and wall handles. */
  mode?: 'furnish' | 'room';
  /** Emit data-* hooks and handles for the editor. */
  interactive?: boolean;
  /** Earlier positions of changed pieces, drawn dashed. */
  ghosts?: Item[];
  /** Ids of pieces to highlight as changed. */
  changed?: string[];
  grid?: boolean;
  /** Add the room name and a scale note (for exported images). */
  caption?: boolean;
  /** Pixel width for standalone output. */
  width?: number;
  /** Show anchor and clearance lines for the selected piece. */
  guides?: boolean;
}

const pts = (p: Vec[]) => p.map((v) => `${f2(v[0])},${f2(v[1])}`).join(' ');

/** Base text size in inches, scaled to the room. */
export function baseFont(plan: Plan): number {
  const b = bounds(plan.verts);
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  return Math.min(9, Math.max(3.4, span / 52));
}

/** Text placed in room coordinates, rotated to run along `u` and never upside down. */
function textAt(p: Vec, u: Vec, s: string, attrs: Attrs): El {
  const a = readableAngle(u);
  return h(
    'text',
    {
      x: f2(p[0]),
      y: f2(p[1]),
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      transform: a ? `rotate(${a} ${f2(p[0])} ${f2(p[1])})` : undefined,
      ...attrs,
    },
    s,
  );
}

function lPath(it: Item): string {
  const w = it.w;
  const d = it.d;
  const sd = Math.min(it.seatDepth ?? d * 0.6, d);
  const cw = Math.min(it.chaiseWidth ?? w * 0.4, w);
  const L = -w / 2;
  const R = w / 2;
  const T = -d / 2;
  const B = d / 2;
  if (it.chaiseSide === 'left') return `M${f2(L)} ${f2(T)}H${f2(R)}V${f2(T + sd)}H${f2(L + cw)}V${f2(B)}H${f2(L)}Z`;
  return `M${f2(L)} ${f2(T)}H${f2(R)}V${f2(B)}H${f2(R - cw)}V${f2(T + sd)}H${f2(L)}Z`;
}

function itemLabelPoint(it: Item): Vec {
  if (it.shape !== 'L') return [it.x, it.y];
  const sd = Math.min(it.seatDepth ?? it.d * 0.6, it.d);
  const cw = Math.min(it.chaiseWidth ?? it.w * 0.4, it.w);
  const p = rotate([it.chaiseSide === 'left' ? cw / 4 : -cw / 4, -it.d / 2 + sd / 2], it.rot ?? 0);
  return [it.x + p[0], it.y + p[1]];
}

export function renderPlan(plan: Plan, opts: PlanOptions = {}): El {
  const th = opts.theme ?? LIGHT;
  const units = opts.units ?? plan.units ?? 'in';
  const fs = baseFont(plan);
  const T = WALL_T;
  const defs = new PaintDefs(plan.sketches ?? []);
  const frames = wallFrames(plan);
  const sel = opts.selection ?? null;
  const interactive = !!opts.interactive;
  const outer = offsetPolygon(plan, T);
  const changed = new Set(opts.changed ?? []);

  // ---- viewBox
  const itemPts = plan.items.flatMap((it) => {
    const ex = itemExtent(it, [1, 0]);
    const ey = itemExtent(it, [0, 1]);
    return [[it.x - ex, it.y - ey], [it.x + ex, it.y + ey]] as Vec[];
  });
  const vb = bounds([...offsetPolygon(plan, T + 26), ...itemPts]);
  const margin = fs * 1.5;
  const capH = opts.caption ? fs * 4 : 0;
  const vx = vb.x0 - margin;
  const vy = vb.y0 - margin;
  const vw = vb.x1 - vb.x0 + margin * 2;
  const vh = vb.y1 - vb.y0 + margin * 2 + capH;

  const layers: El[] = [];

  // ---- floor and grid
  const floorFill = defs.fill(plan.floor, th.sheet);
  layers.push(h('rect', { x: f2(vx), y: f2(vy), width: f2(vw), height: f2(vh), fill: th.paper, 'data-bg': interactive ? '1' : undefined }));
  layers.push(h('polygon', { points: pts(plan.verts), fill: floorFill, 'data-bg': interactive ? '1' : undefined }));
  if (opts.grid !== false) {
    const rb = bounds(plan.verts);
    const g: El[] = [];
    for (let x = Math.ceil(rb.x0 / 12) * 12; x <= rb.x1; x += 12)
      g.push(h('line', { x1: x, y1: f2(rb.y0), x2: x, y2: f2(rb.y1) }));
    for (let y = Math.ceil(rb.y0 / 12) * 12; y <= rb.y1; y += 12)
      g.push(h('line', { x1: f2(rb.x0), y1: y, x2: f2(rb.x1), y2: y }));
    layers.push(
      h('clipPath', { id: 'roomclip' }, h('polygon', { points: pts(plan.verts) })),
      h('g', { 'clip-path': 'url(#roomclip)', stroke: plan.floor ? th.ink : th.grid, 'stroke-opacity': plan.floor ? 0.12 : 1, 'stroke-width': 0.4, 'pointer-events': 'none' }, ...g),
    );
  }

  // ---- hearths and art sit on the floor/wall below furniture
  const under: El[] = [];
  plan.walls.forEach((w, i) => {
    const f = frames[i];
    (w.features ?? []).forEach((ft) => {
      if (ft.kind === 'fireplace') {
        const depth = Math.max(ft.depth ?? 0, 1.5);
        const g = h('g', { transform: frameMatrix(f) });
        g.c.push(h('rect', { x: f2(ft.at), y: 0, width: f2(ft.w), height: f2(depth), fill: th.hearth, stroke: th.ink, 'stroke-width': 0.5, 'stroke-dasharray': ft.est ? '2 1.5' : undefined }));
        under.push(g);
      }
    });
  });
  layers.push(...under);

  // ---- items: rugs first, ceiling lights last (they're overhead)
  const layerOf = (it: Item) => (itemType(it) === 'rug' ? 0 : itemType(it) === 'light' ? 2 : 1);
  const items = [...plan.items].sort((a, b) => layerOf(a) - layerOf(b));
  const itemLayer = h('g', {});
  for (const it of items) itemLayer.c.push(drawItem(it));
  for (const g of opts.ghosts ?? []) itemLayer.c.push(drawGhost(g));
  layers.push(itemLayer);

  // ---- walls
  const wallLayer = h('g', {});
  frames.forEach((_, i) => {
    const n = frames.length;
    const quad = [plan.verts[i], plan.verts[(i + 1) % n], outer[(i + 1) % n], outer[i]];
    const w = plan.walls[i];
    const fill = w.paint ? defs.fill(w.paint, th.wall) : th.wall;
    wallLayer.c.push(
      h('polygon', {
        points: pts(quad),
        fill,
        stroke: fill,
        'stroke-width': 0.2,
        'data-wall': interactive ? String(i) : undefined,
        style: interactive ? 'cursor:pointer' : undefined,
      }),
    );
  });
  wallLayer.c.push(h('polygon', { points: pts(plan.verts), fill: 'none', stroke: th.ink, 'stroke-width': 0.7, 'pointer-events': 'none' }));
  wallLayer.c.push(h('polygon', { points: pts(outer), fill: 'none', stroke: th.ink, 'stroke-width': 0.5, 'pointer-events': 'none' }));
  plan.walls.forEach((w, i) => {
    if (w.est) {
      const f = frames[i];
      wallLayer.c.push(h('line', { x1: f2(f.a[0]), y1: f2(f.a[1]), x2: f2(f.b[0]), y2: f2(f.b[1]), stroke: th.warn, 'stroke-width': 0.8, 'stroke-dasharray': '2 1.5', 'pointer-events': 'none' }));
    }
  });
  layers.push(wallLayer);

  // ---- features
  plan.walls.forEach((w, i) => {
    const f = frames[i];
    (w.features ?? []).forEach((ft, k) => layers.push(drawFeature(f, ft, i, k)));
  });

  // ---- dimension chains and wall names
  frames.forEach((f, i) => layers.push(wallDims(f, i)));

  // ---- selection overlays
  if (sel?.kind === 'item') {
    const it = plan.items.find((x) => x.id === sel.id);
    if (it) {
      if (opts.guides !== false) layers.push(guides(it));
      if (interactive) layers.push(handles(it));
    }
  }
  if (sel?.kind === 'wall' && frames[sel.wall]) {
    const f = frames[sel.wall];
    layers.push(h('line', { x1: f2(f.a[0]), y1: f2(f.a[1]), x2: f2(f.b[0]), y2: f2(f.b[1]), stroke: th.sel, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'pointer-events': 'none' }));
  }
  if (interactive && opts.mode === 'room') layers.push(roomHandles());

  if (opts.caption) {
    const y = vb.y1 + margin + fs * 1.6;
    layers.push(
      h('text', { x: f2(vb.x0), y: f2(y), 'font-size': f2(fs * 1.3), fill: th.ink, 'font-weight': 600 }, plan.name || 'Room'),
      h('text', { x: f2(vb.x0), y: f2(y + fs * 1.6), 'font-size': f2(fs * 0.85), fill: th.ink2 }, `Grid squares are 1 ft. Dashed outlines are estimates. Made with decoroom.`),
    );
  }

  const d = defs.el();
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}`,
      width: opts.width ? opts.width : undefined,
      height: opts.width ? Math.round((opts.width * vh) / vw) : undefined,
      'font-family': th.font,
      role: 'img',
      'aria-label': `Floor plan of ${plan.name || 'the room'}`,
    },
    d,
    ...layers,
  );

  // ---------- helpers (closures over theme and options)

  function drawItem(it: Item): El {
    const type = itemType(it);
    const paint = itemPaint(it);
    const c1 = hex(paint.color ?? '999');
    const fill = defs.fill(paint, c1);
    const isSel = sel?.kind === 'item' && sel.id === it.id;
    const isChanged = changed.has(it.id);
    const stroke = isSel ? th.sel : isChanged ? th.changed : th.ink;
    const st: Attrs = {
      fill,
      stroke,
      'stroke-width': isSel || isChanged ? 1.3 : 0.6,
      'stroke-dasharray': it.est ? '2.5 1.5' : undefined,
    };
    if (type === 'rug') st['fill-opacity'] = 0.9;
    const g = h('g', {
      transform: `translate(${f2(it.x)} ${f2(it.y)})${it.rot ? ` rotate(${f2(it.rot)})` : ''}`,
      'data-item': interactive ? it.id : undefined,
      style: interactive ? 'cursor:move' : undefined,
    });
    const hw = it.w / 2;
    const hd = it.d / 2;
    if (type === 'light') return drawLight(it, g, st);
    const deco = { fill: inkOn(c1), 'fill-opacity': 0.16, 'pointer-events': 'none' };
    if (it.shape === 'round') {
      g.c.push(h('ellipse', { cx: 0, cy: 0, rx: f2(hw), ry: f2(hd), ...st }));
      if (type === 'lamp') g.c.push(h('ellipse', { cx: 0, cy: 0, rx: f2(hw * 0.45), ry: f2(hd * 0.45), fill: 'none', stroke: inkOn(c1), 'stroke-opacity': 0.5, 'stroke-width': 0.4 }));
      if (type === 'plant') {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          g.c.push(h('ellipse', { cx: f2(Math.cos(a) * hw * 0.5), cy: f2(Math.sin(a) * hd * 0.5), rx: f2(hw * 0.35), ry: f2(hd * 0.2), transform: `rotate(${k * 60} ${f2(Math.cos(a) * hw * 0.5)} ${f2(Math.sin(a) * hd * 0.5)})`, ...deco }));
        }
      }
    } else if (it.shape === 'L') {
      g.c.push(h('path', { d: lPath(it), ...st }));
      const sd = Math.min(it.seatDepth ?? it.d * 0.6, it.d);
      g.c.push(h('rect', { x: f2(-hw), y: f2(-hd), width: f2(it.w), height: f2(Math.min(8, sd / 4)), ...deco }));
      const cw = Math.min(it.chaiseWidth ?? it.w * 0.4, it.w);
      const cx = it.chaiseSide === 'left' ? -hw + cw : hw - cw;
      g.c.push(h('line', { x1: f2(cx), y1: f2(-hd + Math.min(8, sd / 4)), x2: f2(cx), y2: f2(-hd + sd), stroke: inkOn(c1), 'stroke-opacity': 0.35, 'stroke-width': 0.35 }));
    } else {
      g.c.push(h('rect', { x: f2(-hw), y: f2(-hd), width: f2(it.w), height: f2(it.d), rx: it.radius ? f2(it.radius) : undefined, ...st }));
      if (type === 'seat' && it.d > 8) {
        const back = Math.min(8, it.d * 0.25);
        g.c.push(h('rect', { x: f2(-hw), y: f2(-hd), width: f2(it.w), height: f2(back), ...deco }));
        if (it.w > 40) {
          const arm = Math.min(5, it.w * 0.08);
          g.c.push(h('rect', { x: f2(-hw), y: f2(-hd + back), width: f2(arm), height: f2(it.d - back), ...deco }));
          g.c.push(h('rect', { x: f2(hw - arm), y: f2(-hd + back), width: f2(arm), height: f2(it.d - back), ...deco }));
        }
      } else if (type === 'storage' && it.d > 4) {
        g.c.push(h('line', { x1: f2(-hw + 1), y1: f2(hd - 1.2), x2: f2(hw - 1), y2: f2(hd - 1.2), stroke: inkOn(c1), 'stroke-opacity': 0.4, 'stroke-width': 0.35 }));
      } else if (type === 'bed') {
        const pw = Math.min(it.w / 2 - 3, 26);
        g.c.push(h('rect', { x: f2(-pw - 1), y: f2(-hd + 2), width: f2(pw), height: 9, rx: 2, ...deco, 'fill-opacity': 0.25 }));
        g.c.push(h('rect', { x: 1, y: f2(-hd + 2), width: f2(pw), height: 9, rx: 2, ...deco, 'fill-opacity': 0.25 }));
        g.c.push(h('line', { x1: f2(-hw), y1: f2(-hd + it.d * 0.35), x2: f2(hw), y2: f2(-hd + it.d * 0.35), stroke: inkOn(c1), 'stroke-opacity': 0.35, 'stroke-width': 0.4 }));
      }
    }
    // Label, unrotated; runs vertically on tall, narrow pieces.
    const lp = itemLabelPoint(it);
    const ex = itemExtent(it, [1, 0]) * 2;
    const ey = itemExtent(it, [0, 1]) * 2;
    const vertical = ey > ex * 1.4 && type !== 'rug';
    const along = vertical ? ey : ex;
    const across = vertical ? ex : ey;
    const lfs = Math.max(2.4, Math.min(fs * 0.85, across / 3.2, along / 5));
    const maxChars = Math.max(4, Math.floor((along * 0.92) / (lfs * 0.62)));
    const name = it.name || type;
    const label = name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
    const ink = inkOn(c1);
    const lg = h('g', { 'pointer-events': 'none', transform: vertical ? `rotate(-90 ${f2(lp[0])} ${f2(lp[1])})` : undefined });
    let ly = lp[1];
    if (type === 'rug') ly = it.y + ey / 2 - lfs * 2.4;
    lg.c.push(h('text', { x: f2(lp[0]), y: f2(ly - lfs * 0.15), 'font-size': f2(lfs), 'text-anchor': 'middle', fill: ink, 'font-weight': 500 }, label));
    lg.c.push(h('text', { x: f2(lp[0]), y: f2(ly + lfs * 1.05), 'font-size': f2(lfs * 0.8), 'text-anchor': 'middle', fill: ink, 'fill-opacity': 0.75 }, `${dimStr(it.w)}×${dimStr(it.d)}${it.est ? ' est' : ''}`));
    return h('g', {}, g, lg);
  }

  /** A ceiling light seen from below: the shade, its lit inside, and short rays. */
  function drawLight(it: Item, g: El, st: Attrs): El {
    const paint = itemPaint(it);
    const hw = it.w / 2;
    const hd = it.d / 2;
    const round = it.shape !== 'rect';
    const shape = (sx: number, extra: Attrs) =>
      round
        ? h('ellipse', { cx: 0, cy: 0, rx: f2(hw * sx), ry: f2(hd * sx), ...extra })
        : h('rect', { x: f2(-hw * sx), y: f2(-hd * sx), width: f2(it.w * sx), height: f2(it.d * sx), rx: 1, ...extra });
    // With a solid shade, the second color is the inside of the shade.
    const inside = hex(!paint.pattern || paint.pattern === 'solid' ? (paint.color2 ?? LIGHT_GLOW) : LIGHT_GLOW);
    g.c.push(shape(1, { ...st, 'fill-opacity': 0.6 }));
    g.c.push(shape(0.62, { fill: inside, 'pointer-events': 'none' }));
    g.c.push(shape(0.32, { fill: '#fffaf0', 'pointer-events': 'none' }));
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const [c, sn] = [Math.cos(a), Math.sin(a)];
      g.c.push(h('line', { x1: f2(c * (hw + 1.5)), y1: f2(sn * (hd + 1.5)), x2: f2(c * (hw + 4.5)), y2: f2(sn * (hd + 4.5)), stroke: th.ink, 'stroke-opacity': 0.5, 'stroke-width': 0.5, 'stroke-linecap': 'round', 'pointer-events': 'none' }));
    }
    const lfs = Math.max(2.4, fs * 0.6);
    const label = h('text', { x: f2(it.x), y: f2(it.y + Math.max(hw, hd) + 4.5 + lfs * 1.1), 'font-size': f2(lfs), 'text-anchor': 'middle', fill: th.ink2, 'pointer-events': 'none' }, it.name || 'Ceiling light');
    return h('g', {}, g, label);
  }

  function dimStr(n: number) {
    return units === 'cm' ? `${Math.round(n * 2.54)}` : `${Math.round(n * 2) / 2}`.replace('.5', '½');
  }

  function drawGhost(it: Item): El {
    const hw = it.w / 2;
    const hd = it.d / 2;
    const shape =
      it.shape === 'round'
        ? h('ellipse', { cx: 0, cy: 0, rx: f2(hw), ry: f2(hd) })
        : it.shape === 'L'
          ? h('path', { d: lPath(it) })
          : h('rect', { x: f2(-hw), y: f2(-hd), width: f2(it.w), height: f2(it.d) });
    shape.a = { ...shape.a, fill: 'none', stroke: th.changed, 'stroke-width': 0.7, 'stroke-dasharray': '1.5 1.5' };
    const now = plan.items.find((x) => x.id === it.id);
    return h(
      'g',
      { 'pointer-events': 'none' },
      h('g', { transform: `translate(${f2(it.x)} ${f2(it.y)})${it.rot ? ` rotate(${f2(it.rot)})` : ''}` }, shape),
      now && Math.hypot(now.x - it.x, now.y - it.y) > 2
        ? h('line', { x1: f2(it.x), y1: f2(it.y), x2: f2(now.x), y2: f2(now.y), stroke: th.changed, 'stroke-width': 0.6, 'marker-end': undefined, 'stroke-dasharray': '1 1' })
        : null,
    );
  }

  function drawFeature(f: WallFrame, ft: Feature, wi: number, k: number): El {
    const g = h('g', { transform: frameMatrix(f) });
    const a = ft.at;
    const b = ft.at + ft.w;
    const dash = ft.est ? '2 1.5' : undefined;
    const isSel = sel?.kind === 'feature' && sel.wall === wi && sel.index === k;
    const cutsWall = ft.kind !== 'art' && ft.kind !== 'fireplace';
    if (cutsWall) {
      g.c.push(h('rect', { x: f2(a), y: f2(-T - 0.4), width: f2(ft.w), height: f2(T + 0.8), fill: th.sheet }));
      g.c.push(h('line', { x1: f2(a), y1: -T, x2: f2(a), y2: 0, stroke: th.ink, 'stroke-width': 0.6 }));
      g.c.push(h('line', { x1: f2(b), y1: -T, x2: f2(b), y2: 0, stroke: th.ink, 'stroke-width': 0.6 }));
    }
    switch (ft.kind) {
      case 'door': {
        const hinge = ft.hinge === 'end' ? b : a;
        const s = ft.hinge === 'end' ? -1 : 1;
        const w = ft.w;
        if (ft.swing === 'out') {
          g.c.push(h('line', { x1: f2(hinge), y1: -T, x2: f2(hinge), y2: f2(-T - w), stroke: th.ink, 'stroke-width': 1 }));
          g.c.push(h('path', { d: `M${f2(hinge)} ${f2(-T - w)}A${f2(w)} ${f2(w)} 0 0 ${s > 0 ? 1 : 0} ${f2(hinge + s * w)} ${-T}`, fill: 'none', stroke: th.ink2, 'stroke-width': 0.45, 'stroke-dasharray': dash }));
        } else {
          g.c.push(h('line', { x1: f2(hinge), y1: 0, x2: f2(hinge), y2: f2(w), stroke: th.ink, 'stroke-width': 1 }));
          g.c.push(h('path', { d: `M${f2(hinge)} ${f2(w)}A${f2(w)} ${f2(w)} 0 0 ${s > 0 ? 0 : 1} ${f2(hinge + s * w)} 0`, fill: 'none', stroke: th.ink2, 'stroke-width': 0.45, 'stroke-dasharray': dash }));
        }
        break;
      }
      case 'slider':
        g.c.push(h('rect', { x: f2(a), y: f2(-T * 0.72), width: f2(ft.w * 0.55), height: 1.2, fill: th.ink, opacity: 0.8 }));
        g.c.push(h('rect', { x: f2(b - ft.w * 0.55), y: f2(-T * 0.42), width: f2(ft.w * 0.55), height: 1.2, fill: th.ink, opacity: 0.8 }));
        break;
      case 'opening':
        g.c.push(h('line', { x1: f2(a), y1: f2(-T / 2), x2: f2(b), y2: f2(-T / 2), stroke: th.ink2, 'stroke-width': 0.45, 'stroke-dasharray': '3 2' }));
        break;
      case 'window':
        g.c.push(h('rect', { x: f2(a), y: f2(-T * 0.7), width: f2(ft.w), height: f2(T * 0.4), fill: th.glass, stroke: th.ink, 'stroke-width': 0.4 }));
        break;
      case 'fireplace': {
        const fb = Math.min(ft.w * 0.62, ft.w - 4);
        const x0 = a + (ft.w - fb) / 2;
        g.c.push(h('path', { d: `M${f2(x0)} 0L${f2(x0 + 2)} ${f2(-T + 1)}H${f2(x0 + fb - 2)}L${f2(x0 + fb)} 0Z`, fill: th.firebox }));
        break;
      }
      case 'art': {
        const sk = ft.paint?.sketch !== undefined ? plan.sketches?.[ft.paint.sketch] : undefined;
        if (sk) g.c.push(sketchInBox(sk, a, 0.4, ft.w, 1.8, { 'pointer-events': 'none' }));
        else g.c.push(h('rect', { x: f2(a), y: 0.4, width: f2(ft.w), height: 1.8, fill: defs.fill(ft.paint, '#c97b4a') }));
        g.c.push(h('rect', { x: f2(a), y: 0.4, width: f2(ft.w), height: 1.8, fill: 'none', stroke: th.ink, 'stroke-width': 0.35, 'stroke-dasharray': dash }));
        break;
      }
    }
    if (ft.est && cutsWall && ft.kind !== 'door')
      g.c.push(h('rect', { x: f2(a), y: -T, width: f2(ft.w), height: T, fill: 'none', stroke: th.warn, 'stroke-width': 0.4, 'stroke-dasharray': '2 1.5' }));
    if (isSel) g.c.push(h('rect', { x: f2(a - 0.8), y: f2(-T - 1.2), width: f2(ft.w + 1.6), height: f2(T + 4), fill: 'none', stroke: th.sel, 'stroke-width': 1.1, rx: 1, 'pointer-events': 'none' }));
    if (interactive) {
      const depth = ft.kind === 'fireplace' ? Math.max(ft.depth ?? 0, 3) : 3;
      g.c.push(h('rect', { x: f2(a), y: f2(-T - 1), width: f2(ft.w), height: f2(T + 1 + depth), fill: 'transparent', 'data-feat': `${wi}:${k}`, style: 'cursor:grab' }));
    }
    // Label outside the wall. Art shares the wall with what's under it, so it's labeled only when selected.
    if (ft.kind === 'art' && !isSel) return g;
    const mid = (a + b) / 2;
    const label = `${ft.label || ft.kind} ${fmtLen(ft.w, units)}`;
    return h('g', {}, g, textAt(wallPoint(f, mid, -T - fs * 0.75), f.u, label, { 'font-size': f2(fs * 0.72), fill: isSel ? th.sel : th.ink2, 'pointer-events': 'none' }));
  }

  function wallDims(f: WallFrame, i: number): El {
    const g = h('g', { 'pointer-events': 'none' });
    const feats = (plan.walls[i].features ?? []).filter((x) => x.kind !== 'art').sort((p, q) => p.at - q.at);
    const v = -T - fs * 2.2;
    const L = f.len;
    const ticks = [0];
    for (const x of feats) ticks.push(x.at, x.at + x.w);
    ticks.push(L);
    const stops = [...new Set(ticks.map((t) => f2(t)))].sort((p, q) => p - q);
    const loc = h('g', { transform: frameMatrix(f) });
    if (feats.length) {
      loc.c.push(h('line', { x1: 0, y1: f2(v), x2: f2(L), y2: f2(v), stroke: th.ink2, 'stroke-width': 0.3 }));
      for (const t of stops) loc.c.push(h('line', { x1: f2(t), y1: f2(v - 1.4), x2: f2(t), y2: f2(v + 1.4), stroke: th.ink2, 'stroke-width': 0.45 }));
      for (let k = 0; k < stops.length - 1; k++) {
        const s = stops[k + 1] - stops[k];
        if (s < 2.5) continue;
        const small = s < fs * 3.2;
        g.c.push(textAt(wallPoint(f, (stops[k] + stops[k + 1]) / 2, v - fs * 0.55), f.u, small ? `${dimStr(s)}` : fmtLen(s, units), { 'font-size': f2(fs * (small ? 0.55 : 0.66)), fill: th.ink2 }));
      }
    }
    g.c.unshift(loc);
    // Wall name and total length on the outer row.
    const nameRow = feats.length ? v - fs * 1.9 : v + fs * 0.2;
    const w = plan.walls[i];
    const total = `${wallName(plan, i)} · ${fmtLen(L, units)}${w.est ? ' est.' : ''}`;
    if (L > fs * 4) g.c.push(textAt(wallPoint(f, L / 2, nameRow), f.u, total, { 'font-size': f2(fs * 0.78), fill: w.est ? th.warn : th.ink, 'font-weight': 500 }));
    return g;
  }

  function guides(it: Item): El {
    const g = h('g', { 'pointer-events': 'none' });
    // Clearances (dashed) first, then anchors on top.
    for (const c of clearances(plan, it)) {
      if (c.dist < 1) continue;
      const mid: Vec = [(c.from[0] + c.end[0]) / 2, (c.from[1] + c.end[1]) / 2];
      const u: Vec = [1, 0];
      g.c.push(h('line', { x1: f2(c.from[0]), y1: f2(c.from[1]), x2: f2(c.end[0]), y2: f2(c.end[1]), stroke: th.sel, 'stroke-width': 0.45, 'stroke-dasharray': '1.5 1' }));
      for (const p of [c.from, c.end]) g.c.push(h('circle', { cx: f2(p[0]), cy: f2(p[1]), r: 0.7, fill: th.sel }));
      const text = `${fmtLen(c.dist, units)} to ${c.to}`;
      const vert = c.dir === 'up' || c.dir === 'down';
      const half = (text.length * fs * 0.62 * 0.6) / 2 + 2;
      g.c.push(pill(vert ? [mid[0] + half + 1, mid[1]] : mid, u, text, th.sel));
    }
    for (const a of it.anchors ?? []) {
      const f = wallFrame(plan, a.wall);
      const ext = itemExtent(it, f.n);
      const k = a.edge === 'center' ? 0 : a.edge === 'far' ? ext : -ext;
      const p: Vec = [it.x + f.n[0] * k, it.y + f.n[1] * k];
      const d = anchorDistance(plan, it, a);
      const q: Vec = [p[0] - f.n[0] * d, p[1] - f.n[1] * d];
      g.c.push(h('line', { x1: f2(p[0]), y1: f2(p[1]), x2: f2(q[0]), y2: f2(q[1]), stroke: th.anchor, 'stroke-width': 0.8 }));
      // Edge marker across the anchored edge.
      const t = f.u;
      g.c.push(h('line', { x1: f2(p[0] - t[0] * 2.5), y1: f2(p[1] - t[1] * 2.5), x2: f2(p[0] + t[0] * 2.5), y2: f2(p[1] + t[1] * 2.5), stroke: th.anchor, 'stroke-width': 1 }));
      g.c.push(h('circle', { cx: f2(q[0]), cy: f2(q[1]), r: 1, fill: th.anchor }));
      const mid: Vec = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const edge = a.edge === 'center' ? 'center' : a.edge === 'far' ? 'far edge' : 'edge';
      const text = `${edge} ${fmtLen(d, units)} from ${wallName(plan, a.wall)}`;
      const half = (text.length * fs * 0.62 * 0.6) / 2 + 2;
      g.c.push(pill([mid[0] + t[0] * (half + 1.5), mid[1] + t[1] * (half + 1.5)], t, text, th.anchor));
    }
    return g;
  }

  function pill(p: Vec, u: Vec, s: string, color: string): El {
    const pfs = fs * 0.62;
    const w = s.length * pfs * 0.6 + 2;
    const a = readableAngle(u);
    return h(
      'g',
      { transform: `translate(${f2(p[0])} ${f2(p[1])})${a ? ` rotate(${a})` : ''}` },
      h('rect', { x: f2(-w / 2), y: f2(-pfs * 0.8), width: f2(w), height: f2(pfs * 1.6), rx: 1, fill: th.sheet, stroke: color, 'stroke-width': 0.3 }),
      h('text', { x: 0, y: f2(pfs * 0.05), 'font-size': f2(pfs), fill: color, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, s),
    );
  }

  function handles(it: Item): El {
    const k = fs / 4.2;
    const g = h('g', { transform: `translate(${f2(it.x)} ${f2(it.y)})${it.rot ? ` rotate(${f2(it.rot)})` : ''}` });
    const off = it.d / 2 + 8 * k;
    g.c.push(h('line', { x1: 0, y1: f2(-it.d / 2), x2: 0, y2: f2(-off), stroke: th.sel, 'stroke-width': 0.5 }));
    g.c.push(h('circle', { cx: 0, cy: f2(-off), r: f2(3 * k), fill: th.sheet, stroke: th.sel, 'stroke-width': 1, 'data-h': 'rot', style: 'cursor:grab' }));
    g.c.push(h('rect', { x: f2(it.w / 2 - 3 * k), y: f2(it.d / 2 - 3 * k), width: f2(6 * k), height: f2(6 * k), fill: th.sel, 'data-h': 'size', style: 'cursor:nwse-resize' }));
    return g;
  }

  function roomHandles(): El {
    const g = h('g', {});
    const r = fs * 0.85;
    frames.forEach((f, i) => {
      const m = wallPoint(f, f.len / 2, r * 1.8);
      g.c.push(
        h('g', { 'data-split': String(i), style: 'cursor:copy' },
          h('circle', { cx: f2(m[0]), cy: f2(m[1]), r: f2(r * 0.8), fill: th.sheet, stroke: th.sel, 'stroke-width': 0.5, 'stroke-dasharray': '1 0.8' }),
          h('path', { d: `M${f2(m[0] - r * 0.45)} ${f2(m[1])}h${f2(r * 0.9)}M${f2(m[0])} ${f2(m[1] - r * 0.45)}v${f2(r * 0.9)}`, stroke: th.sel, 'stroke-width': 0.5, 'pointer-events': 'none' }),
        ),
      );
    });
    plan.verts.forEach((v, i) => {
      g.c.push(h('circle', { cx: f2(v[0]), cy: f2(v[1]), r: f2(r), fill: th.sel, stroke: th.sheet, 'stroke-width': 0.6, 'data-vert': String(i), style: 'cursor:move' }));
    });
    return g;
  }
}
