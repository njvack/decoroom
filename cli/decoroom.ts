/**
 * decoroom command-line tool. Built to a single self-contained ES module
 * (dist/decoroom.mjs) that needs only Node 18+.
 *
 *   node decoroom.mjs decode   <link>             readable JSON
 *   node decoroom.mjs describe <link> [--before <link>]
 *   node decoroom.mjs render   <link> [-o out.png|out.svg] [--view plan|wall:N] [--width 1400] [--dark]
 *   node decoroom.mjs encode   <plan.json|-> [--id abc123] [--base URL]
 *   node decoroom.mjs diff     <before-link> <after-link>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLink, newRoomId, parseHash, SITE_URL } from '../src/codec/hash';
import { diffPlans, summarizeDiff } from '../src/model/diff';
import { wallName } from '../src/model/estimates';
import { normalizePlan } from '../src/model/normalize';
import type { Plan } from '../src/model/types';
import { describePlan } from '../src/render/describe';
import { toSvgString } from '../src/render/el';
import { renderElevation } from '../src/render/elevation';
import { renderPlan } from '../src/render/plan';
import { DARK, LIGHT } from '../src/render/theme';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

const HELP = `decoroom ${VERSION}: read, render and write decoroom room links.

Usage:
  node decoroom.mjs decode   <link>                 Print the plan as readable JSON
  node decoroom.mjs describe <link> [--before <link>]
                                                    Text summary: walls, doors, pieces, anchors, open floor
  node decoroom.mjs render   <link> [-o plan.png]   Draw the plan (SVG, or PNG if -o ends in .png)
        --view plan | wall:<index or name>          Top-down plan (default) or one wall's elevation
        --width <px>                                Output width (default 1400)
        --dark                                      Dark colors
  node decoroom.mjs encode   <plan.json | ->        Turn readable JSON into a link
        --id <roomId>                               Keep a room id (so history and diffs line up)
        --base <url>                                Site URL (default ${SITE_URL})
  node decoroom.mjs diff     <before> <after>       What changed between two links

<link> can be a full URL, just the #fragment, a file containing either, or - for stdin.
PNG output downloads a WebAssembly renderer (~2.5 MB) from the site once and caches it.`;

function readInput(arg: string | undefined): string {
  if (!arg) throw new Error('Missing input. Run with --help.');
  if (arg === '-') return readFileSync(0, 'utf8').trim();
  if (!arg.includes('#') && !arg.startsWith('{') && existsSync(arg)) return readFileSync(arg, 'utf8').trim();
  return arg.trim();
}

function loadPlan(arg: string | undefined): { plan: Plan; id?: string; base?: string } {
  const text = readInput(arg);
  if (text.startsWith('{')) return { plan: normalizePlan(JSON.parse(text)) };
  const i = text.indexOf('#');
  const hash = i >= 0 ? text.slice(i) : text;
  const st = parseHash(hash);
  if (st.error) throw new Error(st.error);
  if (!st.plan) throw new Error('No room data in that link (expected #id=…&z=… or #j=…).');
  const base = i > 0 && /^https?:/.test(text) ? text.slice(0, i) : undefined;
  return { plan: st.plan, id: st.id, base };
}

function flag(args: string[], name: string, alias?: string): string | undefined {
  const k = args.findIndex((a) => a === name || (alias && a === alias));
  if (k < 0) return undefined;
  const v = args[k + 1];
  args.splice(k, 2);
  return v;
}

function bool(args: string[], name: string): boolean {
  const k = args.indexOf(name);
  if (k < 0) return false;
  args.splice(k, 1);
  return true;
}

function resolveWall(plan: Plan, spec: string): number {
  const n = Number(spec);
  if (Number.isInteger(n) && n >= 0 && n < plan.walls.length) return n;
  const i = plan.walls.findIndex((_, k) => wallName(plan, k).toLowerCase() === spec.toLowerCase());
  if (i < 0) throw new Error(`No wall "${spec}". Walls: ${plan.walls.map((_, k) => `${k}=${wallName(plan, k)}`).join(', ')}`);
  return i;
}

async function asset(name: string, base: string | undefined): Promise<Uint8Array> {
  const here = dirname(fileURLToPath(import.meta.url));
  const local = join(here, 'cli', name);
  if (existsSync(local)) return readFileSync(local);
  const cacheDir = join(tmpdir(), `decoroom-cli-${VERSION}`);
  const cached = join(cacheDir, name);
  if (existsSync(cached)) return readFileSync(cached);
  const sites = [...new Set([base, SITE_URL].filter(Boolean) as string[])];
  let lastErr: unknown;
  for (const site of sites) {
    const url = new URL(`cli/${name}`, site.endsWith('/') ? site : site.replace(/[^/]*$/, '')).toString();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cached, buf);
      return buf;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Couldn't get ${name} for PNG output (${lastErr}). Write an .svg instead.`);
}

async function toPng(svg: string, width: number, base?: string): Promise<Uint8Array> {
  const { initWasm, Resvg } = await import('@resvg/resvg-wasm');
  const [wasm, font] = await Promise.all([asset('resvg.wasm', base), asset('mono.ttf', base)]);
  try {
    await initWasm(wasm);
  } catch (e) {
    if (!String(e).includes('Already initialized')) throw e;
  }
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontBuffers: [font], defaultFontFamily: 'JetBrains Mono', monospaceFamily: 'JetBrains Mono', sansSerifFamily: 'JetBrains Mono' },
  });
  return r.render().asPng();
}

async function main(argv: string[]) {
  const args = [...argv];
  if (!args.length || bool(args, '--help') || bool(args, '-h')) {
    console.log(HELP);
    return;
  }
  if (bool(args, '--version')) {
    console.log(VERSION);
    return;
  }
  const cmd = args.shift();
  switch (cmd) {
    case 'decode': {
      const { plan, id } = loadPlan(args[0]);
      console.log(JSON.stringify(id ? { id, ...plan } : plan, null, 2));
      break;
    }
    case 'describe': {
      const before = flag(args, '--before');
      const { plan } = loadPlan(args[0]);
      console.log(describePlan(plan, { before: before ? loadPlan(before).plan : undefined }));
      break;
    }
    case 'render': {
      const outFile = flag(args, '-o', '--out') ?? 'decoroom.svg';
      const view = flag(args, '--view') ?? 'plan';
      const width = Number(flag(args, '--width') ?? 1400);
      const theme = bool(args, '--dark') ? DARK : LIGHT;
      const { plan, base } = loadPlan(args[0]);
      const el = view.startsWith('wall:')
        ? renderElevation(plan, resolveWall(plan, view.slice(5)), { theme, width })
        : renderPlan(plan, { theme, width, caption: true });
      const svg = toSvgString(el);
      if (outFile.endsWith('.png')) writeFileSync(outFile, await toPng(svg, width, base));
      else if (outFile === '-') process.stdout.write(svg);
      else writeFileSync(outFile, svg);
      if (outFile !== '-') console.error(`Wrote ${outFile}`);
      break;
    }
    case 'encode': {
      const id = flag(args, '--id');
      const base = flag(args, '--base') ?? SITE_URL;
      const text = readInput(args[0]);
      const raw = JSON.parse(text) as Record<string, unknown>;
      const plan = normalizePlan(raw);
      const roomId = id ?? (typeof raw.id === 'string' ? raw.id : newRoomId());
      console.log(buildLink(roomId, plan, base));
      break;
    }
    case 'diff': {
      const a = loadPlan(args[0]).plan;
      const b = loadPlan(args[1]).plan;
      const lines = summarizeDiff(diffPlans(a, b));
      console.log(lines.length ? lines.map((l) => `- ${l}`).join('\n') : 'No changes.');
      break;
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run with --help.`);
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`decoroom: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
