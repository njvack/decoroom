import { describe, expect, it } from 'vitest';
import { inflateSync, strFromU8 } from 'fflate';
import { buildHash, decodePlan, encodePlan, fromBase64Url, parseHash, toBase64Url, buildReadableHash } from '../src/codec/hash';
import { packPlan } from '../src/codec/pack';
import { FIREPLACE_ROOM } from '../src/model/examples';
import { normalizePlan } from '../src/model/normalize';
import type { Plan } from '../src/model/types';

const kitchenSink: Plan = normalizePlan({
  name: 'Everything',
  units: 'cm',
  ceiling: 108,
  verts: [[0, 0], [180, 0], [180, 96], [96, 96], [96, 168], [0, 168]],
  walls: [
    { name: 'A', paint: { color: 'abc', pattern: 'stripe', color2: '123456', scale: 2, angle: 45 }, est: true },
    { features: [{ kind: 'door', at: 10, w: 30, hinge: 'end', swing: 'out', label: 'D', est: true }] },
    { features: [{ kind: 'window', at: 5, w: 40, h: 50, y: 30 }, { kind: 'art', at: 50, w: 20, h: 16, y: 50, paint: { sketch: 0 } }] },
    { features: [{ kind: 'fireplace', at: 0, w: 40, depth: 16 }] },
    {},
    { name: 'F' },
  ],
  floor: { color: 'eeeeee', pattern: 'tile' },
  items: [
    { id: 'a1', name: 'Sec', type: 'seat', shape: 'L', w: 90, d: 62, seatDepth: 38, chaiseWidth: 36, chaiseSide: 'left', x: 60, y: 40, rot: 90, h: 30, est: true, radius: 2 },
    { id: 'b2', type: 'rug', w: 60, d: 96, x: 50, y: 80, anchors: [{ wall: 0, edge: 'far', dist: 100 }, { wall: 5, edge: 'center', dist: 50 }] },
    { id: 'c3', w: 10, d: 10, x: 0, y: 0 },
  ],
  sketches: [{ w: 40, h: 30, pal: ['e07a3f', 'fff'], paths: [[0, 'M0 0h40v30H0z'], [1, 'M5 5h10v10H5z']] }],
  notes: 'hi',
});

describe('base64url', () => {
  it('round trips every length', () => {
    for (let n = 0; n < 40; n++) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + n) & 255);
      expect(Array.from(fromBase64Url(toBase64Url(b)))).toEqual(Array.from(b));
    }
  });
});

describe('codec', () => {
  for (const [name, plan] of [['fireplace', FIREPLACE_ROOM], ['kitchen sink', kitchenSink]] as const) {
    it(`round trips ${name}`, () => {
      expect(decodePlan(encodePlan(plan))).toEqual(plan);
    });
    it(`round trips ${name} through the readable form`, () => {
      const h = parseHash(buildReadableHash('abc123', plan));
      expect(h.plan).toEqual(plan);
      expect(h.form).toBe('j');
    });
  }

  it('is plain deflate-raw of JSON', () => {
    const z = encodePlan(FIREPLACE_ROOM);
    const json = JSON.parse(strFromU8(inflateSync(fromBase64Url(z))));
    expect(json[0]).toBe(1);
    expect(json).toEqual(packPlan(FIREPLACE_ROOM));
  });

  it('keeps the fireplace room link short', () => {
    const hash = buildHash('frplc1', FIREPLACE_ROOM);
    const url = 'https://njvack.github.io/decoroom/' + hash;
    console.log(`fireplace room link: ${url.length} chars`);
    expect(url.length).toBeLessThan(900);
  });

  it('parses id and reports damage', () => {
    const h = parseHash('#id=abc123&z=notreal');
    expect(h.id).toBe('abc123');
    expect(h.error).toBeTruthy();
  });

  it('accepts a partial readable plan', () => {
    const h = parseHash('#j=' + encodeURIComponent(JSON.stringify({ verts: [[0, 0], [0, 100], [100, 100], [100, 0]], items: [{ name: 'x', w: 10, d: 10, x: 5, y: 5 }] })));
    expect(h.plan?.verts).toEqual([[100, 0], [100, 100], [0, 100], [0, 0]]); // reversed to clockwise
    expect(h.plan?.items[0].id).toMatch(/^\w+$/);
    expect(h.plan?.walls.length).toBe(4);
  });
});
