import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLink } from '../src/codec/hash';
import { FIREPLACE_ROOM } from '../src/model/examples';
import { describePlan } from '../src/render/describe';
import { toSvgString } from '../src/render/el';
import { renderElevation } from '../src/render/elevation';
import { renderPlan } from '../src/render/plan';
import { describePackedFormat } from '../src/codec/pack';

describe('renderers', () => {
  it('draws the plan with every piece and wall name', () => {
    const svg = toSvgString(renderPlan(FIREPLACE_ROOM, { caption: true, selection: { kind: 'item', id: 'milt' }, interactive: true, mode: 'room' }));
    expect(svg.startsWith('<svg')).toBe(true);
    for (const it of FIREPLACE_ROOM.items) expect(svg).toContain(`data-item="${it.id}"`);
    for (const w of FIREPLACE_ROOM.walls) expect(svg).toContain(w.name!);
    expect(svg).toContain('data-vert="0"');
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it('draws each wall elevation', () => {
    FIREPLACE_ROOM.walls.forEach((_, i) => {
      const svg = toSvgString(renderElevation(FIREPLACE_ROOM, i));
      expect(svg).not.toMatch(/NaN|undefined/);
    });
  });

  it('describes the room in text', () => {
    const t = describePlan(FIREPLACE_ROOM);
    expect(t).toContain('[3] Fireplace wall');
    expect(t).toContain('anchored: near edge 1.5″ from [0] Back wall');
  });

  it('documents the packed format in llms.txt', () => {
    const doc = readFileSync('public/llms.txt', 'utf8');
    expect(doc).toContain(describePackedFormat());
  });
});

describe.runIf(existsSync('dist/decoroom.mjs'))('CLI (after npm run build)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decoroom-'));
  const link = buildLink('frplc1', FIREPLACE_ROOM);
  const run = (...args: string[]) => execFileSync('node', ['dist/decoroom.mjs', ...args], { encoding: 'utf8' });

  it('decodes and re-encodes a link', () => {
    const json = run('decode', link);
    writeFileSync(join(dir, 'room.json'), json);
    expect(run('encode', join(dir, 'room.json')).trim()).toBe(link);
  });

  it('renders SVG and PNG', () => {
    run('render', link, '-o', join(dir, 'plan.svg'));
    expect(readFileSync(join(dir, 'plan.svg'), 'utf8')).toContain('Milt couch');
    run('render', link, '-o', join(dir, 'plan.png'), '--width', '400');
    expect(readFileSync(join(dir, 'plan.png')).subarray(1, 4).toString()).toBe('PNG');
  });
});
