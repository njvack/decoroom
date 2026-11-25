import type { Feature, Item, Plan, Vec } from './types';

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec) => Math.hypot(a[0], a[1]);
export const dist = (a: Vec, b: Vec) => len(sub(a, b));
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const round = (n: number, step = 0.5) => Math.round(n / step) * step;
export const deg = (rad: number) => (rad * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

export function rotate(p: Vec, degrees: number): Vec {
  const a = rad(degrees);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

/** Shoelace sum; positive means clockwise on screen (y down). */
export function signedArea(verts: Vec[]): number {
  let s = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export interface WallFrame {
  i: number;
  a: Vec;
  b: Vec;
  /** Unit vector along the wall, start to end. */
  u: Vec;
  /** Unit inward normal (points into the room). */
  n: Vec;
  len: number;
}

export function wallFrame(plan: Plan, i: number): WallFrame {
  const n = plan.verts.length;
  const a = plan.verts[((i % n) + n) % n];
  const b = plan.verts[(i + 1) % n];
  const d = sub(b, a);
  const l = len(d);
  const u: Vec = l ? [d[0] / l, d[1] / l] : [1, 0];
  return { i, a, b, u, n: [-u[1], u[0]], len: l };
}

export function wallFrames(plan: Plan): WallFrame[] {
  return plan.verts.map((_, i) => wallFrame(plan, i));
}

/** Point on a wall: `t` inches along it, `off` inches into the room. */
export function wallPoint(f: WallFrame, t: number, off = 0): Vec {
  return [f.a[0] + f.u[0] * t + f.n[0] * off, f.a[1] + f.u[1] * t + f.n[1] * off];
}

/** Signed distance from a point to the wall's line, positive inside the room. */
export function wallDistance(f: WallFrame, p: Vec): number {
  return dot(sub(p, f.a), f.n);
}

/** Position of a point's projection along the wall. */
export function wallParam(f: WallFrame, p: Vec): number {
  return dot(sub(p, f.a), f.u);
}

/** SVG matrix() that maps wall-local (along, inward) coords to room coords. */
export function frameMatrix(f: WallFrame): string {
  const r = (n: number) => +n.toFixed(5);
  return `matrix(${r(f.u[0])} ${r(f.u[1])} ${r(f.n[0])} ${r(f.n[1])} ${r(f.a[0])} ${r(f.a[1])})`;
}

/** Angle in degrees for text running along `u`, flipped so it never reads upside down. */
export function readableAngle(u: Vec): number {
  let a = deg(Math.atan2(u[1], u[0]));
  if (a > 90.5) a -= 180;
  if (a <= -89.5) a += 180;
  return +a.toFixed(3);
}

/** Half the piece's extent along unit direction v (support function). */
export function itemExtent(it: Item, v: Vec): number {
  const ex = rotate([1, 0], it.rot ?? 0);
  const ey = rotate([0, 1], it.rot ?? 0);
  const a = it.w / 2;
  const b = it.d / 2;
  if (it.shape === 'round') return Math.hypot(a * dot(ex, v), b * dot(ey, v));
  return Math.abs(a * dot(ex, v)) + Math.abs(b * dot(ey, v));
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function itemBox(it: Item): Box {
  const hx = itemExtent(it, [1, 0]);
  const hy = itemExtent(it, [0, 1]);
  return { x0: it.x - hx, x1: it.x + hx, y0: it.y - hy, y1: it.y + hy };
}

/** Outline of the piece in room coordinates (for hit tests and the CLI). */
export function itemCorners(it: Item): Vec[] {
  const hw = it.w / 2;
  const hd = it.d / 2;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Vec[]).map((p) => add(rotate(p, it.rot ?? 0), [it.x, it.y]));
}

export function pointInPolygon(p: Vec, verts: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [xi, yi] = verts[i];
    const [xj, yj] = verts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bounds(points: Vec[]): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Outward offset of the room polygon by `t` (mitered), for drawing wall thickness.
 * Assumes clockwise order, so outward is -n.
 */
export function offsetPolygon(plan: Plan, t: number): Vec[] {
  const frames = wallFrames(plan);
  const n = frames.length;
  return plan.verts.map((v, i) => {
    const prev = frames[(i - 1 + n) % n].n;
    const cur = frames[i].n;
    const sum = add(prev, cur);
    const k = 1 + dot(prev, cur);
    if (k < 0.05) return sub(v, mul(cur, t));
    return sub(v, mul(sum, t / k));
  });
}

/** Ray from `p` along unit `d`: distance to the nearest room wall, or Infinity. */
export function rayToWalls(plan: Plan, p: Vec, d: Vec): { dist: number; wall: number } {
  let best = { dist: Infinity, wall: -1 };
  for (const f of wallFrames(plan)) {
    const e = sub(f.b, f.a);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-9) continue;
    const ap = sub(f.a, p);
    const t = cross(ap, e) / den;
    const s = cross(ap, d) / den;
    if (t >= -1e-6 && s >= -1e-6 && s <= 1 + 1e-6 && t < best.dist) best = { dist: Math.max(0, t), wall: f.i };
  }
  return best;
}

export function featureEnd(f: Feature): number {
  return f.at + f.w;
}

/** Fireplace hearths are obstacles in the room; return their boxes. */
export function hearthBoxes(plan: Plan): (Box & { name: string })[] {
  const out: (Box & { name: string })[] = [];
  plan.walls.forEach((w, i) => {
    for (const f of w.features ?? []) {
      if (f.kind !== 'fireplace' || !(f.depth && f.depth > 0)) continue;
      const fr = wallFrame(plan, i);
      out.push({ ...bounds([wallPoint(fr, f.at), wallPoint(fr, f.at + f.w, f.depth)]), name: 'hearth' });
    }
  });
  return out;
}
