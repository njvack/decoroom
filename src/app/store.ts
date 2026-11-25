import { useEffect, useReducer } from 'preact/hooks';
import { buildHash, decodePlan, encodePlan, newRoomId, parseHash } from '../codec/hash';
import { CONFIG } from '../config';
import { diffPlans, summarizeDiff } from '../model/diff';
import { emptyPlan } from '../model/normalize';
import { EXAMPLES } from '../model/examples';
import type { Feature, Item, Plan, Units } from '../model/types';
import { defaultUnits } from '../model/units';
import type { Selection } from '../render/plan';
import * as hist from './history';

export type View = 'plan' | 'wall' | '3d';
export type Drawer = null | 'history' | 'share' | 'help';

export interface DiffState {
  title: string;
  lines: string[];
  ghosts: Item[];
  changed: string[];
  /** Plan to go back to with "Go back to mine". */
  revertTo?: Plan;
}

export interface AppState {
  roomId: string;
  plan: Plan;
  sel: Selection;
  mode: 'furnish' | 'room';
  view: View;
  wall: number;
  drawer: Drawer;
  diff: DiffState | null;
  toast: string | null;
  error: string | null;
  /** Bumped when history changes, so panels reload. */
  historyRev: number;
  /** Key of the last saved version, for labeling after Cmd-S. */
  lastMajorKey: number | null;
  welcome: boolean;
  newFeatureKind: Feature['kind'];
}

type Listener = () => void;
const listeners = new Set<Listener>();

export const S: AppState = {
  roomId: newRoomId(),
  plan: emptyPlan(),
  sel: null,
  mode: 'furnish',
  view: 'plan',
  wall: 0,
  drawer: null,
  diff: null,
  toast: null,
  error: null,
  historyRev: 0,
  lastMajorKey: null,
  welcome: false,
  newFeatureKind: 'door',
};

export function emit() {
  for (const l of listeners) l();
}

export function set(patch: Partial<AppState>) {
  Object.assign(S, patch);
  emit();
}

/** Re-render the calling component on any state change. */
export function useApp(): AppState {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const l = () => force(0);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return S;
}

export function units(): Units {
  return S.plan.units ?? defaultUnits();
}

// ---------- undo

const undoStack: Plan[] = [];
const redoStack: Plan[] = [];
let lastCoalesce = { key: '', at: 0 };
let txBase: Plan | null = null;

/**
 * Replace the plan. `coalesce` groups rapid edits to the same thing
 * (typing in a field) into one undo step.
 */
export function commit(next: Plan, opts: { coalesce?: string; keepSel?: boolean } = {}) {
  if (next === S.plan) return;
  const now = Date.now();
  const same = opts.coalesce && opts.coalesce === lastCoalesce.key && now - lastCoalesce.at < CONFIG.coalesceMs;
  if (!txBase && !same) {
    undoStack.push(S.plan);
    if (undoStack.length > CONFIG.undoDepth) undoStack.shift();
    redoStack.length = 0;
  }
  lastCoalesce = { key: opts.coalesce ?? '', at: now };
  S.plan = next;
  if (S.sel?.kind === 'item' && !next.items.some((i) => i.id === (S.sel as { id: string }).id)) S.sel = null;
  if ((S.sel?.kind === 'wall' || S.sel?.kind === 'feature') && S.sel.wall >= next.walls.length) S.sel = null;
  changed();
}

/** Start a drag: intermediate commits share one undo step. */
export function beginTx() {
  if (!txBase) {
    txBase = S.plan;
  }
}

export function endTx() {
  if (txBase && txBase !== S.plan) {
    undoStack.push(txBase);
    redoStack.length = 0;
  }
  txBase = null;
}

export function undo() {
  const p = undoStack.pop();
  if (!p) return;
  redoStack.push(S.plan);
  S.plan = p;
  lastCoalesce = { key: '', at: 0 };
  changed();
}

export function redo() {
  const p = redoStack.pop();
  if (!p) return;
  undoStack.push(S.plan);
  S.plan = p;
  changed();
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

// ---------- hash + history sync

let hashTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let lastWrittenHash = '';
let lastSavedPacked = '';

function changed() {
  emit();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, CONFIG.hashMs);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => void saveVersion(false), CONFIG.settleMs);
}

function writeHash() {
  const hash = buildHash(S.roomId, S.plan);
  if (hash !== location.hash) {
    lastWrittenHash = hash;
    history.replaceState(null, '', hash);
  }
}

