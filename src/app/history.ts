/**
 * Local version history in IndexedDB. Nothing here leaves the browser.
 *
 * rooms:    { id, name, opened, updated }
 * versions: { key (auto), roomId, ts, packed, major, label?, source }
 *   packed is the `z` string from the URL; source is 'edit' or 'link'.
 * Pruning old minor versions can be added later without a schema change.
 */
export interface RoomRecord {
  id: string;
  name: string;
  opened: number;
  updated: number;
}

export interface VersionRecord {
  key?: number;
  roomId: string;
  ts: number;
  packed: string;
  major: boolean;
  label?: string;
  source: 'edit' | 'link' | 'restore';
}

const DB_NAME = 'decoroom';
const DB_VERSION = 1;
let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('rooms')) db.createObjectStore('rooms', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('versions')) {
          const s = db.createObjectStore('versions', { keyPath: 'key', autoIncrement: true });
          s.createIndex('room', ['roomId', 'ts']);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** True when history can't be stored (private mode, blocked storage). */
export async function historyUnavailable(): Promise<boolean> {
  return !(await open());
}

export async function listVersions(roomId: string): Promise<VersionRecord[]> {
  const db = await open();
  if (!db) return [];
  const idx = db.transaction('versions').objectStore('versions').index('room');
  const all = await wrap(idx.getAll(IDBKeyRange.bound([roomId, 0], [roomId, Infinity])));
  return (all as VersionRecord[]).sort((a, b) => b.ts - a.ts);
}

export async function latestVersion(roomId: string): Promise<VersionRecord | undefined> {
  const db = await open();
  if (!db) return undefined;
  const idx = db.transaction('versions').objectStore('versions').index('room');
  return new Promise((resolve) => {
    const req = idx.openCursor(IDBKeyRange.bound([roomId, 0], [roomId, Infinity]), 'prev');
    req.onsuccess = () => resolve((req.result?.value as VersionRecord) ?? undefined);
    req.onerror = () => resolve(undefined);
  });
}

export async function addVersion(v: VersionRecord, roomName: string): Promise<number | undefined> {
  const db = await open();
  if (!db) return undefined;
  const tx = db.transaction(['versions', 'rooms'], 'readwrite');
  const key = await wrap(tx.objectStore('versions').add(v));
  const rooms = tx.objectStore('rooms');
  const prev = (await wrap(rooms.get(v.roomId))) as RoomRecord | undefined;
  await wrap(rooms.put({ id: v.roomId, name: roomName, opened: Date.now(), updated: v.ts, ...(prev ? { opened: prev.opened } : {}) }));
  return key as number;
}

export async function updateVersion(key: number, patch: Partial<VersionRecord>): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction('versions', 'readwrite').objectStore('versions');
  const v = (await wrap(store.get(key))) as VersionRecord | undefined;
  if (v) await wrap(store.put({ ...v, ...patch }));
}

export async function touchRoom(id: string, name: string): Promise<void> {
  const db = await open();
  if (!db) return;
  const store = db.transaction('rooms', 'readwrite').objectStore('rooms');
  const prev = (await wrap(store.get(id))) as RoomRecord | undefined;
  await wrap(store.put({ id, name, updated: prev?.updated ?? Date.now(), opened: Date.now() }));
}

export async function listRooms(): Promise<RoomRecord[]> {
  const db = await open();
  if (!db) return [];
  const all = (await wrap(db.transaction('rooms').objectStore('rooms').getAll())) as RoomRecord[];
  return all.sort((a, b) => b.opened - a.opened);
}

export async function deleteRoom(id: string): Promise<void> {
  const db = await open();
  if (!db) return;
  const tx = db.transaction(['versions', 'rooms'], 'readwrite');
  tx.objectStore('rooms').delete(id);
  const idx = tx.objectStore('versions').index('room');
  const keys = await wrap(idx.getAllKeys(IDBKeyRange.bound([id, 0], [id, Infinity])));
  for (const k of keys) tx.objectStore('versions').delete(k);
}
