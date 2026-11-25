import { itemPaint } from './defaults';
import type { Feature, Item, Paint, Plan } from './types';

export type ItemChange =
  | { kind: 'added'; id: string; name: string }
  | { kind: 'removed'; id: string; name: string; before: Item }
  | { kind: 'changed'; id: string; name: string; before: Item; what: string[] };

export interface PlanDiff {
  items: ItemChange[];
  room: string[];
  /** True when nothing differs. */
  same: boolean;
}

const paintKey = (p?: Paint) => JSON.stringify(p ?? {});
const featKey = (f: Feature) => JSON.stringify(f);
export const itemLabel = (it: Item) => it.name || it.type || 'piece';

function fmt(n: number) {
  return `${Math.round(n * 2) / 2}″`;
}

/** What changed from `a` (before) to `b` (after). */
export function diffPlans(a: Plan, b: Plan): PlanDiff {
  const items: ItemChange[] = [];
  const before = new Map(a.items.map((it) => [it.id, it]));
  const after = new Map(b.items.map((it) => [it.id, it]));
  for (const it of b.items) {
    const old = before.get(it.id);
    if (!old) {
      items.push({ kind: 'added', id: it.id, name: itemLabel(it) });
      continue;
    }
    const what: string[] = [];
    const moved = Math.hypot(it.x - old.x, it.y - old.y);
    if (moved >= 0.5) what.push(`moved ${fmt(moved)}`);
    if ((it.rot ?? 0) !== (old.rot ?? 0)) what.push(`rotated to ${it.rot ?? 0}°`);
    if (it.w !== old.w || it.d !== old.d) what.push(`resized ${old.w}×${old.d} → ${it.w}×${it.d}`);
    if ((it.h ?? 0) !== (old.h ?? 0)) what.push('height changed');
    if (paintKey(itemPaint(it)) !== paintKey(itemPaint(old))) what.push('recolored');
    if ((it.name ?? '') !== (old.name ?? '')) what.push(`renamed from “${itemLabel(old)}”`);
    if (it.shape !== old.shape || it.type !== old.type) what.push('type or shape changed');
    if (!!it.est !== !!old.est) what.push(it.est ? 'marked as estimate' : 'measured');
    if (what.length) items.push({ kind: 'changed', id: it.id, name: itemLabel(it), before: old, what });
  }
  for (const it of a.items) if (!after.has(it.id)) items.push({ kind: 'removed', id: it.id, name: itemLabel(it), before: it });

  const room: string[] = [];
  if (JSON.stringify(a.verts) !== JSON.stringify(b.verts)) room.push('Room shape changed');
  const n = Math.min(a.walls.length, b.walls.length);
  for (let i = 0; i < n; i++) {
    const wa = a.walls[i];
    const wb = b.walls[i];
    const name = wb.name || `Wall ${i + 1}`;
    if ((wa.name ?? '') !== (wb.name ?? '')) room.push(`${wa.name || `Wall ${i + 1}`} renamed to “${name}”`);
    if (paintKey(wa.paint) !== paintKey(wb.paint)) room.push(`${name} repainted`);
    const fa = (wa.features ?? []).map(featKey).join('|');
    const fb = (wb.features ?? []).map(featKey).join('|');
    if (fa !== fb) room.push(`${name}: doors, windows or art changed`);
  }
  if (paintKey(a.floor) !== paintKey(b.floor)) room.push('Floor changed');
  if ((a.name ?? '') !== (b.name ?? '')) room.push('Room renamed');
  if (JSON.stringify(a.sketches ?? []) !== JSON.stringify(b.sketches ?? [])) room.push('Sketches changed');
  if ((a.ceiling ?? 0) !== (b.ceiling ?? 0)) room.push('Ceiling height changed');
  return { items, room, same: !items.length && !room.length };
}

export function summarizeDiff(d: PlanDiff): string[] {
  const out: string[] = [];
  for (const c of d.items) {
    if (c.kind === 'added') out.push(`Added ${c.name}`);
    else if (c.kind === 'removed') out.push(`Removed ${c.name}`);
    else out.push(`${c.name}: ${c.what.join(', ')}`);
  }
  return [...out, ...d.room];
}
