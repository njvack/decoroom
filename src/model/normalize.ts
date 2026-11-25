import { solveAll } from './anchors';
import { signedArea, wallFrame } from './geometry';
import {
  EDGES,
  FEATURE_KINDS,
  ITEM_TYPES,
  PATTERNS,
  SHAPES,
  UNITS,
  type Anchor,
  type Feature,
  type Item,
  type Paint,
  type Plan,
  type Sketch,
  type Vec,
  type Wall,
} from './types';

export class PlanError extends Error {}

const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
export function randomId(n = 4): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
};
const optNum = (v: unknown): number | undefined => (v === undefined || v === null || v === '' ? undefined : num(v));
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;

export function cleanColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/^#/, '').toLowerCase();
  return /^([0-9a-f]{3}|[0-9a-f]{6})$/.test(s) ? s : undefined;
}

function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) {
    const v = o[k];
    if (v === undefined || v === false || (Array.isArray(v) && v.length === 0)) delete o[k];
  }
  return o;
}

export function cleanPaint(v: unknown): Paint | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  const out = compact<Paint>({
    color: cleanColor(p.color),
    pattern: oneOf(PATTERNS, p.pattern),
    color2: cleanColor(p.color2),
    scale: optNum(p.scale),
    angle: optNum(p.angle),
    sketch: optNum(p.sketch),
  });
  if (out.pattern === 'solid') delete out.pattern;
  if (out.scale === 1 || out.scale === 0) delete out.scale;
  if (out.angle === 0) delete out.angle;
  return Object.keys(out).length ? out : undefined;
}

function cleanFeature(v: unknown): Feature | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const f = v as Record<string, unknown>;
  const kind = oneOf(FEATURE_KINDS, f.kind) ?? 'opening';
  return compact<Feature>({
    kind,
    at: num(f.at),
    w: Math.max(1, num(f.w, 30)),
    h: optNum(f.h),
    y: optNum(f.y),
    depth: optNum(f.depth),
    hinge: f.hinge === 'end' ? 'end' : undefined,
    swing: f.swing === 'out' ? 'out' : undefined,
    label: str(f.label),
    paint: cleanPaint(f.paint),
    est: f.est === true || f.est === 1 || undefined,
  });
}

function cleanWall(v: unknown): Wall {
  const w = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const features = Array.isArray(w.features) ? w.features.map(cleanFeature).filter((f): f is Feature => !!f) : [];
  return compact<Wall>({
    name: str(w.name),
    paint: cleanPaint(w.paint),
    features,
    est: w.est === true || w.est === 1 || undefined,
  });
}

function cleanAnchor(v: unknown, nWalls: number): Anchor | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as Record<string, unknown>;
  const wall = Math.round(num(a.wall, -1));
  if (wall < 0 || wall >= nWalls) return undefined;
  const edge = oneOf(EDGES, a.edge);
  return compact<Anchor>({ wall, edge: edge === 'near' ? undefined : edge, dist: num(a.dist) });
}

function cleanItem(v: unknown, nWalls: number, ids: Set<string>): Item | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const it = v as Record<string, unknown>;
  let id = typeof it.id === 'string' && /^[\w-]{1,12}$/.test(it.id) ? it.id : randomId();
  while (ids.has(id)) id = randomId();
  ids.add(id);
  const shape = oneOf(SHAPES, it.shape);
  const rot = ((num(it.rot) % 360) + 360) % 360;
  const anchors = Array.isArray(it.anchors)
    ? it.anchors.map((a) => cleanAnchor(a, nWalls)).filter((a): a is Anchor => !!a).slice(0, 2)
    : [];
  return compact<Item>({
    id,
    name: str(it.name),
    type: it.type === 'box' ? undefined : oneOf(ITEM_TYPES, it.type),
    shape: shape === 'rect' ? undefined : shape,
    w: Math.max(1, num(it.w, 24)),
    d: Math.max(1, num(it.d, 24)),
    h: optNum(it.h),
    x: num(it.x),
    y: num(it.y),
    rot: rot || undefined,
    anchors,
    paint: cleanPaint(it.paint),
    est: it.est === true || it.est === 1 || undefined,
    radius: optNum(it.radius) || undefined,
    seatDepth: shape === 'L' ? optNum(it.seatDepth) : undefined,
    chaiseWidth: shape === 'L' ? optNum(it.chaiseWidth) : undefined,
    chaiseSide: shape === 'L' && it.chaiseSide === 'left' ? 'left' : undefined,
  });
}

