import type { Paint, Plan, Sketch } from './types';

export const SKETCH_BUDGET = 1500;
export const PLAN_SKETCH_BUDGET = 3000;

export function sketchSize(s: Sketch): number {
  return s.paths.reduce((n, p) => n + p[1].length, 0) + s.pal.length * 7;
}

export function planSketchSize(plan: Plan): number {
  return (plan.sketches ?? []).reduce((n, s) => n + sketchSize(s), 0);
}

type RGB = [number, number, number];

/** Small k-means palette reduction. Deterministic. */
export function quantize(pixels: RGB[], k: number): { pal: RGB[]; idx: number[] } {
  // Seed with evenly spaced pixels by brightness.
  const sorted = [...pixels].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let pal: RGB[] = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) * sorted.length) / k)] ?? [0, 0, 0]);
  let idx = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    idx = pixels.map((p) => {
      let best = 0;
      let bd = Infinity;
      pal.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 * 0.3 + (p[1] - c[1]) ** 2 * 0.59 + (p[2] - c[2]) ** 2 * 0.11;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    });
    const sums = pal.map(() => [0, 0, 0, 0]);
    pixels.forEach((p, i) => {
      const s = sums[idx[i]];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    });
    pal = sums.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : pal[i]) as RGB);
  }
  return { pal, idx };
}

const toHex = (c: RGB) => c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Turn a grid of palette indices into a sketch made of merged rectangles.
 * The most common color becomes the background (one rect).
 */
export function mosaicSketch(w: number, h: number, idx: number[], pal: RGB[]): Sketch {
  const counts = pal.map((_, i) => idx.filter((x) => x === i).length);
  const bg = counts.indexOf(Math.max(...counts));
  const used = new Array(w * h).fill(false);
  const rects: string[][] = pal.map(() => []);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = idx[y * w + x];
      if (used[y * w + x] || c === bg) continue;
      let rw = 1;
      while (x + rw < w && idx[y * w + x + rw] === c && !used[y * w + x + rw]) rw++;
      let rh = 1;
      outer: while (y + rh < h) {
        for (let k = 0; k < rw; k++) if (idx[(y + rh) * w + x + k] !== c || used[(y + rh) * w + x + k]) break outer;
        rh++;
      }
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) used[yy * w + xx] = true;
      rects[c].push(`M${x} ${y}h${rw}v${rh}h-${rw}z`);
    }
  }
  const order = pal.map((_, i) => i).filter((i) => i !== bg && rects[i].length);
  const outPal = [toHex(pal[bg]), ...order.map((i) => toHex(pal[i]))];
  const paths: [number, string][] = [[0, `M0 0h${w}v${h}H0z`], ...order.map((i, k): [number, string] => [k + 1, rects[i].join('')])];
  return { w, h, pal: outPal, paths };
}

/** Build the most detailed mosaic that fits the budget from an RGBA sampler. */
export function sketchFromImage(
  sample: (cols: number, rows: number) => RGB[],
  aspect: number,
  opts: { colors?: number; maxCols?: number; budget?: number } = {},
): Sketch {
  const k = opts.colors ?? 6;
  const budget = opts.budget ?? SKETCH_BUDGET;
  let cols = opts.maxCols ?? 40;
  let best: Sketch | null = null;
  while (cols >= 6) {
    const rows = Math.max(4, Math.round(cols / aspect));
    const px = sample(cols, rows);
    const q = quantize(px, k);
    const sk = mosaicSketch(cols, rows, q.idx, q.pal);
    best = sk;
    if (sketchSize(sk) <= budget) return sk;
    cols = Math.floor(cols * 0.85);
  }
  return best!;
}

/** Drop sketches nothing uses and renumber references. */
export function pruneSketches(plan: Plan): Plan {
  const sk = plan.sketches ?? [];
  if (!sk.length) return plan;
  const used = new Set<number>();
  const visit = (p?: Paint) => p?.sketch !== undefined && used.add(p.sketch);
  visit(plan.floor);
  for (const w of plan.walls) {
    visit(w.paint);
    for (const f of w.features ?? []) visit(f.paint);
  }
  for (const it of plan.items) visit(it.paint);
  if (used.size === sk.length) return plan;
  const map = new Map<number, number>();
  const keep: Sketch[] = [];
  sk.forEach((s, i) => {
    if (used.has(i)) {
      map.set(i, keep.length);
      keep.push(s);
    }
  });
  const re = (p?: Paint): Paint | undefined => {
    if (p?.sketch === undefined) return p;
    const n = map.get(p.sketch);
    if (n === undefined) {
      const { sketch: _drop, ...rest } = p;
      void _drop;
      return Object.keys(rest).length ? rest : undefined;
    }
    return { ...p, sketch: n };
  };
  const out: Plan = {
    ...plan,
    floor: re(plan.floor),
    walls: plan.walls.map((w) => ({ ...w, paint: re(w.paint), features: w.features?.map((f) => ({ ...f, paint: re(f.paint) })) })),
    items: plan.items.map((it) => ({ ...it, paint: re(it.paint) })),
    sketches: keep,
  };
  if (!keep.length) delete out.sketches;
  return out;
}
