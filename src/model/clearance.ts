import { wallName } from './estimates';
import { hearthBoxes, itemBox, rayToWalls, wallFrame, wallParam, type Box } from './geometry';
import type { Item, Plan, Vec } from './types';

export interface Clearance {
  /** Direction on screen. */
  dir: 'left' | 'right' | 'up' | 'down';
  dist: number;
  /** What the gap ends at, in words. */
  to: string;
  /** Line from the piece to the obstacle, for drawing. */
  from: Vec;
  end: Vec;
}

const DIRS: { dir: Clearance['dir']; v: Vec }[] = [
  { dir: 'left', v: [-1, 0] },
  { dir: 'right', v: [1, 0] },
  { dir: 'up', v: [0, -1] },
  { dir: 'down', v: [0, 1] },
];

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 - 0.01 && a1 > b0 + 0.01;
}

/** What a point on a wall is: an opening's label or the wall's name. */
function wallTarget(plan: Plan, wall: number, p: Vec): string {
  const f = wallFrame(plan, wall);
  const t = wallParam(f, p);
  const feat = (plan.walls[wall].features ?? []).find((x) => x.kind !== 'art' && t >= x.at && t <= x.at + x.w);
  if (feat) return (feat.label || feat.kind).toLowerCase();
  return wallName(plan, wall);
}

/** Open floor around a piece in the four screen directions, to the nearest piece or wall. */
export function clearances(plan: Plan, it: Item): Clearance[] {
  const b = itemBox(it);
  const obstacles: (Box & { name: string })[] = [
    ...plan.items.filter((o) => o.id !== it.id && o.type !== 'rug').map((o) => ({ ...itemBox(o), name: o.name || o.type || 'piece' })),
    ...hearthBoxes(plan),
  ];
  const out: Clearance[] = [];
  for (const { dir, v } of DIRS) {
    const horiz = v[1] === 0;
    const lo = horiz ? b.y0 : b.x0;
    const hi = horiz ? b.y1 : b.x1;
    const edge = v[0] < 0 ? b.x0 : v[0] > 0 ? b.x1 : v[1] < 0 ? b.y0 : b.y1;
    let best: { dist: number; to: string; m: number } | null = null;
    for (const o of obstacles) {
      const olo = horiz ? o.y0 : o.x0;
      const ohi = horiz ? o.y1 : o.x1;
      if (!overlap(olo, ohi, lo, hi)) continue;
      const oEdge = v[0] < 0 ? o.x1 : v[0] > 0 ? o.x0 : v[1] < 0 ? o.y1 : o.y0;
      const d = (oEdge - edge) * (v[0] + v[1]);
      if (d < -0.01) continue;
      if (!best || d < best.dist) best = { dist: Math.max(0, d), to: o.name, m: (Math.max(olo, lo) + Math.min(ohi, hi)) / 2 };
    }
    // Walls: cast a few rays from along the side.
    for (const k of [2, 1, 3, 0, 4]) {
      const m = lo + ((hi - lo) * k) / 4;
      const p: Vec = horiz ? [edge, m] : [m, edge];
      const r = rayToWalls(plan, p, v);
      if (r.wall >= 0 && (!best || r.dist < best.dist - 0.01)) {
        const hit: Vec = [p[0] + v[0] * r.dist, p[1] + v[1] * r.dist];
        best = { dist: r.dist, to: wallTarget(plan, r.wall, hit), m };
      }
    }
    if (!best) continue;
    const from: Vec = horiz ? [edge, best.m] : [best.m, edge];
    out.push({ dir, dist: best.dist, to: best.to, from, end: [from[0] + v[0] * best.dist, from[1] + v[1] * best.dist] });
  }
  return out;
}
