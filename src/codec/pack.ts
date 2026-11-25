/**
 * Packed form: each object becomes a positional array, in the field order
 * below. A field equal to its default packs as 0, and trailing zeros are
 * dropped. The top level is [FORMAT_VERSION, ...planFields].
 *
 * The field orders here are a wire format. Append new fields at the end of
 * a list; never reorder or remove. Changing meaning requires a new version.
 */
import { solveAnchors } from '../model/anchors';
import {
  EDGES,
  FEATURE_KINDS,
  ITEM_TYPES,
  PATTERNS,
  SHAPES,
  type Item,
  type Plan,
} from '../model/types';

export const FORMAT_VERSION = 1;

type Spec =
  | { t: 'num'; req?: boolean; plus1?: boolean }
  | { t: 'str' }
  | { t: 'bool' }
  | { t: 'enum'; list: readonly (string | null)[] }
  | { t: 'obj'; fields: Field[] }
  | { t: 'arr'; of: Spec }
  | { t: 'verts' }
  | { t: 'raw' };
type Field = [key: string, spec: Spec];

const num: Spec = { t: 'num' };
const reqNum: Spec = { t: 'num', req: true };
const str: Spec = { t: 'str' };
const bool: Spec = { t: 'bool' };
const en = (list: readonly (string | null)[]): Spec => ({ t: 'enum', list });

const PAINT: Spec = {
  t: 'obj',
  fields: [
    ['color', str],
    ['pattern', en(PATTERNS)],
    ['color2', str],
    ['scale', num],
    ['angle', num],
    ['sketch', { t: 'num', plus1: true }],
  ],
};

const FEATURE: Spec = {
  t: 'obj',
  fields: [
    ['kind', en(FEATURE_KINDS)],
    ['at', reqNum],
    ['w', reqNum],
    ['label', str],
    ['est', bool],
    ['h', num],
    ['y', num],
    ['depth', num],
    ['hinge', en(['start', 'end'])],
    ['swing', en(['in', 'out'])],
    ['paint', PAINT],
  ],
};

const WALL: Spec = {
  t: 'obj',
  fields: [
    ['name', str],
    ['paint', PAINT],
    ['features', { t: 'arr', of: FEATURE }],
    ['est', bool],
  ],
};

const ANCHOR: Spec = {
  t: 'obj',
  fields: [
    ['wall', reqNum],
    ['edge', en(EDGES)],
    ['dist', reqNum],
  ],
};

const ITEM: Spec = {
  t: 'obj',
  fields: [
    ['id', str],
    ['name', str],
    ['type', en(ITEM_TYPES)],
    ['shape', en(SHAPES)],
    ['w', reqNum],
    ['d', reqNum],
    ['h', num],
    ['x', reqNum],
    ['y', reqNum],
    ['rot', num],
    ['anchors', { t: 'arr', of: ANCHOR }],
    ['paint', PAINT],
    ['est', bool],
    ['radius', num],
    ['seatDepth', num],
    ['chaiseWidth', num],
    ['chaiseSide', en(['right', 'left'])],
  ],
};

const SKETCH: Spec = {
  t: 'obj',
  fields: [
    ['w', reqNum],
    ['h', reqNum],
    ['pal', { t: 'raw' }],
    ['paths', { t: 'raw' }],
  ],
};

const PLAN_FIELDS: Field[] = [
  ['name', str],
  ['units', en([null, 'in', 'cm'])],
  ['ceiling', num],
  ['verts', { t: 'verts' }],
  ['walls', { t: 'arr', of: WALL }],
  ['floor', PAINT],
  ['items', { t: 'arr', of: ITEM }],
  ['sketches', { t: 'arr', of: SKETCH }],
  ['notes', str],
];

const r2 = (n: number) => Math.round(n * 100) / 100;

function packVal(v: unknown, s: Spec): unknown {
  switch (s.t) {
    case 'num':
      if (typeof v !== 'number') return 0;
      return s.plus1 ? r2(v) + 1 : r2(v);
    case 'str':
      return typeof v === 'string' && v ? v : 0;
    case 'bool':
      return v ? 1 : 0;
    case 'enum': {
      const i = s.list.indexOf(v as string);
      return i > 0 ? i : 0;
    }
    case 'obj': {
      if (!v || typeof v !== 'object') return 0;
      const a = packObj(v as Record<string, unknown>, s.fields);
      return a.length ? a : 0;
    }
    case 'arr':
      if (!Array.isArray(v) || !v.length) return 0;
      // Array elements keep [] for an all-default object so positions survive.
      return v.map((x) => (s.of.t === 'obj' ? packObj((x ?? {}) as Record<string, unknown>, s.of.fields) : packVal(x, s.of)));
    case 'verts':
      return Array.isArray(v) ? (v as number[][]).flatMap((p) => [r2(p[0]), r2(p[1])]) : 0;
    case 'raw':
      return v ?? 0;
  }
}

