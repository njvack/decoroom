import { featureBottom, featureHeight, isOverhead, itemHeight, itemPaint, itemType, LIGHT_GLOW } from '../model/defaults';
import { wallName } from '../model/estimates';
import { itemCorners, itemExtent, wallDistance, wallFrame, wallParam } from '../model/geometry';
import { DEFAULT_CEILING, type Plan, type Units } from '../model/types';
import { fmtLen } from '../model/units';
import { f2, h, type El } from './el';
import { hex, inkOn, PaintDefs, sketchInBox } from './patterns';
import { LIGHT, type Theme } from './theme';

export interface ElevationOptions {
  theme?: Theme;
  units?: Units;
  /** Pieces whose near edge is within this many inches of the wall are drawn. */
  depth?: number;
  interactive?: boolean;
  selectedFeature?: number;
  width?: number;
}

/**
 * Straight-on view of wall `wi` from inside the room. x runs along the wall
 * from its start corner (which is on the viewer's left); y is height, floor at the bottom.
 */
export function renderElevation(plan: Plan, wi: number, opts: ElevationOptions = {}): El {
  const th = opts.theme ?? LIGHT;
  const units = opts.units ?? plan.units ?? 'in';
  const f = wallFrame(plan, wi);
  const L = f.len;
  const H = plan.ceiling && plan.ceiling > 0 ? plan.ceiling : DEFAULT_CEILING;
  const fs = Math.min(7, Math.max(3.2, Math.max(L, H) / 48));
  const defs = new PaintDefs(plan.sketches ?? [], 'e');
  const wall = plan.walls[wi];
  const Y = (height: number) => f2(H - height);
  const labelFits = (text: string, w: number, ht: number) => text.length * fs * 0.7 * 0.62 < w - 2 || text.length * fs * 0.7 * 0.62 > ht - 2;
  const m = fs * 3;
  const out: El[] = [];

  out.push(h('rect', { x: f2(-m), y: f2(-m), width: f2(L + 2 * m), height: f2(H + 2 * m + fs * 2), fill: th.paper }));
  out.push(h('rect', { x: 0, y: 0, width: f2(L), height: f2(H), fill: defs.fill(wall.paint, th.sheet), stroke: th.ink, 'stroke-width': 0.6 }));

  // Features, back to front: openings, fireplace, art.
  const feats = (wall.features ?? []).map((ft, k) => ({ ft, k }));
  const order = { opening: 0, door: 0, slider: 0, window: 0, fireplace: 1, art: 2 } as const;
  feats.sort((a, b) => order[a.ft.kind] - order[b.ft.kind]);
  for (const { ft, k } of feats) {
    const fh = featureHeight(ft);
    const fb = featureBottom(ft);
    const x = f2(ft.at);
    const w = f2(ft.w);
    const dash = ft.est ? '2 1.5' : undefined;
    const g = h('g', { 'data-feat': opts.interactive ? `${wi}:${k}` : undefined, style: opts.interactive ? 'cursor:grab' : undefined });
    switch (ft.kind) {
      case 'opening':
        g.c.push(h('rect', { x, y: Y(fh), width: w, height: f2(fh), fill: th.paper, stroke: th.ink, 'stroke-width': 0.5, 'stroke-dasharray': dash }));
        break;
      case 'door': {
        g.c.push(h('rect', { x, y: Y(fh), width: w, height: f2(fh), fill: defs.fill(ft.paint, '#c9a272'), stroke: th.ink, 'stroke-width': 0.6, 'stroke-dasharray': dash }));
        const knobX = ft.hinge === 'end' ? ft.at + 3 : ft.at + ft.w - 3;
        g.c.push(h('circle', { cx: f2(knobX), cy: Y(36), r: 1.2, fill: th.ink }));
        break;
      }
      case 'slider':
        g.c.push(h('rect', { x, y: Y(fh), width: w, height: f2(fh), fill: th.glass, stroke: th.ink, 'stroke-width': 0.6, 'stroke-dasharray': dash }));
        g.c.push(h('line', { x1: f2(ft.at + ft.w / 2), y1: Y(fh), x2: f2(ft.at + ft.w / 2), y2: Y(0), stroke: th.ink, 'stroke-width': 1 }));
        break;
      case 'window':
        g.c.push(h('rect', { x, y: Y(fb + fh), width: w, height: f2(fh), fill: th.glass, stroke: th.ink, 'stroke-width': 0.8, 'stroke-dasharray': dash }));
        g.c.push(h('line', { x1: x, y1: Y(fb + fh / 2), x2: f2(ft.at + ft.w), y2: Y(fb + fh / 2), stroke: th.ink, 'stroke-width': 0.4 }));
        break;
      case 'fireplace': {
        g.c.push(h('rect', { x, y: Y(fh), width: w, height: f2(fh), fill: th.hearth, stroke: th.ink, 'stroke-width': 0.6, 'stroke-dasharray': dash }));
        g.c.push(h('rect', { x: f2(ft.at - 3), y: Y(fh + 2), width: f2(ft.w + 6), height: 2, fill: th.hearth, stroke: th.ink, 'stroke-width': 0.5 }));
        const box = Math.min(ft.w * 0.62, ft.w - 4);
        g.c.push(h('rect', { x: f2(ft.at + (ft.w - box) / 2), y: Y(Math.min(fh - 8, 30)), width: f2(box), height: f2(Math.min(fh - 8, 30) - 4), fill: th.firebox }));
        break;
      }
      case 'art': {
        const sk = ft.paint?.sketch !== undefined ? plan.sketches?.[ft.paint.sketch] : undefined;
        if (sk) g.c.push(sketchInBox(sk, ft.at, H - fb - fh, ft.w, fh));
        else g.c.push(h('rect', { x, y: Y(fb + fh), width: w, height: f2(fh), fill: defs.fill(ft.paint, '#c97b4a') }));
        g.c.push(h('rect', { x, y: Y(fb + fh), width: w, height: f2(fh), fill: 'none', stroke: th.ink, 'stroke-width': 1, 'stroke-dasharray': dash }));
        break;
      }
    }
    if (opts.selectedFeature === k)
      g.c.push(h('rect', { x: f2(ft.at - 1), y: Y(fb + fh + 1), width: f2(ft.w + 2), height: f2(fh + 2), fill: 'none', stroke: th.sel, 'stroke-width': 1.2 }));
    if (ft.label) g.c.push(h('text', { x: f2(ft.at + ft.w / 2), y: f2(H - fb - fh - fs * 0.5), 'font-size': f2(fs * 0.7), 'text-anchor': 'middle', fill: th.ink2 }, ft.label));
    out.push(g);
  }

  // Furniture near the wall, farthest first.
  const depth = opts.depth ?? 36;
  const near = plan.items
    .map((it) => {
      const d = wallDistance(f, [it.x, it.y]) - itemExtent(it, f.n);
      const ts = itemCorners(it).map((p) => wallParam(f, p));
      return { it, d, t0: Math.max(0, Math.min(...ts)), t1: Math.min(L, Math.max(...ts)) };
    })
    .filter((x) => (x.d <= depth || isOverhead(x.it)) && x.d > -2 && x.t1 > x.t0 + 0.5 && itemType(x.it) !== 'rug')
    .sort((a, b) => b.d - a.d);
  for (const { it, d, t0, t1 } of near) {
    const ih = itemHeight(it);
    const p = itemPaint(it);
    const c1 = hex(p.color ?? '999');
    const op = f2(1 - Math.min(0.45, d / depth / 2));
    if (isOverhead(it)) {
      // Hangs from the ceiling: a stem if it drops far, then the shade, lit along the bottom.
      const body = Math.min(ih, 12);
      const stem = ih - body;
      const cx = (t0 + t1) / 2;
      const inside = hex(!p.pattern || p.pattern === 'solid' ? (p.color2 ?? LIGHT_GLOW) : LIGHT_GLOW);
      out.push(
        h(
          'g',
          { opacity: op },
          stem > 0 ? h('line', { x1: f2(cx), y1: 0, x2: f2(cx), y2: f2(stem), stroke: th.ink, 'stroke-width': 0.6 }) : null,
          h('rect', { x: f2(cx - 3), y: 0, width: 6, height: 1, fill: th.ink }),
          h('rect', { x: f2(t0), y: f2(stem), width: f2(t1 - t0), height: f2(body), fill: defs.fill(p, c1), stroke: th.ink, 'stroke-width': 0.5, 'stroke-dasharray': it.est ? '2 1.5' : undefined }),
          h('rect', { x: f2(t0 + 1), y: f2(stem + body - 1.2), width: f2(Math.max(0, t1 - t0 - 2)), height: 1.2, fill: inside }),
        ),
      );
      continue;
    }
    out.push(
      h(
        'g',
        { opacity: op },
        h('rect', { x: f2(t0), y: Y(ih), width: f2(t1 - t0), height: f2(ih), fill: defs.fill(p, c1), stroke: th.ink, 'stroke-width': 0.5, 'stroke-dasharray': it.est ? '2 1.5' : undefined, rx: itemType(it) === 'seat' ? 2 : 0 }),
        labelFits(it.name || itemType(it), t1 - t0, ih)
          ? h('text', { x: f2((t0 + t1) / 2), y: Y(ih / 2), 'font-size': f2(fs * 0.7), 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: inkOn(c1) }, it.name || itemType(it))
          : h('text', { x: f2((t0 + t1) / 2), y: Y(ih / 2), 'font-size': f2(fs * 0.7), 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: inkOn(c1), transform: `rotate(-90 ${f2((t0 + t1) / 2)} ${Y(ih / 2)})` }, it.name || itemType(it)),
      ),
    );
  }

  // Floor line, ceiling note, title.
  out.push(h('line', { x1: f2(-m / 2), y1: f2(H), x2: f2(L + m / 2), y2: f2(H), stroke: th.ink, 'stroke-width': 1.2 }));
  out.push(h('text', { x: 0, y: f2(-fs * 0.8), 'font-size': f2(fs), fill: th.ink, 'font-weight': 600 }, `${wallName(plan, wi)} · ${fmtLen(L, units)} wide, ${fmtLen(H, units)} ceiling`));
  out.push(h('text', { x: 0, y: f2(H + fs * 1.4), 'font-size': f2(fs * 0.7), fill: th.ink2 }, `← ${wallName(plan, (wi - 1 + plan.walls.length) % plan.walls.length)} corner`));
  out.push(h('text', { x: f2(L), y: f2(H + fs * 1.4), 'font-size': f2(fs * 0.7), fill: th.ink2, 'text-anchor': 'end' }, `${wallName(plan, (wi + 1) % plan.walls.length)} corner →`));

  const vw = L + 2 * m;
  const vh = H + 2 * m + fs * 2;
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `${f2(-m)} ${f2(-m)} ${f2(vw)} ${f2(vh)}`,
      width: opts.width,
      height: opts.width ? Math.round((opts.width * vh) / vw) : undefined,
      'font-family': th.font,
      role: 'img',
      'aria-label': `Elevation of ${wallName(plan, wi)}`,
    },
    defs.el(),
    ...out,
  );
}
