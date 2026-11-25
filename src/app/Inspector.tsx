import { useEffect, useRef } from 'preact/hooks';
import { autoAnchors, refreshAnchors, solveAnchors } from '../model/anchors';
import { featureBottom, featureHeight, itemHeight, itemPaint, PRESETS, ROOM_TEMPLATES, TYPE_INFO } from '../model/defaults';
import { listEstimates, clearEstimate, wallName } from '../model/estimates';
import { bounds, pointInPolygon, wallFrame } from '../model/geometry';
import { randomId } from '../model/normalize';
import { setVerts, setWallLength } from '../model/room';
import { pruneSketches } from '../model/sketch';
import { EDGES, FEATURE_KINDS, ITEM_TYPES, SHAPES, type Anchor, type Feature, type Item, type Plan, type Sketch } from '../model/types';
import { fmtLen } from '../model/units';
import { Check, NumField, PaintPicker, Row, Select, TextField } from './fields';
import { commit, S, set, toast, units, useApp } from './store';

const EDGE_LABELS: Record<string, string> = { near: 'Closest edge', center: 'Center', far: 'Far edge' };
const KIND_LABELS: Record<string, string> = { door: 'Door', opening: 'Opening', slider: 'Sliding door', window: 'Window', fireplace: 'Fireplace', art: 'Wall art' };

function setItem(id: string, fn: (it: Item) => Item, coalesce?: string) {
  const plan = S.plan;
  commit({ ...plan, items: plan.items.map((it) => (it.id === id ? solveAnchors(plan, fn(it)) : it)) }, { coalesce });
}

function withSketches(plan: Plan, sketches?: Sketch[]): Plan {
  return pruneSketches(sketches ? { ...plan, sketches } : plan);
}