export function currentLink(): string {
  return location.href.replace(/#.*$/, '') + buildHash(S.roomId, S.plan);
}

/** Save a version now. Skips if nothing changed, unless marking it major. */
export async function saveVersion(major: boolean, label?: string, source: hist.VersionRecord['source'] = 'edit'): Promise<number | undefined> {
  clearTimeout(settleTimer);
  const packed = encodePlan(S.plan);
  if (packed === lastSavedPacked && !major) return undefined;
  lastSavedPacked = packed;
  const key = await hist.addVersion({ roomId: S.roomId, ts: Date.now(), packed, major, label, source }, S.plan.name || 'Untitled room');
  set({ historyRev: S.historyRev + 1 });
  return key;
}

export function flush() {
  clearTimeout(hashTimer);
  writeHash();
  void saveVersion(false);
}

export async function markMajor() {
  clearTimeout(settleTimer);
  const key = await saveVersion(true);
  set({ lastMajorKey: key ?? null });
  toast('Saved a major version. You can name it in History.');
  writeHash();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  clearTimeout(toastTimer);
  set({ toast: msg });
  toastTimer = setTimeout(() => set({ toast: null }), 2800);
}

/** Load a plan as the current room (resets undo). */
export function loadRoom(roomId: string, plan: Plan, opts: { diff?: DiffState | null } = {}) {
  undoStack.length = 0;
  redoStack.length = 0;
  S.roomId = roomId;
  S.plan = plan;
  S.sel = null;
  S.diff = opts.diff ?? null;
  S.error = null;
  lastSavedPacked = '';
  writeHash();
  emit();
}

function ghostsFor(before: Plan, after: Plan): { ghosts: Item[]; changed: string[]; lines: string[] } {
  const d = diffPlans(before, after);
  const ghosts: Item[] = [];
  const changedIds: string[] = [];
  for (const c of d.items) {
    if (c.kind === 'added') changedIds.push(c.id);
    if (c.kind === 'removed') ghosts.push(c.before);
    if (c.kind === 'changed') {
      changedIds.push(c.id);
      if (c.what.some((w) => /moved|rotated|resized/.test(w))) ghosts.push(c.before);
    }
  }
  return { ghosts, changed: changedIds, lines: summarizeDiff(d) };
}

/** Show the difference between `before` and the current plan. */
export function showDiff(before: Plan, title: string, revertTo?: Plan) {
  const g = ghostsFor(before, S.plan);
  set({ diff: { title, ...g, revertTo } });
}

/** Handle whatever is in the URL hash: a link from someone, an agent, or our own reload. */
export async function openFromHash(hash: string): Promise<void> {
  const st = parseHash(hash);
  if (st.error) {
    set({ error: st.error });
    return;
  }
  if (!st.plan && st.id) {
    // A bare room id: open it from history, or a built-in example.
    const v = await hist.latestVersion(st.id);
    const ex = EXAMPLES.find((e) => e.id === st.id);
    if (v || ex) {
      loadRoom(st.id, v ? decodePlan(v.packed) : ex!.plan);
      if (v) lastSavedPacked = v.packed;
      else await saveVersion(false);
      return;
    }
  }
  if (!st.plan) {
    // No room in the link: reopen the most recent room, or start fresh.
    const rooms = await hist.listRooms();
    if (rooms[0]) {
      const v = await hist.latestVersion(rooms[0].id);
      if (v) {
        loadRoom(rooms[0].id, decodePlan(v.packed));
        lastSavedPacked = v.packed;
        return;
      }
    }
    loadRoom(newRoomId(), emptyPlan());
    set({ welcome: true });
    return;
  }
  const roomId = st.id ?? newRoomId();
  const incoming = st.plan;
  const packed = encodePlan(incoming);
  const latest = await hist.latestVersion(roomId);
  let diff: DiffState | null = null;
  if (latest && latest.packed !== packed) {
    const mine = decodePlan(latest.packed);
    const g = ghostsFor(mine, incoming);
    if (g.lines.length) diff = { title: 'Changes in this link', ...g, revertTo: mine };
  }
  loadRoom(roomId, incoming, { diff });
  if (!latest || latest.packed !== packed) {
    await saveVersion(false, undefined, latest ? 'link' : 'edit');
  } else {
    lastSavedPacked = packed;
  }
  await hist.touchRoom(roomId, incoming.name || 'Untitled room');
}

export function installGlobalSync() {
  addEventListener('hashchange', () => {
    if (location.hash === lastWrittenHash) return;
    // Someone pasted or followed a different link: keep what we had, then open it.
    clearTimeout(hashTimer);
    const incoming = location.hash;
    void saveVersion(false).then(() => openFromHash(incoming));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  addEventListener('pagehide', flush);
}