function packObj(o: Record<string, unknown>, fields: Field[]): unknown[] {
  const out = fields.map(([k, s]) => packVal(o[k], s));
  while (out.length && out[out.length - 1] === 0) out.pop();
  return out;
}

function unpackVal(v: unknown, s: Spec): unknown {
  switch (s.t) {
    case 'num':
      if (typeof v !== 'number') return s.req ? 0 : undefined;
      if (s.plus1) return v === 0 ? undefined : v - 1;
      return v === 0 && !s.req ? undefined : v;
    case 'str':
      return typeof v === 'string' ? v : undefined;
    case 'bool':
      return v === 1 || v === true ? true : undefined;
    case 'enum':
      return typeof v === 'number' ? (s.list[v] ?? undefined) : s.list[0] ?? undefined;
    case 'obj':
      return Array.isArray(v) ? unpackObj(v, s.fields) : undefined;
    case 'arr':
      return Array.isArray(v) ? v.map((x) => unpackVal(x, s.of)) : undefined;
    case 'verts': {
      if (!Array.isArray(v)) return undefined;
      const out: number[][] = [];
      for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i], v[i + 1]]);
      return out;
    }
    case 'raw':
      return v === 0 ? undefined : v;
  }
}

function unpackObj(a: unknown[], fields: Field[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  fields.forEach(([k, s], i) => {
    const v = unpackVal(a[i], s);
    if (v !== undefined) o[k] = v;
  });
  return o;
}

/** Drop x/y when two anchors pin the piece; the decoder solves them again. */
function slimItem(plan: Plan, it: Item): Item {
  if ((it.anchors?.length ?? 0) < 2) return it;
  const solved = solveAnchors(plan, { ...it, x: 0, y: 0 });
  if (Math.abs(solved.x - it.x) < 0.02 && Math.abs(solved.y - it.y) < 0.02 && (solved.x !== 0 || solved.y !== 0)) {
    return { ...it, x: 0, y: 0 };
  }
  return it;
}

export function packPlan(plan: Plan): unknown[] {
  const slim = { ...plan, items: plan.items.map((it) => slimItem(plan, it)) };
  const body = packObj(slim as unknown as Record<string, unknown>, PLAN_FIELDS);
  return [FORMAT_VERSION, ...body];
}

/** Returns a loose plan object; run it through normalizePlan(). */
export function unpackPlan(packed: unknown): Record<string, unknown> {
  if (!Array.isArray(packed) || typeof packed[0] !== 'number') throw new Error('Not a decoroom packed plan');
  if (packed[0] > FORMAT_VERSION) throw new Error(`This link uses format ${packed[0]}; this app reads up to ${FORMAT_VERSION}. Reload to update.`);
  return unpackObj(packed.slice(1), PLAN_FIELDS);
}

/** Field order of the packed form, for documentation. */
export function describePackedFormat(): string {
  const lines: string[] = [];
  const walk = (name: string, fields: Field[]) => {
    lines.push(`${name}: [${fields.map(([k, s]) => k + specHint(s)).join(', ')}]`);
  };
  const specHint = (s: Spec): string => {
    if (s.t === 'enum') return `(${s.list.map((x, i) => `${i}=${x ?? 'absent'}`).join(' ')})`;
    if (s.t === 'bool') return '(0/1)';
    if (s.t === 'verts') return '(flat x,y list)';
    if (s.t === 'num' && s.plus1) return '(index+1)';
    return '';
  };
  walk('plan', [['version', reqNum], ...PLAN_FIELDS]);
  walk('wall', (WALL as { fields: Field[] }).fields);
  walk('feature', (FEATURE as { fields: Field[] }).fields);
  walk('item', (ITEM as { fields: Field[] }).fields);
  walk('anchor', (ANCHOR as { fields: Field[] }).fields);
  walk('paint', (PAINT as { fields: Field[] }).fields);
  walk('sketch', (SKETCH as { fields: Field[] }).fields);
  return lines.join('\n');
}
