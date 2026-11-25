import { describe, expect, it } from 'vitest';
import { anchorDistance, autoAnchors, solveAnchors } from '../src/model/anchors';
import { clearances } from '../src/model/clearance';
import { diffPlans, summarizeDiff } from '../src/model/diff';
import { FIREPLACE_ROOM } from '../src/model/examples';
import { itemExtent, signedArea, wallFrame } from '../src/model/geometry';
import { normalizePlan } from '../src/model/normalize';
import { deleteVertex, moveVertex, setWallLength, splitWall } from '../src/model/room';
import { mosaicSketch, pruneSketches, sketchFromImage, sketchSize, SKETCH_BUDGET } from '../src/model/sketch';
import type { Plan } from '../src/model/types';
import { fmtLen } from '../src/model/units';

const rect = (w: number, d: number, extra: Partial<Plan> = {}): Plan =>
  normalizePlan({ verts: [[0, 0], [w, 0], [w, d], [0, d]], walls: [{ name: 'N' }, { name: 'E' }, { name: 'S' }, { name: 'W' }], items: [], ...extra });

describe('geometry', () => {
  it('normalizes to clockwise and keeps features in place', () => {
    const p = normalizePlan({
      verts: [[0, 0], [0, 100], [120, 100], [120, 0]],
      walls: [{ name: 'west', features: [{ kind: 'door', at: 10, w: 30 }] }, {}, {}, {}],
    });
    expect(signedArea(p.verts)).toBeGreaterThan(0);
    const i = p.walls.findIndex((w) => w.name === 'west');
    const f = wallFrame(p, i);
    // Door used to span y 10..40 going down the west wall; it must still.
    const ft = p.walls[i].features![0];
    const ys = [f.a[1] + f.u[1] * ft.at, f.a[1] + f.u[1] * (ft.at + ft.w)].sort((a, b) => a - b);
    expect(ys).toEqual([10, 40]);
    expect(ft.hinge).toBe('end');
  });

  it('measures rotated extents', () => {
    const it0 = { id: 'a', w: 40, d: 20, x: 0, y: 0 };
    expect(itemExtent(it0, [1, 0])).toBe(20);
    expect(itemExtent({ ...it0, rot: 90 }, [1, 0])).toBeCloseTo(10);
  });
});

describe('anchors', () => {
  it('solves two perpendicular walls', () => {
    const p = rect(120, 100);
    const it = solveAnchors(p, { id: 'a', w: 40, d: 20, x: 0, y: 0, anchors: [{ wall: 0, dist: 5 }, { wall: 3, dist: 10 }] });
    expect([it.x, it.y]).toEqual([30, 15]);
  });

  it('handles rotation and far/center edges', () => {
    const p = rect(120, 100);
    const it = solveAnchors(p, { id: 'a', w: 40, d: 20, rot: 90, x: 0, y: 50, anchors: [{ wall: 1, edge: 'far', dist: 30 }] });
    // Rotated 90: 20 wide in x. Far edge 30 from east wall -> x0 = 90 -> center 100.
    expect(it.x).toBe(100);
    expect(it.y).toBe(50);
    expect(anchorDistance(p, it, { wall: 1, edge: 'center', dist: 0 })).toBe(20);
  });

  it('follows a wall when the room stretches', () => {
    let p = rect(120, 100);
    p = { ...p, items: [solveAnchors(p, { id: 'a', w: 20, d: 20, x: 0, y: 0, anchors: [{ wall: 1, dist: 0 }, { wall: 2, dist: 0 }] })] };
    expect([p.items[0].x, p.items[0].y]).toEqual([110, 90]);
    const q = setWallLength(p, 0, 150);
    expect(q.verts[1][0]).toBe(150);
    expect(q.verts[2][0]).toBe(150);
    expect(q.items[0].x).toBe(140);
  });

  it('picks sensible default anchors', () => {
    const p = rect(120, 100);
    const a = autoAnchors(p, { id: 'a', w: 30, d: 10, x: 60, y: 8 });
    expect(a[0]).toEqual({ wall: 0, dist: 3 });
    expect(a[1].wall === 1 || a[1].wall === 3).toBe(true);
  });
});

