import { anchorDistance } from '../model/anchors';
import { clearances } from '../model/clearance';
import { featureBottom, featureHeight, isOverhead, itemHeight, itemPaint, itemType } from '../model/defaults';
import { diffPlans, summarizeDiff } from '../model/diff';
import { listEstimates, wallName } from '../model/estimates';
import { bounds, signedArea, wallFrame } from '../model/geometry';
import { DEFAULT_CEILING, type Paint, type Plan } from '../model/types';
import { fmtLen } from '../model/units';

const n1 = (n: number) => `${Math.round(n * 10) / 10}`;

function paintStr(p?: Paint): string {
  if (!p) return '';
  if (p.sketch !== undefined) return `sketch #${p.sketch}`;
  return [p.color && `#${p.color}`, p.pattern && p.pattern !== 'solid' && p.pattern, p.color2 && `on #${p.color2}`].filter(Boolean).join(' ');
}

/** Plain-text summary of a plan, for agents and terminals. */
export function describePlan(plan: Plan, opts: { before?: Plan } = {}): string {
  const u = plan.units ?? 'in';
  const L = (n: number) => `${n1(n)}″ (${fmtLen(n, u === 'cm' ? 'cm' : 'in')})`;
  const out: string[] = [];
  const b = bounds(plan.verts);
  const area = signedArea(plan.verts) / 144;
  out.push(`# ${plan.name || 'Untitled room'}`);
  out.push(
    `${plan.walls.length} walls. Bounding box ${L(b.x1 - b.x0)} wide (x) by ${L(b.y1 - b.y0)} deep (y). Floor area ${n1(area)} sq ft. Ceiling ${L(plan.ceiling || DEFAULT_CEILING)}.`,
  );
  out.push('Coordinates are inches; x grows to the right, y grows down ("up" on the plan is -y).');
  if (plan.floor) out.push(`Floor: ${paintStr(plan.floor)}`);
  if (plan.notes) out.push(`Notes: ${plan.notes}`);
  out.push('');
  out.push('## Walls');
  out.push('Each wall runs from its start corner to the next corner; features are placed by distance from the start corner.');
  plan.walls.forEach((w, i) => {
    const f = wallFrame(plan, i);
    const facing = ['down', 'left', 'up', 'right'][Math.round(((Math.atan2(f.n[1], f.n[0]) * 180) / Math.PI - 90 + 360) / 90) % 4];
    out.push(
      `- [${i}] ${wallName(plan, i)}: (${n1(f.a[0])}, ${n1(f.a[1])}) → (${n1(f.b[0])}, ${n1(f.b[1])}), ${L(f.len)}${w.est ? ' (estimate)' : ''}; faces ${facing} into the room${w.paint ? `; paint ${paintStr(w.paint)}` : ''}`,
    );
    for (const ft of [...(w.features ?? [])].sort((p, q) => p.at - q.at)) {
      const extra =
        ft.kind === 'window' || ft.kind === 'art'
          ? `, ${n1(featureHeight(ft))}″ tall, bottom ${n1(featureBottom(ft))}″ above floor`
          : ft.kind === 'fireplace'
            ? `, hearth ${n1(ft.depth ?? 0)}″ deep`
            : ft.kind === 'door'
              ? `, hinge at ${ft.hinge === 'end' ? 'end' : 'start'} side, swings ${ft.swing === 'out' ? 'out' : 'in'}`
              : '';
      out.push(
        `    - ${ft.kind}${ft.label ? ` "${ft.label}"` : ''}: ${n1(ft.at)}–${n1(ft.at + ft.w)}″ from start (${n1(ft.w)}″ wide; ${n1(f.len - ft.at - ft.w)}″ to end corner)${extra}${ft.est ? ' (estimate)' : ''}`,
      );
    }
  });
  out.push('');
  out.push('## Pieces');
  out.push('Center (x, y); width × depth × height; rotation clockwise (0 = back of the piece toward -y).');
  for (const it of plan.items) {
    const p = itemPaint(it);
    out.push(
      `- ${it.id} "${it.name || itemType(it)}" ${itemType(it)}${it.shape && it.shape !== 'rect' ? ` (${it.shape})` : ''}: center (${n1(it.x)}, ${n1(it.y)}); ${n1(it.w)} × ${n1(it.d)} × ${n1(itemHeight(it))}″; rot ${it.rot ?? 0}°; ${paintStr(p)}${it.est ? '; size/position estimated' : ''}`,
    );
    for (const a of it.anchors ?? []) {
      out.push(`    anchored: ${a.edge ?? 'near'} edge ${n1(anchorDistance(plan, it, a))}″ from [${a.wall}] ${wallName(plan, a.wall)}`);
    }
    if (itemType(it) !== 'rug') {
      const cl = clearances(plan, it)
        .map((c) => `${c.dir} ${n1(c.dist)}″ to ${c.to}`)
        .join('; ');
      if (cl) out.push(isOverhead(it) ? `    hangs ${n1(itemHeight(it))}″ below the ceiling; to walls: ${cl}` : `    open floor: ${cl}`);
    }
  }
  const est = listEstimates(plan);
  if (est.length) {
    out.push('');
    out.push('## Still estimates (worth measuring)');
    for (const e of est) out.push(`- ${e.label}: ${e.ask}`);
  }
  if (plan.sketches?.length) {
    out.push('');
    out.push('## Sketches');
    plan.sketches.forEach((s, i) => out.push(`- #${i}: ${s.w}×${s.h}, ${s.pal.length} colors, ${s.paths.reduce((n, p) => n + p[1].length, 0)} chars of path data`));
  }
  if (opts.before) {
    out.push('');
    out.push('## Changes from the earlier version');
    const lines = summarizeDiff(diffPlans(opts.before, plan));
    out.push(...(lines.length ? lines.map((l) => `- ${l}`) : ['- No changes']));
  }
  return out.join('\n');
}
