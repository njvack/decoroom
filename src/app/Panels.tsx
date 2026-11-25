import { useEffect, useState } from 'preact/hooks';
import { buildReadableHash, decodePlan } from '../codec/hash';
import { CONFIG } from '../config';
import { EXAMPLES, FIREPLACE_ROOM_ID } from '../model/examples';
import { emptyPlan } from '../model/normalize';
import { toSvgString } from '../render/el';
import { renderPlan } from '../render/plan';
import { LIGHT } from '../render/theme';
import * as hist from './history';
import { commit, currentLink, loadRoom, S, saveVersion, set, showDiff, toast, useApp } from './store';
import { newRoomId } from '../codec/hash';

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    prompt('Copy this:', text);
  }
}

export function SharePanel() {
  const s = useApp();
  const link = currentLink();
  const long = link.length > CONFIG.longLinkChars;
  return (
    <div class="stack">
      <p>The link holds the whole room. Send it to someone; when they send their version back, opening it shows what they changed.</p>
      <div class="row">
        <button class="pri" onClick={() => copy(currentLink(), 'Link')}>
          Copy link
        </button>
        {'share' in navigator && (
          <button onClick={() => navigator.share({ title: s.plan.name || 'Room layout', url: currentLink() }).catch(() => {})}>Share…</button>
        )}
        <button onClick={() => downloadPng()}>Download image</button>
      </div>
      <p class={`hint${long ? ' warn' : ''}`}>
        {link.length.toLocaleString()} characters.{' '}
        {long ? 'That may be too long for some chat apps. Pictures and long notes add the most.' : 'Short enough for iMessage, WhatsApp and email.'}
      </p>
      <details>
        <summary>For an AI assistant</summary>
        <p class="hint">Paste the regular link into a chat with an AI assistant. The page tells it how to read the room and draw it. If it can't open links, give it this readable version instead.</p>
        <button class="small" onClick={() => copy(location.origin + location.pathname + buildReadableHash(S.roomId, S.plan), 'Readable link')}>
          Copy readable link
        </button>
      </details>
    </div>
  );
}

export async function downloadPng() {
  const svg = toSvgString(renderPlan(S.plan, { theme: LIGHT, caption: true, width: 1600 }));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `${(S.plan.name || 'room').replace(/[^\w-]+/g, '-').toLowerCase()}.png`;
  a.click();
}

export function HistoryPanel() {
  const s = useApp();
  const [versions, setVersions] = useState<hist.VersionRecord[]>([]);
  const [rooms, setRooms] = useState<hist.RoomRecord[]>([]);
  const [all, setAll] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    void hist.listVersions(s.roomId).then(setVersions);
    void hist.listRooms().then(setRooms);
    void hist.historyUnavailable().then(setUnavailable);
  }, [s.roomId, s.historyRev]);
  const shown = all ? versions : versions.filter((v, i) => v.major || v.source !== 'edit' || i === 0);
  const hidden = versions.length - shown.length;

  async function restore(v: hist.VersionRecord) {
    await saveVersion(false);
    const before = S.plan;
    commit(decodePlan(v.packed));
    await saveVersion(false, `Restored from ${ago(v.ts)}`, 'restore');
    showDiff(before, `Restored the version from ${ago(v.ts)}`, before);
  }

  return (
    <div class="stack">
      {unavailable && <p class="warn">This browser isn't letting the page save history (private browsing?). Links still work.</p>}
      <p class="hint">
        Saved in this browser only. A version is saved when you pause editing. Press <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>S</kbd> to mark a major version.
      </p>
      <div class="row">
        <label class="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll((e.target as HTMLInputElement).checked)} /> Show every small edit
          {!all && hidden > 0 ? ` (${hidden})` : ''}
        </label>
      </div>
      <ol class="versions">
        {shown.map((v) => (
          <li key={v.key} class={v.major ? 'major' : ''}>
            <div class="vmeta">
              <span>{ago(v.ts)}</span>
              {v.major && <span class="chip">major</span>}
              {v.source === 'link' && <span class="chip">from a link</span>}
              {v.source === 'restore' && <span class="chip">restore</span>}
            </div>
            <input
              class="vlabel"
              placeholder={v.major ? 'Name this version' : ''}
              value={v.label ?? ''}
              aria-label="Version label"
              onChange={(e) => {
                const label = (e.target as HTMLInputElement).value.trim() || undefined;
                void hist.updateVersion(v.key!, { label, major: label ? true : v.major }).then(() => set({ historyRev: S.historyRev + 1 }));
              }}
            />
            <div class="row">
              <button class="small" onClick={() => showDiff(decodePlan(v.packed), `Compared with ${ago(v.ts)}`)}>
                Compare
              </button>
              <button class="small" onClick={() => restore(v)}>
                Restore
              </button>
            </div>
          </li>
        ))}
        {!shown.length && <li class="hint">No saved versions yet.</li>}
      </ol>
      <h3>Your rooms</h3>
      <ul class="rooms">
        {rooms.map((r) => (
          <li key={r.id}>
            <button
              class={`link${r.id === s.roomId ? ' on' : ''}`}
              onClick={async () => {
                if (r.id === S.roomId) return;
                await saveVersion(false);
                const v = await hist.latestVersion(r.id);
                if (v) loadRoom(r.id, decodePlan(v.packed));
              }}
            >
              {r.name}
            </button>
            <span class="hint"> {ago(r.opened)}</span>
          </li>
        ))}
      </ul>
      <div class="row">
        <button
          class="small"
          onClick={async () => {
            await saveVersion(false);
            loadRoom(newRoomId(), emptyPlan());
            set({ drawer: null, welcome: true });
          }}
        >
          New room
        </button>
        <button
          class="small"
          onClick={async () => {
            await saveVersion(false);
            const ex = EXAMPLES[0];
            loadRoom(ex.id, ex.plan);
            set({ drawer: null });
          }}
        >
          Open the example room
        </button>
      </div>
    </div>
  );
}

