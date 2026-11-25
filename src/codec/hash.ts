import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { normalizePlan, randomId } from '../model/normalize';
import type { Plan } from '../model/types';
import { packPlan, unpackPlan } from './pack';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

export function fromBase64Url(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : 0));
    if (v.some((x) => x < 0)) throw new Error('Link data is damaged (bad characters)');
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** Plan -> `z` parameter value. */
export function encodePlan(plan: Plan): string {
  const json = JSON.stringify(packPlan(plan));
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

/** `z` parameter value -> normalized plan. */
export function decodePlan(z: string): Plan {
  let json: string;
  try {
    json = strFromU8(inflateSync(fromBase64Url(z)));
  } catch {
    throw new Error('Link data is damaged or cut off. Ask for the link again, or paste the whole thing.');
  }
  return normalizePlan(unpackPlan(JSON.parse(json)));
}

export interface HashState {
  id?: string;
  plan?: Plan;
  /** Which form the plan came in. */
  form?: 'z' | 'j';
  error?: string;
}

const ID_RE = /^[a-z0-9]{3,16}$/i;

export function parseHash(hash: string): HashState {
  const h = hash.replace(/^#/, '');
  if (!h) return {};
  const params = new URLSearchParams(h.replace(/\+/g, '%2B'));
  const out: HashState = {};
  const id = params.get('id');
  if (id && ID_RE.test(id)) out.id = id;
  try {
    const z = params.get('z');
    const j = params.get('j');
    if (z) {
      out.plan = decodePlan(z);
      out.form = 'z';
    } else if (j) {
      out.plan = normalizePlan(JSON.parse(j));
      out.form = 'j';
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

export function newRoomId(): string {
  return randomId(6);
}

export function buildHash(id: string, plan: Plan): string {
  return `#id=${id}&z=${encodePlan(plan)}`;
}

/** Readable form, for agents and hand edits. */
export function buildReadableHash(id: string, plan: Plan): string {
  return `#id=${id}&j=${encodeURIComponent(JSON.stringify(plan))}`;
}

export const SITE_URL = 'https://njvack.github.io/decoroom/';

export function buildLink(id: string, plan: Plan, base = SITE_URL): string {
  return base.replace(/#.*$/, '') + buildHash(id, plan);
}