function cleanSketch(v: unknown): Sketch | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const s = v as Record<string, unknown>;
  const pal = Array.isArray(s.pal) ? s.pal.map(cleanColor).map((c) => c ?? '000').slice(0, 16) : [];
  const paths = Array.isArray(s.paths)
    ? s.paths
        .filter((p): p is [number, string] => Array.isArray(p) && typeof p[1] === 'string')
        .map((p): [number, string] => [Math.max(0, Math.round(num(p[0]))), p[1].replace(/[^MmLlHhVvCcSsQqTtAaZz0-9.,\s-]/g, '')])
    : [];
  return { w: Math.max(1, num(s.w, 100)), h: Math.max(1, num(s.h, 100)), pal, paths };
}

/** Reverse wall order so the polygon runs clockwise, keeping features where they are. */
function reverseRoom(verts: Vec[], walls: Wall[]): { verts: Vec[]; walls: Wall[] } {
  const n = verts.length;
  const nv = [...verts].reverse();
  // Old wall i ran verts[i] -> verts[i+1]; in the reversed list it runs nv[n-2-i] -> nv[n-1-i].
  const nw: Wall[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const w = walls[i];
    const j = (((n - 2 - i) % n) + n) % n;
    nw[j] = {
      ...w,
      features: w.features?.map((f) => ({
        ...f,
        at: Math.round((L - f.at - f.w) * 100) / 100,
        hinge: f.kind === 'door' && f.hinge !== 'end' ? 'end' : undefined,
      })),
    };
    if (!nw[j].features) delete nw[j].features;
    else for (const f of nw[j].features!) if (!f.hinge) delete f.hinge;
  }
  return { verts: nv, walls: nw };
}

/**
 * Turn anything that looks like a plan into a valid one: fill defaults, fix
 * vertex order, clamp ranges, give items ids and solve anchors. Throws
 * PlanError when there's no usable room.
 */
export function normalizePlan(input: unknown): Plan {
  if (!input || typeof input !== 'object') throw new PlanError('Plan must be an object');
  const p = input as Record<string, unknown>;
  let verts: Vec[] = Array.isArray(p.verts)
    ? p.verts
        .filter((v): v is unknown[] => Array.isArray(v) && v.length >= 2)
        .map((v): Vec => [num(v[0]), num(v[1])])
    : [];
  // Drop consecutive duplicates.
  verts = verts.filter((v, i) => {
    const q = verts[(i + 1) % verts.length];
    return verts.length < 2 || Math.hypot(v[0] - q[0], v[1] - q[1]) > 0.01;
  });
  if (verts.length < 3) throw new PlanError('Room needs at least 3 corners in "verts"');
  let walls: Wall[] = verts.map((_, i) => cleanWall(Array.isArray(p.walls) ? p.walls[i] : undefined));
  if (signedArea(verts) < 0) ({ verts, walls } = reverseRoom(verts, walls));
  const ids = new Set<string>();
  const items = Array.isArray(p.items)
    ? p.items.map((it) => cleanItem(it, verts.length, ids)).filter((it): it is Item => !!it)
    : [];
  const sketches = Array.isArray(p.sketches) ? p.sketches.map(cleanSketch).filter((s): s is Sketch => !!s) : [];
  const plan = compact<Plan>({
    name: str(p.name),
    units: oneOf(UNITS, p.units),
    ceiling: optNum(p.ceiling),
    verts,
    walls,
    floor: cleanPaint(p.floor),
    items,
    sketches,
    notes: typeof p.notes === 'string' && p.notes.trim() ? p.notes.slice(0, 2000) : undefined,
  });
  if (!plan.items) plan.items = [];
  // Clamp features onto their walls.
  plan.walls.forEach((w, i) => {
    const L = wallFrame(plan, i).len;
    for (const f of w.features ?? []) {
      f.w = Math.min(f.w, L);
      f.at = Math.min(Math.max(0, f.at), Math.max(0, L - f.w));
    }
  });
  return solveAll(plan);
}

export function emptyPlan(): Plan {
  return normalizePlan({
    verts: [[0, 0], [144, 0], [144, 180], [0, 180]],
    walls: [{ name: 'North wall' }, { name: 'East wall' }, { name: 'South wall' }, { name: 'West wall' }],
    items: [],
  });
}
