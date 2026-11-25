import { h as ph, type VNode } from 'preact';
import { useMemo, useRef } from 'preact/hooks';
import { refreshAnchors } from '../model/anchors';
import { itemExtent, round, wallDistance, wallFrame, wallFrames, wallParam, rotate } from '../model/geometry';
import { moveVertex, splitWall } from '../model/room';
import type { Item, Plan, Vec } from '../model/types';
import { type El } from '../render/el';
import { renderPlan } from '../render/plan';
import { CSS_THEME } from '../render/theme';
import { CONFIG } from '../config';
import { beginTx, commit, endTx, S, set, units, useApp } from './store';

export function toVNode(el: El | string, key?: number): VNode | string {
  if (typeof el === 'string') return el;
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(el.a)) if (v !== undefined && v !== null && v !== false) props[k] = v;
  return ph(el.t, props, ...el.c.map((c, i) => toVNode(c, i)));
}

type Drag =
  | { kind: 'move'; id: string; dx: number; dy: number }
  | { kind: 'rot'; id: string }
  | { kind: 'size'; id: string; anchor: Vec }
  | { kind: 'vert'; i: number }
  | { kind: 'feat'; wall: number; index: number; grab: number };

export function updateItem(plan: Plan, id: string, fn: (it: Item) => Item): Plan {
  return { ...plan, items: plan.items.map((it) => (it.id === id ? refreshAnchors(plan, fn(it)) : it)) };
}

/** Pull a piece flush against walls it's close to. */
function snapToWalls(plan: Plan, it: Item): Item {
  let { x, y } = it;
  for (const f of wallFrames(plan)) {
    const t = wallParam(f, [x, y]);
    if (t < -6 || t > f.len + 6) continue;
    const d = wallDistance(f, [x, y]) - itemExtent(it, f.n);
    if (Math.abs(d) < CONFIG.wallSnap) {
      x -= f.n[0] * d;
      y -= f.n[1] * d;
    }
  }
  return { ...it, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

export function PlanView() {
  const s = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const u = units();
  const tree = useMemo(
    () =>
      renderPlan(s.plan, {
        theme: CSS_THEME,
        units: u,
        selection: s.sel,
        mode: s.mode,
        interactive: true,
        ghosts: s.diff?.ghosts,
        changed: s.diff?.changed,
      }),
    [s.plan, s.sel, s.mode, s.diff, u],
  );

  function pt(e: PointerEvent): Vec {
    const svg = wrap.current!.querySelector('svg')!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  }

  function onDown(e: PointerEvent) {
    const t = e.target as Element;
    const at = (name: string) => t.closest(`[${name}]`)?.getAttribute(name) ?? null;
    const P = pt(e);
    const hnd = at('data-h');
    const item = at('data-item');
    const vert = at('data-vert');
    const split = at('data-split');
    const feat = at('data-feat');
    const wall = at('data-wall');
    let d: Drag | null = null;
    if (hnd && S.sel?.kind === 'item') {
      const it = S.plan.items.find((i) => i.id === (S.sel as { id: string }).id)!;
      if (hnd === 'rot') d = { kind: 'rot', id: it.id };
      else {
        const a = rotate([-it.w / 2, -it.d / 2], it.rot ?? 0);
        d = { kind: 'size', id: it.id, anchor: [it.x + a[0], it.y + a[1]] };
      }
    } else if (vert !== null) {
      d = { kind: 'vert', i: +vert };
    } else if (split !== null) {
      commit(splitWall(S.plan, +split));
      return;
    } else if (feat !== null) {
      const [w, k] = feat.split(':').map(Number);
      const f = wallFrame(S.plan, w);
      const ft = S.plan.walls[w].features![k];
      set({ sel: { kind: 'feature', wall: w, index: k } });
      d = { kind: 'feat', wall: w, index: k, grab: wallParam(f, P) - ft.at };
    } else if (item !== null) {
      const it = S.plan.items.find((i) => i.id === item)!;
      set({ sel: { kind: 'item', id: item } });
      d = { kind: 'move', id: item, dx: P[0] - it.x, dy: P[1] - it.y };
    } else if (wall !== null) {
      set({ sel: { kind: 'wall', wall: +wall } });
      return;
    } else {
      set({ sel: null });
      return;
    }
    drag.current = d;
    beginTx();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const P = pt(e);
    const plan = S.plan;
    if (d.kind === 'move') {
      commit(
        updateItem(plan, d.id, (it) => {
          const moved = { ...it, x: round(P[0] - d.dx), y: round(P[1] - d.dy) };
          return e.altKey ? moved : snapToWalls(plan, moved);
        }),
      );
    } else if (d.kind === 'rot') {
      commit(
        updateItem(plan, d.id, (it) => {
          let a = (Math.atan2(P[1] - it.y, P[0] - it.x) * 180) / Math.PI + 90;
          a = e.altKey ? Math.round(a) : Math.round(a / 15) * 15;
          return { ...it, rot: ((a % 360) + 360) % 360 || undefined };
        }),
      );
    } else if (d.kind === 'size') {
      commit(
        updateItem(plan, d.id, (it) => {
          const q = rotate([P[0] - d.anchor[0], P[1] - d.anchor[1]], -(it.rot ?? 0));
          let w = Math.max(2, round(q[0]));
          let dd = Math.max(1, round(q[1]));
          if (it.shape === 'round' && !e.shiftKey && it.w === it.d) w = dd = Math.max(w, dd);
          const c = rotate([w / 2, dd / 2], it.rot ?? 0);
          return { ...it, w, d: dd, x: round(d.anchor[0] + c[0], 0.25), y: round(d.anchor[1] + c[1], 0.25) };
        }),
      );
    } else if (d.kind === 'vert') {
      const n = plan.verts.length;
      let [x, y] = P;
      if (!e.altKey) {
        for (const j of [(d.i - 1 + n) % n, (d.i + 1) % n]) {
          const v = plan.verts[j];
          if (Math.abs(v[0] - x) < 4) x = v[0];
          if (Math.abs(v[1] - y) < 4) y = v[1];
        }
      }
      commit(moveVertex(plan, d.i, [x, y]));
    } else if (d.kind === 'feat') {
      const f = wallFrame(plan, d.wall);
      const walls = plan.walls.map((w, i) => {
        if (i !== d.wall) return w;
        const features = [...(w.features ?? [])];
        const ft = features[d.index];
        features[d.index] = { ...ft, at: round(Math.min(Math.max(0, wallParam(f, P) - d.grab), f.len - ft.w)) };
        return { ...w, features };
      });
      commit({ ...plan, walls });
    }
  }

  function onUp() {
    if (drag.current) {
      drag.current = null;
      endTx();
    }
  }

  return (
    <div
      class={`canvas mode-${s.mode}`}
      ref={wrap}
      onPointerDown={onDown as never}
      onPointerMove={onMove as never}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {toVNode(tree)}
    </div>
  );
}
