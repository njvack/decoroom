import { itemLabel } from './diff';
import { wallFrame } from './geometry';
import type { Plan } from './types';

export type EstimateRef =
  | { kind: 'item'; id: string }
  | { kind: 'wall'; wall: number }
  | { kind: 'feature'; wall: number; index: number };

export interface Estimate {
  ref: EstimateRef;
  label: string;
  /** What to measure, in plain words. */
  ask: string;
}

export const wallName = (plan: Plan, i: number) => plan.walls[i]?.name || `Wall ${i + 1}`;

/** Everything in the plan that is still a guess, as a to-measure list. */
export function listEstimates(plan: Plan): Estimate[] {
  const out: Estimate[] = [];
  plan.walls.forEach((w, i) => {
    if (w.est) out.push({ ref: { kind: 'wall', wall: i }, label: wallName(plan, i), ask: 'Length of this wall, corner to corner' });
    (w.features ?? []).forEach((f, k) => {
      if (!f.est) return;
      const prev = wallName(plan, (i - 1 + plan.walls.length) % plan.walls.length);
      out.push({
        ref: { kind: 'feature', wall: i, index: k },
        label: `${f.label || f.kind} on ${wallName(plan, i)}`,
        ask: `Width, and distance from the ${prev} corner`,
      });
    });
  });
  for (const it of plan.items) {
    if (it.est) out.push({ ref: { kind: 'item', id: it.id }, label: itemLabel(it), ask: 'Width, depth and height' });
  }
  return out;
}

export function clearEstimate(plan: Plan, ref: EstimateRef): Plan {
  const next = structuredClone(plan);
  if (ref.kind === 'item') {
    const it = next.items.find((x) => x.id === ref.id);
    if (it) delete it.est;
  } else if (ref.kind === 'wall') {
    delete next.walls[ref.wall].est;
  } else {
    const f = next.walls[ref.wall].features?.[ref.index];
    if (f) delete f.est;
  }
  return next;
}

export function wallLength(plan: Plan, i: number) {
  return wallFrame(plan, i).len;
}