export function addPiece(index: number) {
  const pr = PRESETS[index];
  const plan = S.plan;
  const b = bounds(plan.verts);
  let c: [number, number] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  if (!pointInPolygon(c, plan.verts)) {
    const v = plan.verts;
    c = [(v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3];
  }
  const it: Item = { id: randomId(), name: pr.name, x: Math.round(c[0]), y: Math.round(c[1]), ...structuredClone(pr.item) };
  // Anchor to the nearest walls so it follows them if the room changes.
  it.anchors = autoAnchors(plan, it);
  if (!it.anchors.length) delete it.anchors;
  commit({ ...plan, items: [...plan.items, it] });
  set({ sel: { kind: 'item', id: it.id } });
}

function ItemPanel({ it }: { it: Item }) {
  const plan = S.plan;
  const up = (patch: Partial<Item>, key?: string) => setItem(it.id, (x) => ({ ...x, ...patch }), key ? `${it.id}:${key}` : undefined);
  const anchors = it.anchors ?? [];
  const setAnchors = (a: Anchor[]) => setItem(it.id, (x) => refreshAnchors(plan, { ...x, anchors: a.length ? a : undefined }));
  return (
    <div class="stack">
      <TextField label="Name" value={it.name} onChange={(v) => up({ name: v || undefined }, 'name')} />
      <Row>
        <Select label="Kind" value={it.type ?? 'box'} options={ITEM_TYPES.map((t) => [t, TYPE_INFO[t].label] as const)} onChange={(v) => up({ type: v === 'box' ? undefined : v, ...(it.shape === 'L' && v !== 'seat' ? { shape: undefined } : {}) })} />
        <Select label="Shape" value={it.shape ?? 'rect'} options={SHAPES.filter((t) => t !== 'L' || it.type === 'seat').map((t) => [t, t === 'rect' ? 'Rectangle' : t === 'round' ? 'Round' : 'L (sectional)'] as const)} onChange={(v) => up({ shape: v === 'rect' ? undefined : v })} />
        <NumField label="Width" value={it.w} min={1} onChange={(v) => setItem(it.id, (x) => refreshAnchors(plan, { ...x, w: v }), `${it.id}:w`)} />
        <NumField label="Depth" value={it.d} min={1} onChange={(v) => setItem(it.id, (x) => refreshAnchors(plan, { ...x, d: v }), `${it.id}:d`)} />
        <NumField label={it.type === 'light' ? 'Hangs below ceiling' : 'Height'} value={itemHeight(it)} min={0} onChange={(v) => up({ h: v }, 'h')} />
        <NumField label="Rotation (°)" raw step={15} value={it.rot ?? 0} onChange={(v) => setItem(it.id, (x) => ({ ...x, rot: ((v % 360) + 360) % 360 || undefined }), `${it.id}:rot`)} />
      </Row>
      {it.shape === 'L' && (
        <Row>
          <NumField label="Seat depth" value={it.seatDepth ?? it.d * 0.6} onChange={(v) => up({ seatDepth: v }, 'sd')} />
          <NumField label="Chaise width" value={it.chaiseWidth ?? it.w * 0.4} onChange={(v) => up({ chaiseWidth: v }, 'cw')} />
          <Select label="Chaise side" value={it.chaiseSide ?? 'right'} options={[['right', 'Right'], ['left', 'Left']] as const} onChange={(v) => up({ chaiseSide: v === 'right' ? undefined : v })} />
        </Row>
      )}
      <Check label="Some sizes are estimates (needs measuring)" value={it.est} onChange={(v) => up({ est: v || undefined })} />

      <h3>Position</h3>
      {anchors.length ? (
        <p class="hint">Measured from walls. If a wall moves, this piece moves with it.</p>
      ) : (
        <p class="hint">Not tied to any wall. Add a measurement to keep it a set distance from a wall.</p>
      )}
      {anchors.map((a, k) => (
        <div class="anchor" key={k}>
          <Select label="Edge" value={a.edge ?? 'near'} options={EDGES.map((e) => [e, EDGE_LABELS[e]] as const)} onChange={(v) => setAnchors(anchors.map((x, j) => (j === k ? { ...x, edge: v === 'near' ? undefined : v } : x)))} />
          <NumField label="Distance" value={a.dist} onChange={(v) => setItem(it.id, (x) => ({ ...x, anchors: anchors.map((y, j) => (j === k ? { ...y, dist: v } : y)) }), `${it.id}:a${k}`)} />
          <Select label="From wall" value={String(a.wall)} options={plan.walls.map((_, i) => [String(i), wallName(plan, i)] as const)} onChange={(v) => setAnchors(anchors.map((x, j) => (j === k ? { ...x, wall: +v } : x)))} />
          <button class="small ghost" aria-label="Remove this measurement" onClick={() => setAnchors(anchors.filter((_, j) => j !== k))}>
            ✕
          </button>
        </div>
      ))}
      <div class="row">
        {anchors.length < 2 && (
          <button
            class="small"
            onClick={() => {
              const auto = autoAnchors(plan, it).filter((a) => !anchors.some((b) => b.wall === a.wall));
              const add = auto[0] ?? { wall: (anchors[0]?.wall ?? -1) + 1 < plan.walls.length ? (anchors[0]?.wall ?? -1) + 1 : 0, dist: 0 };
              setAnchors([...anchors, add]);
            }}
          >
            Measure from a wall
          </button>
        )}
        {!anchors.length && (
          <>
            <NumField label="Center x" value={it.x} onChange={(v) => up({ x: v }, 'x')} />
            <NumField label="Center y" value={it.y} onChange={(v) => up({ y: v }, 'y')} />
          </>
        )}
      </div>

      <h3>Look</h3>
      <PaintPicker
        label="Color"
        plan={plan}
        value={itemPaint(it)}
        fallback={TYPE_INFO[it.type ?? 'box'].paint.color!}
        onChange={(p, sk) => {
          const next = { ...S.plan, items: S.plan.items.map((x) => (x.id === it.id ? { ...x, paint: p } : x)) };
          commit(withSketches(next, sk), { coalesce: sk ? undefined : `${it.id}:paint` });
        }}
      />

      <div class="row">
        <button onClick={() => setItem(it.id, (x) => ({ ...x, rot: ((x.rot ?? 0) + 90) % 360 || undefined }))}>Rotate 90°</button>
        {it.shape === 'L' && <button onClick={() => up({ chaiseSide: it.chaiseSide === 'left' ? undefined : 'left' })}>Flip chaise</button>}
        <button
          onClick={() => {
            const c: Item = { ...structuredClone(it), id: randomId(), x: it.x + 12, y: it.y + 12, anchors: undefined };
            commit({ ...plan, items: [...plan.items, c] });
            set({ sel: { kind: 'item', id: c.id } });
          }}
        >
          Duplicate
        </button>
        <button class="danger" onClick={() => commit({ ...plan, items: plan.items.filter((x) => x.id !== it.id) })}>
          Remove
        </button>
      </div>
    </div>
  );
}

function FeatureFields({ wall, k, ft }: { wall: number; k: number; ft: Feature }) {
  const plan = S.plan;
  const f = wallFrame(plan, wall);
  const put = (patch: Partial<Feature>, key?: string, sketches?: Sketch[]) => {
    const walls = S.plan.walls.map((w, i) => {
      if (i !== wall) return w;
      const features = [...(w.features ?? [])];
      const next = { ...features[k], ...patch };
      for (const key of Object.keys(next) as (keyof Feature)[]) if (next[key] === undefined) delete next[key];
      next.w = Math.min(Math.max(1, next.w), f.len);
      next.at = Math.min(Math.max(0, next.at), f.len - next.w);
      features[k] = next;
      return { ...w, features };
    });
    commit(withSketches({ ...S.plan, walls }, sketches), { coalesce: key ? `f${wall}:${k}:${key}` : undefined });
  };
  const sel = S.sel?.kind === 'feature' && S.sel.wall === wall && S.sel.index === k;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sel && !ref.current?.contains(document.activeElement)) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [sel]);
  const prev = wallName(plan, (wall - 1 + plan.walls.length) % plan.walls.length);
  const next = wallName(plan, (wall + 1) % plan.walls.length);
  return (
    <div ref={ref} class={`feature${sel ? ' on' : ''}`} onFocusCapture={() => !sel && set({ sel: { kind: 'feature', wall, index: k } })}>
      <div class="row">
        <TextField label="Label" value={ft.label} placeholder={KIND_LABELS[ft.kind]} onChange={(v) => put({ label: v || undefined }, 'label')} />
        <Select label="Type" value={ft.kind} options={FEATURE_KINDS.map((x) => [x, KIND_LABELS[x]] as const)} onChange={(v) => put({ kind: v })} />
      </div>
      <Row>
        <NumField label={`From ${prev} corner`} value={ft.at} onChange={(v) => put({ at: v }, 'at')} />
        <NumField label="Width" value={ft.w} min={1} onChange={(v) => put({ w: v }, 'w')} />
        <NumField label={`To ${next} corner`} value={f.len - ft.at - ft.w} onChange={(v) => put({ at: f.len - ft.w - v }, 'to')} />
        {(ft.kind === 'window' || ft.kind === 'art' || ft.kind === 'door' || ft.kind === 'fireplace') && (
          <NumField label="Height" value={featureHeight(ft)} onChange={(v) => put({ h: v }, 'h')} />
        )}
        {(ft.kind === 'window' || ft.kind === 'art') && <NumField label="Bottom above floor" value={featureBottom(ft)} onChange={(v) => put({ y: v }, 'y')} />}
        {ft.kind === 'fireplace' && <NumField label="Hearth depth" value={ft.depth ?? 0} onChange={(v) => put({ depth: v || undefined }, 'depth')} />}
        {ft.kind === 'door' && (
          <>
            <Select label="Hinge" value={ft.hinge ?? 'start'} options={[['start', `${prev} side`], ['end', `${next} side`]] as const} onChange={(v) => put({ hinge: v === 'end' ? 'end' : undefined })} />
            <Select label="Opens" value={ft.swing ?? 'in'} options={[['in', 'Into this room'], ['out', 'Away from this room']] as const} onChange={(v) => put({ swing: v === 'out' ? 'out' : undefined })} />
          </>
        )}
      </Row>
      {ft.kind === 'art' && (
        <PaintPicker label="Art" plan={plan} value={ft.paint} fallback="c97b4a" onChange={(p, sk) => put({ paint: p }, sk ? undefined : 'paint', sk)} />
      )}
      <div class="row">
        <Check label="Estimate" value={ft.est} onChange={(v) => put({ est: v || undefined })} />
        <button
          class="small danger"
          onClick={() => {
            const walls = plan.walls.map((w, i) => (i === wall ? { ...w, features: (w.features ?? []).filter((_, j) => j !== k) } : w));
            commit({ ...plan, walls });
            set({ sel: { kind: 'wall', wall } });
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function WallPanel({ wall }: { wall: number }) {
  const plan = S.plan;
  const w = plan.walls[wall];
  const f = wallFrame(plan, wall);
  const putWall = (patch: Partial<typeof w>, key?: string, sketches?: Sketch[]) => {
    const walls = S.plan.walls.map((x, i) => (i === wall ? { ...x, ...patch } : x));
    commit(withSketches({ ...S.plan, walls }, sketches), { coalesce: key ? `w${wall}:${key}` : undefined });
  };
  const kind = S.newFeatureKind;
  const setKind = (k: Feature['kind']) => set({ newFeatureKind: k });
  return (
    <div class="stack">
      <TextField label="Wall name" value={w.name} placeholder={`Wall ${wall + 1}`} onChange={(v) => putWall({ name: v || undefined }, 'name')} />
      <Row>
        <NumField label="Length" value={Math.round(f.len * 100) / 100} min={6} onChange={(v) => commit(setWallLength(S.plan, wall, v), { coalesce: `w${wall}:len` })} />
        <div class="f">
          <span>&nbsp;</span>
          <Check label="Length is an estimate" value={w.est} onChange={(v) => putWall({ est: v || undefined })} />
        </div>
      </Row>
      <p class="hint">Changing the length stretches the room along this wall. Pieces measured from walls move with them.</p>
      <div class="row">
        <button class="small" onClick={() => set({ view: 'wall', wall })}>
          Look at this wall
        </button>
      </div>
      <PaintPicker label="Wall color" plan={plan} value={w.paint} fallback="a9b59b" onChange={(p, sk) => putWall({ paint: p }, sk ? undefined : 'paint', sk)} />
      <h3>Doors, windows &amp; art</h3>
      {(w.features ?? []).map((ft, k) => (
        <FeatureFields key={k} wall={wall} k={k} ft={ft} />
      ))}
      <div class="row">
        <select value={kind ?? 'door'} aria-label="Kind to add" onChange={(e) => setKind((e.target as HTMLSelectElement).value as Feature['kind'])}>
          {FEATURE_KINDS.map((x) => (
            <option key={x} value={x}>
              {KIND_LABELS[x]}
            </option>
          ))}
        </select>
        <button
          class="pri"
          onClick={() => {
            const k: Feature['kind'] = kind ?? 'door';
            const width = Math.min(f.len, { door: 30, opening: 36, slider: 72, window: 36, fireplace: 56, art: 30 }[k]);
            const ft: Feature = { kind: k, at: Math.max(0, Math.round((f.len - width) / 2)), w: width };
            if (k === 'fireplace') ft.depth = 16;
            const walls = plan.walls.map((x, i) => (i === wall ? { ...x, features: [...(x.features ?? []), ft] } : x));
            commit({ ...plan, walls });
            set({ sel: { kind: 'feature', wall, index: (w.features ?? []).length } });
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function RoomPanel() {
  const plan = S.plan;
  const est = listEstimates(plan);
  const put = (patch: Partial<Plan>, key?: string) => commit({ ...S.plan, ...patch }, { coalesce: key });
  const u = units();
  return (
    <div class="stack">
      <TextField label="Room name" value={plan.name} placeholder="Living room" onChange={(v) => put({ name: v || undefined }, 'name')} />
      <Row>
        <Select label="Units" value={u} options={[['in', 'Feet & inches'], ['cm', 'Metric']] as const} onChange={(v) => put({ units: v })} />
        <NumField label="Ceiling" value={plan.ceiling ?? 96} onChange={(v) => put({ ceiling: v === 96 ? undefined : v }, 'ceil')} />
      </Row>
      <PaintPicker label="Floor" plan={plan} value={plan.floor} fallback="e4e2dc" onChange={(p, sk) => commit(withSketches({ ...S.plan, floor: p }, sk), { coalesce: sk ? undefined : 'floor' })} />
      <details>
        <summary>Room shape</summary>
        <p class="hint">Switch to “Edit room” above to drag corners and add corners with ＋. Or start from a shape (pieces stay put):</p>
        <div class="row">
          {ROOM_TEMPLATES.map((t) => (
            <button key={t.name} class="small" onClick={() => commit(setVerts(S.plan, t.verts))}>
              {t.name}
            </button>
          ))}
        </div>
      </details>
      <TextField label="Notes" area value={plan.notes} placeholder="Anything worth remembering: colors, materials, what's staying" onChange={(v) => put({ notes: v || undefined }, 'notes')} />
      {est.length > 0 && (
        <>
          <h3>To measure ({est.length})</h3>
          <p class="hint">These are guesses. Measure them, update the numbers, then tick them off.</p>
          <ul class="measure">
            {est.map((e, i) => (
              <li key={i}>
                <button
                  class="link"
                  onClick={() =>
                    set({
                      sel: e.ref.kind === 'item' ? { kind: 'item', id: e.ref.id } : e.ref.kind === 'wall' ? { kind: 'wall', wall: e.ref.wall } : { kind: 'feature', wall: e.ref.wall, index: e.ref.index },
                    })
                  }
                >
                  {e.label}
                </button>
                <span class="hint"> {e.ask}</span>
                <button class="small ghost" title="Mark as measured" aria-label={`Mark ${e.label} as measured`} onClick={() => { commit(clearEstimate(S.plan, e.ref)); toast(`${e.label} marked as measured`); }}>
                  ✓
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function PieceList() {
  const s = useApp();
  const u = units();
  return (
    <div class="stack">
      <div class="list">
        {s.plan.items.map((it) => (
          <button key={it.id} class={`li${s.sel?.kind === 'item' && s.sel.id === it.id ? ' on' : ''}${s.diff?.changed.includes(it.id) ? ' changed' : ''}`} onClick={() => set({ sel: { kind: 'item', id: it.id } })}>
            <span>
              {it.name || TYPE_INFO[it.type ?? 'box'].label}
              {it.est && <span class="chip">est</span>}
            </span>
            <span class="dims">
              {fmtLen(it.w, u, { short: true })} × {fmtLen(it.d, u, { short: true })}
            </span>
          </button>
        ))}
      </div>
      <div class="row">
        <select id="preset" aria-label="Piece to add">
          {PRESETS.map((p, i) => (
            <option key={i} value={String(i)}>
              {p.name} · {fmtLen(p.item.w, u, { short: true })} × {fmtLen(p.item.d, u, { short: true })}
            </option>
          ))}
        </select>
        <button class="pri" onClick={() => addPiece(+(document.getElementById('preset') as HTMLSelectElement).value)}>
          Add
        </button>
      </div>
    </div>
  );
}

export function Inspector() {
  const s = useApp();
  const sel = s.sel;
  let title = 'Room';
  let body = <RoomPanel />;
  if (sel?.kind === 'item') {
    const it = s.plan.items.find((x) => x.id === sel.id);
    if (it) {
      title = it.name || 'Piece';
      body = <ItemPanel key={it.id} it={it} />;
    }
  } else if (sel && (sel.kind === 'wall' || sel.kind === 'feature') && s.plan.walls[sel.wall]) {
    title = wallName(s.plan, sel.wall);
    body = <WallPanel key={sel.wall} wall={sel.wall} />;
  }
  return (
    <section class="card">
      <div class="card-head">
        <h2>{title}</h2>
        {sel && (
          <button class="small ghost" onClick={() => set({ sel: null })}>
            Room settings
          </button>
        )}
      </div>
      {body}
    </section>
  );
}

