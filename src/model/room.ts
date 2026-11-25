import { solveAll } from './anchors';
import { add, dot, mul, round, signedArea, sub, wallFrame, wallPoint, type WallFrame } from './geometry';
import type { Feature, Plan, Vec, Wall } from './types';

const clone = <T>(o: T): T => structuredClone(o);

function clampFeatures(plan: Plan): void {
  plan.walls.forEach((w, i) => {
    const L = wallFrame(plan, i).len;
    for (const f of w.features ?? []) {
      f.w = Math.min(f.w, Math.max(1, L));
      f.at = round(Math.min(Math.max(0, f.at), Math.max(0, L - f.w)), 0.25);
    }
  });
}

/** Re-express a feature, placed on `from`, along `to` so it stays put in the room. */
function reproject(f: Feature, from: WallFrame, to: WallFrame): Feature {
  const p = wallPoint(from, f.at);
  return { ...f, at: round(dot(sub(p, to.a), to.u), 0.25) };
}

function finish(old: Plan, next: Plan, wallMap: (newIndex: number) => number | undefined): Plan {
  // Keep features where they were on walls whose start corner moved.
  next.walls.forEach((w, i) => {
    const oi = wallMap(i);
    if (oi === undefined || !w.features) return;
    const from = wallFrame(old, oi);
    const to = wallFrame(next, i);
    w.features = w.features.map((f) => reproject(f, from, to));
  });
  clampFeatures(next);
  return solveAll(next);
}

/** Move one corner. Callers decide snapping. */
export function moveVertex(plan: Plan, i: number, p: Vec): Plan {
  const next = clone(plan);
  next.verts[i] = [round(p[0]), round(p[1])];
  if (signedArea(next.verts) <= 0) return plan;
  return finish(plan, next, (k) => k);
}

/**
 * Change a wall's length by stretching the room along the wall's direction:
 * every corner at or beyond the wall's end (measured along the wall) moves.
 * For rooms with right angles this keeps opposite walls parallel.
 */
export function setWallLength(plan: Plan, i: number, length: number): Plan {
  const f = wallFrame(plan, i);
  const delta = length - f.len;
  if (Math.abs(delta) < 0.01 || length < 6) return plan;
  const next = clone(plan);
  const cut = f.len - 0.01;
  next.verts = plan.verts.map((v) => (dot(sub(v, f.a), f.u) >= cut ? add(v, mul(f.u, delta)) : v)).map(
    (v): Vec => [round(v[0], 0.25), round(v[1], 0.25)],
  );
  if (signedArea(next.verts) <= 0) return plan;
  // Features on walls that run along the stretch direction keep their distance
  // from the corner that didn't move, which is what reproject() does.
  return finish(plan, next, (k) => k);
}

/** Add a corner in the middle of wall i. */
export function splitWall(plan: Plan, i: number): Plan {
  const f = wallFrame(plan, i);
  const mid: Vec = [round((f.a[0] + f.b[0]) / 2), round((f.a[1] + f.b[1]) / 2)];
  const next = clone(plan);
  next.verts.splice(i + 1, 0, mid);
  const w = plan.walls[i];
  const half = f.len / 2;
  const first: Wall = { ...clone(w), features: (w.features ?? []).filter((x) => x.at + x.w / 2 < half) };
  const second: Wall = { ...clone(w), features: (w.features ?? []).filter((x) => x.at + x.w / 2 >= half) };
  if (w.name) second.name = `${w.name} (2)`;
  next.walls.splice(i, 1, first, second);
  for (const it of next.items) for (const a of it.anchors ?? []) if (a.wall > i) a.wall += 1;
  return finish(plan, next, (k) => (k <= i ? k : k === i + 1 ? i : k - 1));
}

/** Remove corner i, merging walls i-1 and i. */
export function deleteVertex(plan: Plan, i: number): Plan {
  const n = plan.verts.length;
  if (n <= 3) return plan;
  const prev = (i - 1 + n) % n;
  const next = clone(plan);
  next.verts.splice(i, 1);
  if (signedArea(next.verts) <= 0) return plan;
  const merged: Wall = {
    ...clone(plan.walls[prev]),
    features: [
      ...(plan.walls[prev].features ?? []),
      // Features of wall i, re-expressed from wall prev's start corner below.
    ],
  };
  const cf = wallFrame(plan, i);
  const newWalls = clone(plan.walls);
  newWalls[prev] = merged;
  newWalls.splice(i, 1);
  next.walls = newWalls;
  const mergedIndex = i === 0 ? next.walls.length - 1 : prev;
  // Re-express wall i's features against the merged wall later, via world points.
  const carried = (plan.walls[i].features ?? []).map((f) => ({ f, p: wallPoint(cf, f.at) }));
  for (const it of next.items) {
    it.anchors = (it.anchors ?? [])
      .map((a) => {
        if (a.wall === i) return { ...a, wall: mergedIndex };
        if (a.wall > i) return { ...a, wall: a.wall - 1 };
        return a;
      })
      .filter((a, k, all) => all.findIndex((b) => b.wall === a.wall) === k);
    if (!it.anchors.length) delete it.anchors;
  }
  const result = finish(plan, next, (k) => (k === mergedIndex ? prev : k < i ? k : k + 1));
  const mf = wallFrame(result, mergedIndex);
  const mw = result.walls[mergedIndex];
  mw.features = [...(mw.features ?? []), ...carried.map(({ f, p }) => ({ ...f, at: round(dot(sub(p, mf.a), mf.u), 0.25) }))];
  if (!mw.features.length) delete mw.features;
  clampFeatures(result);
  return result;
}

export function setVerts(plan: Plan, verts: Vec[]): Plan {
  const next = clone(plan);
  next.verts = verts;
  while (next.walls.length < verts.length) next.walls.push({});
  next.walls.length = verts.length;
  for (const it of next.items) {
    it.anchors = it.anchors?.filter((a) => a.wall < verts.length);
    if (!it.anchors?.length) delete it.anchors;
  }
  clampFeatures(next);
  return solveAll(next);
}
