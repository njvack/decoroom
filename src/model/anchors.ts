import { dot, itemExtent, round, wallDistance, wallFrame, wallFrames, wallParam } from './geometry';
import type { Anchor, Edge, Item, Plan, Vec } from './types';

/** Offset of the anchored edge from the piece's center, along the wall's inward normal. */
function edgeOffset(it: Item, n: Vec, edge: Edge | undefined): number {
  const e = itemExtent(it, n);
  if (edge === 'center') return 0;
  if (edge === 'far') return e;
  return -e;
}

/** Current distance of the anchored edge from the wall. */
export function anchorDistance(plan: Plan, it: Item, a: Anchor): number {
  const f = wallFrame(plan, a.wall);
  return wallDistance(f, [it.x, it.y]) + edgeOffset(it, f.n, a.edge);
}

/**
 * Move the piece so its anchors hold. Two anchors on non-parallel walls fix
 * the position; otherwise each anchor moves the piece along its wall's normal.
 * Returns a new item; the input is not modified.
 */
export function solveAnchors(plan: Plan, it: Item): Item {
  const anchors = (it.anchors ?? []).filter((a) => a.wall >= 0 && a.wall < plan.verts.length);
  if (!anchors.length) return it;
  const rows = anchors.slice(0, 2).map((a) => {
    const f = wallFrame(plan, a.wall);
    // n · c = dist + n · a - edgeOffset
    return { n: f.n, t: a.dist + dot(f.n, f.a) - edgeOffset(it, f.n, a.edge) };
  });
  let c: Vec = [it.x, it.y];
  if (rows.length === 2) {
    const [r1, r2] = rows;
    const det = r1.n[0] * r2.n[1] - r1.n[1] * r2.n[0];
    if (Math.abs(det) > 0.05) {
      c = [(r1.t * r2.n[1] - r1.n[1] * r2.t) / det, (r1.n[0] * r2.t - r1.t * r2.n[0]) / det];
      return { ...it, x: tidy(c[0]), y: tidy(c[1]) };
    }
  }
  for (const r of rows) {
    const k = r.t - dot(r.n, c);
    c = [c[0] + r.n[0] * k, c[1] + r.n[1] * k];
  }
  return { ...it, x: tidy(c[0]), y: tidy(c[1]) };
}

const tidy = (n: number) => Math.round(n * 100) / 100;

/** After a drag or a size change, rewrite anchor distances to match the piece's position. */
export function refreshAnchors(plan: Plan, it: Item): Item {
  if (!it.anchors?.length) return it;
  return { ...it, anchors: it.anchors.map((a) => ({ ...a, dist: round(anchorDistance(plan, it, a), 0.5) })) };
}

export function solveAll(plan: Plan): Plan {
  return { ...plan, items: plan.items.map((it) => solveAnchors(plan, it)) };
}

/**
 * Default anchors: the nearest wall the piece faces, plus the nearest wall that
 * isn't parallel to it, both measured to the piece's closest edge.
 */
export function autoAnchors(plan: Plan, it: Item): Anchor[] {
  const frames = wallFrames(plan).filter((f) => f.len > 1);
  const scored = frames
    .map((f) => {
      const t = wallParam(f, [it.x, it.y]);
      const along = Math.max(0, -t, t - f.len); // outside the wall's span counts against it
      const d = wallDistance(f, [it.x, it.y]) - itemExtent(it, f.n);
      return { f, score: Math.abs(d) + along * 2 };
    })
    .sort((p, q) => p.score - q.score);
  if (!scored.length) return [];
  const first = scored[0].f;
  const second = scored.find((s) => Math.abs(s.f.n[0] * first.n[1] - s.f.n[1] * first.n[0]) > 0.3)?.f;
  const out: Anchor[] = [{ wall: first.i, dist: 0 }];
  if (second) out.push({ wall: second.i, dist: 0 });
  return out.map((a) => ({ ...a, dist: round(anchorDistance(plan, it, a), 0.5) }));
}