export function HelpPanel() {
  return (
    <div class="stack help">
      <h3>Moving things</h3>
      <ul>
        <li>Drag a piece to move it. It snaps flush to walls; hold <kbd>Alt</kbd> to place it freely.</li>
        <li>The round handle rotates (15° steps; <kbd>Alt</kbd> for any angle). The square handle resizes.</li>
        <li>Arrow keys nudge 1″ (<kbd>Shift</kbd> for 6″). <kbd>R</kbd> rotates 90°. <kbd>Delete</kbd> removes. <kbd>⌘D</kbd> duplicates.</li>
      </ul>
      <h3>Measuring from walls</h3>
      <p>
        Each piece can be measured from up to two walls, like “closest edge 18″ from the kitchen wall”. Those numbers are shown in orange. If you change a wall, the piece keeps its
        distance. Dashed green lines show open floor to the nearest thing in each direction.
      </p>
      <h3>The room</h3>
      <p>Click a wall to rename it (“kitchen side”), change its length or color, and add doors, windows, a fireplace or art. In “Edit room” mode, drag corners and press ＋ to add a corner.</p>
      <h3>Estimates</h3>
      <p>Dashed outlines are guesses. The room panel lists them under “To measure”.</p>
      <h3>History</h3>
      <p>
        Undo with <kbd>⌘Z</kbd>, redo with <kbd>⇧⌘Z</kbd>. Versions are saved in this browser as you go. <kbd>⌘S</kbd> marks a major version.
      </p>
      <h3>For AI assistants</h3>
      <p>
        A link to this page includes instructions an AI can read. Details for developers and agents are in <a href="llms.txt">llms.txt</a>, and the{' '}
        <a href="https://github.com/njvack/decoroom">source is on GitHub</a>.
      </p>
      <p class="hint">Version {__BUILD__}</p>
    </div>
  );
}

export function DiffBanner() {
  const s = useApp();
  const d = s.diff;
  if (!d) return null;
  return (
    <div class="banner" role="status">
      <div class="banner-head">
        <strong>{d.title}</strong>
        <div class="row">
          {d.revertTo && (
            <button
              class="small"
              onClick={() => {
                commit(d.revertTo!);
                set({ diff: null });
                toast('Went back to your version. Theirs is still in History.');
              }}
            >
              Go back to mine
            </button>
          )}
          <button class="small pri" onClick={() => set({ diff: null })}>
            {d.revertTo ? 'Keep these changes' : 'Done'}
          </button>
        </div>
      </div>
      {d.lines.length ? (
        <ul>
          {d.lines.slice(0, 12).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          {d.lines.length > 12 && <li>…and {d.lines.length - 12} more</li>}
        </ul>
      ) : (
        <p class="hint">No differences.</p>
      )}
      <p class="hint">Changed pieces are outlined in amber; dotted outlines show where they were.</p>
    </div>
  );
}

export function Welcome() {
  const s = useApp();
  if (!s.welcome) return null;
  return (
    <div class="banner welcome">
      <div class="banner-head">
        <strong>Sketch a room, then share it as a link.</strong>
        <button class="small ghost" aria-label="Dismiss" onClick={() => set({ welcome: false })}>
          ✕
        </button>
      </div>
      <p>Click a wall to set its length and name. Add furniture from the Furniture list. Everything lives in the link, and versions are kept in this browser.</p>
      <div class="row">
        <button
          class="small"
          onClick={() => {
            const ex = EXAMPLES.find((e) => e.id === FIREPLACE_ROOM_ID)!;
            loadRoom(ex.id, ex.plan);
            set({ welcome: false });
          }}
        >
          See an example room
        </button>
      </div>
    </div>
  );
}