describe('room editing', () => {
  it('splits and deletes corners, keeping features and anchors', () => {
    let p = rect(120, 100);
    p.walls[2].features = [{ kind: 'door', at: 80, w: 30 }];
    p = { ...p, items: [solveAnchors(p, { id: 'a', w: 10, d: 10, x: 0, y: 0, anchors: [{ wall: 2, dist: 0 }, { wall: 3, dist: 0 }] })] };
    const s = splitWall(p, 0);
    expect(s.verts.length).toBe(5);
    expect(s.items[0].anchors!.map((a) => a.wall)).toEqual([3, 4]);
    expect(s.items[0].x).toBe(5);
    const d = deleteVertex(s, 1);
    expect(d.verts.length).toBe(4);
    expect(d.walls[2].features![0].at).toBe(80);
  });

  it('moves a corner without flipping the room inside out', () => {
    const p = rect(120, 100);
    expect(moveVertex(p, 2, [140, 110]).verts[2]).toEqual([140, 110]);
    expect(moveVertex(p, 2, [-500, -500])).toBe(p);
  });
});

describe('clearances', () => {
  it('finds walls, pieces and openings', () => {
    const couch = FIREPLACE_ROOM.items.find((i) => i.id === 'milt')!;
    const c = Object.fromEntries(clearances(FIREPLACE_ROOM, couch).map((x) => [x.dir, x]));
    expect(c.up.dist).toBe(1.5);
    expect(c.left.to).toBe('hallway');
    expect(c.down.to).toBe('Coffee table');
  });

  it('ignores ceiling lights, which only measure to walls', () => {
    const plan = structuredClone(FIREPLACE_ROOM);
    const couch = plan.items.find((i) => i.id === 'milt')!;
    plan.items.push({ id: 'lite', type: 'light', shape: 'round', w: 18, d: 18, x: couch.x, y: couch.y + 30 });
    const down = clearances(plan, couch).find((x) => x.dir === 'down')!;
    expect(down.to).toBe('Coffee table');
    const light = plan.items.at(-1)!;
    expect(clearances(plan, light).every((x) => !/couch|table|chair/i.test(x.to))).toBe(true);
  });
});

describe('diff', () => {
  it('summarizes changes', () => {
    const a = FIREPLACE_ROOM;
    const b = structuredClone(a);
    b.items[0].x += 10;
    b.items = b.items.filter((i) => i.id !== 'lamp');
    b.items.push({ id: 'new', name: 'Plant', type: 'plant', w: 10, d: 10, x: 50, y: 50 });
    const lines = summarizeDiff(diffPlans(a, b));
    expect(lines).toContain('Shag rug: moved 10″');
    expect(lines).toContain('Added Plant');
    expect(lines).toContain('Removed Fun lamp');
    expect(diffPlans(a, a).same).toBe(true);
  });
});

describe('sketches', () => {
  it('builds a mosaic within budget', () => {
    const sk = sketchFromImage((cols, rows) => {
      const out: [number, number, number][] = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push([(x * 37) % 255, (y * 53) % 255, ((x * y) * 7) % 255]);
      return out;
    }, 1.33);
    expect(sketchSize(sk)).toBeLessThanOrEqual(SKETCH_BUDGET);
    expect(sk.pal.length).toBeLessThanOrEqual(6);
  });

  it('merges runs into rectangles', () => {
    const sk = mosaicSketch(4, 2, [0, 1, 1, 0, 0, 1, 1, 0], [[0, 0, 0], [255, 255, 255]]);
    expect(sk.paths[1][1]).toBe('M1 0h2v2h-2z');
  });

  it('prunes unused sketches and renumbers', () => {
    const p = rect(100, 100, {
      sketches: [{ w: 1, h: 1, pal: ['000'], paths: [] }, { w: 2, h: 2, pal: ['fff'], paths: [] }],
      floor: { sketch: 1 },
    });
    const q = pruneSketches(p);
    expect(q.sketches!.length).toBe(1);
    expect(q.floor).toEqual({ sketch: 0 });
  });
});

describe('units', () => {
  it('formats feet and inches and metric', () => {
    expect(fmtLen(206, 'in')).toBe('17′ 2″');
    expect(fmtLen(6.5, 'in')).toBe('6½″');
    expect(fmtLen(126, 'cm')).toBe('3.2 m');
  });
});
