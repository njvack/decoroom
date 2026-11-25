import { useEffect, useMemo, useRef } from 'preact/hooks';
import { refreshAnchors } from '../model/anchors';
import { featureBottom, featureHeight } from '../model/defaults';
import { wallName } from '../model/estimates';
import { randomId } from '../model/normalize';
import type { Item } from '../model/types';
import { renderElevation } from '../render/elevation';
import { CSS_THEME } from '../render/theme';
import { Inspector, PieceList } from './Inspector';
import { DiffBanner, HelpPanel, HistoryPanel, SharePanel, Welcome } from './Panels';
import { PlanView, toVNode } from './PlanView';
import { canRedo, canUndo, commit, markMajor, redo, S, set, undo, units, useApp, type Drawer } from './store';
import type { ThreeView } from './three-view';

function ElevationView() {
  const s = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ k: number; gx: number; gy: number } | null>(null);
  const wall = Math.min(s.wall, s.plan.walls.length - 1);
  const selFeat = s.sel?.kind === 'feature' && s.sel.wall === wall ? s.sel.index : undefined;
  const tree = useMemo(() => renderElevation(s.plan, wall, { theme: CSS_THEME, units: units(), interactive: true, selectedFeature: selFeat }), [s.plan, wall, selFeat]);
  const H = s.plan.ceiling || 96;
  const pt = (e: PointerEvent): [number, number] => {
    const svg = wrap.current!.querySelector('svg')!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, H - q.y];
  };
  return (
    <div class="elev">
      <div class="row elev-bar">
        <label class="f inline">
          <span>Wall</span>
          <select value={String(wall)} onChange={(e) => set({ wall: +(e.target as HTMLSelectElement).value, sel: { kind: 'wall', wall: +(e.target as HTMLSelectElement).value } })}>
            {s.plan.walls.map((_, i) => (
              <option key={i} value={String(i)}>
                {wallName(s.plan, i)}
              </option>
            ))}
          </select>
        </label>
        <button
          class="small"
          onClick={() => {
            const plan = S.plan;
            const index = (plan.walls[wall].features ?? []).length;
            const L = Math.hypot(plan.verts[(wall + 1) % plan.verts.length][0] - plan.verts[wall][0], plan.verts[(wall + 1) % plan.verts.length][1] - plan.verts[wall][1]);
            const art = { kind: 'art' as const, at: Math.max(0, Math.round(L / 2 - 15)), w: Math.min(30, L), h: 24, y: 54, label: 'Art' };
            const walls = plan.walls.map((w, i) => (i === wall ? { ...w, features: [...(w.features ?? []), art] } : w));
            commit({ ...plan, walls });
            set({ sel: { kind: 'feature', wall, index } });
          }}
        >
          Hang art
        </button>
        <span class="hint">Drag art and windows to move them. Pieces within 3′ of the wall are shown.</span>
      </div>
      <div
        class="canvas"
        ref={wrap}
        onPointerDown={(e) => {
          const t = (e.target as Element).closest('[data-feat]');
          if (!t) {
            set({ sel: { kind: 'wall', wall } });
            return;
          }
          const [, k] = t.getAttribute('data-feat')!.split(':').map(Number);
          const ft = S.plan.walls[wall].features![k];
          const [x, y] = pt(e as unknown as PointerEvent);
          set({ sel: { kind: 'feature', wall, index: k } });
          drag.current = { k, gx: x - ft.at, gy: y - featureBottom(ft) };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const [x, y] = pt(e as unknown as PointerEvent);
          const walls = S.plan.walls.map((w, i) => {
            if (i !== wall) return w;
            const features = [...(w.features ?? [])];
            const ft = features[d.k];
            const L = Math.hypot(S.plan.verts[(wall + 1) % S.plan.verts.length][0] - S.plan.verts[wall][0], S.plan.verts[(wall + 1) % S.plan.verts.length][1] - S.plan.verts[wall][1]);
            const at = Math.round(Math.min(Math.max(0, x - d.gx), L - ft.w) * 2) / 2;
            const movesUp = ft.kind === 'art' || ft.kind === 'window';
            const yy = movesUp ? Math.round(Math.min(Math.max(0, y - d.gy), H - featureHeight(ft)) * 2) / 2 : ft.y;
            features[d.k] = { ...ft, at, ...(movesUp ? { y: yy } : {}) };
            return { ...w, features };
          });
          commit({ ...S.plan, walls }, { coalesce: `elev:${wall}:${d.k}` });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {toVNode(tree)}
      </div>
    </div>
  );
}

function ThreeD() {
  const s = useApp();
  const el = useRef<HTMLDivElement>(null);
  const view = useRef<ThreeView | null>(null);
  useEffect(() => {
    let dead = false;
    void import('./three-view').then((m) => {
      if (dead || !el.current) return;
      view.current = m.mountThree(el.current, S.plan);
    });
    return () => {
      dead = true;
      view.current?.dispose();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => view.current?.update(s.plan), 120);
    return () => clearTimeout(t);
  }, [s.plan]);
  return (
    <div class="three" ref={el}>
      <div class="three-msg">Drag to orbit, pinch or scroll to zoom, right-drag to pan. Walls facing you turn see-through.</div>
    </div>
  );
}

function Drawer({ which }: { which: Exclude<Drawer, null> }) {
  const title = { history: 'History', share: 'Share', help: 'How it works' }[which];
  return (
    <div class="drawer" role="dialog" aria-label={title}>
      <div class="card-head">
        <h2>{title}</h2>
        <button class="small ghost" aria-label="Close" onClick={() => set({ drawer: null })}>
          ✕
        </button>
      </div>
      {which === 'history' ? <HistoryPanel /> : which === 'share' ? <SharePanel /> : <HelpPanel />}
    </div>
  );
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName ?? '');
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void markMajor();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') {
        set({ sel: null, drawer: null });
        return;
      }
      const sel = S.sel;
      if (sel?.kind !== 'item') return;
      const it = S.plan.items.find((i) => i.id === sel.id);
      if (!it) return;
      const step = e.shiftKey ? 6 : 1;
      const mv = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
      const cur: Item = it;
      const put = (fn: (x: Item) => Item, key?: string) =>
        commit({ ...S.plan, items: S.plan.items.map((x) => (x.id === cur.id ? refreshAnchors(S.plan, fn(x)) : x)) }, { coalesce: key });
      if (mv) {
        e.preventDefault();
        put((x) => ({ ...x, x: x.x + mv[0], y: x.y + mv[1] }), `nudge:${it.id}`);
      } else if (e.key === 'r' || e.key === 'R') {
        put((x) => ({ ...x, rot: ((x.rot ?? 0) + 90) % 360 || undefined }));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commit({ ...S.plan, items: S.plan.items.filter((x) => x.id !== it.id) });
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const c = { ...structuredClone(it), id: randomId(), x: it.x + 12, y: it.y + 12, anchors: undefined };
        commit({ ...S.plan, items: [...S.plan.items, c] });
        set({ sel: { kind: 'item', id: c.id } });
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const s = useApp();
  useKeys();
  const tab = (v: typeof s.view, label: string) => (
    <button aria-pressed={s.view === v} onClick={() => set({ view: v, wall: v === 'wall' && s.sel && s.sel.kind !== 'item' ? s.sel.wall : s.wall })}>
      {label}
    </button>
  );
  return (
    <div class="app">
      <header class="top">
        <div class="brand">
          <span class="logo" aria-hidden="true">
            ▦
          </span>
          <input class="title" value={s.plan.name ?? ''} placeholder="Untitled room" aria-label="Room name" onInput={(e) => commit({ ...S.plan, name: (e.target as HTMLInputElement).value || undefined }, { coalesce: 'name' })} />
        </div>
        <nav class="tools">
          <div class="seg" role="group" aria-label="View">
            {tab('plan', 'Plan')}
            {tab('wall', 'Walls')}
            {tab('3d', '3D')}
          </div>
          {s.view === 'plan' && (
            <div class="seg" role="group" aria-label="Mode">
              <button aria-pressed={s.mode === 'furnish'} onClick={() => set({ mode: 'furnish' })}>
                Furnish
              </button>
              <button aria-pressed={s.mode === 'room'} onClick={() => set({ mode: 'room' })}>
                Edit room
              </button>
            </div>
          )}
          <button class="icon" disabled={!canUndo()} onClick={undo} title="Undo (⌘Z)" aria-label="Undo">
            ↶
          </button>
          <button class="icon" disabled={!canRedo()} onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo">
            ↷
          </button>
          <button onClick={() => set({ drawer: s.drawer === 'history' ? null : 'history' })} aria-pressed={s.drawer === 'history'}>
            History
          </button>
          <button class="pri" onClick={() => set({ drawer: s.drawer === 'share' ? null : 'share' })} aria-pressed={s.drawer === 'share'}>
            Share
          </button>
          <button class="icon" onClick={() => set({ drawer: s.drawer === 'help' ? null : 'help' })} title="How it works" aria-label="How it works">
            ?
          </button>
        </nav>
      </header>
      {s.error && (
        <div class="banner error" role="alert">
          <strong>That link didn't open.</strong> {s.error}
          <button class="small" onClick={() => set({ error: null })}>
            OK
          </button>
        </div>
      )}
      <main class="main">
        <div class="stage">
          <Welcome />
          <DiffBanner />
          {s.view === 'plan' && <PlanView />}
          {s.view === 'wall' && <ElevationView />}
          {s.view === '3d' && <ThreeD />}
          {s.view === 'plan' && (
            <p class="legend">
              {s.mode === 'room'
                ? 'Drag corners to reshape the room. ＋ adds a corner. Click a wall to name it or add doors and windows.'
                : 'Drag to move · round handle rotates · square handle resizes · dashed = estimate · grid = 1 ft'}
            </p>
          )}
        </div>
        <aside class="side">
          {s.drawer && <Drawer which={s.drawer} />}
          <Inspector />
          <section class="card">
            <div class="card-head">
              <h2>Furniture</h2>
            </div>
            <PieceList />
          </section>
        </aside>
      </main>
      {s.toast && (
        <div class="toast" role="status">
          {s.toast}
        </div>
      )}
    </div>
  );
}
