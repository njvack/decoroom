// Bundle the CLI into one file and copy the PNG renderer's assets next to it.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const out = process.env.CLI_OUT ?? 'dist';

await build({
  entryPoints: ['cli/decoroom.ts'],
  outfile: join(out, 'decoroom.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: false,
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node\n// decoroom CLI. Usage: node decoroom.mjs --help' },
  define: { __VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'warning',
});

mkdirSync(join(out, 'cli'), { recursive: true });
const resvgDir = dirname(require.resolve('@resvg/resvg-wasm'));
copyFileSync(join(resvgDir, 'index_bg.wasm'), join(out, 'cli', 'resvg.wasm'));
copyFileSync('assets/fonts/JetBrainsMono-Regular.ttf', join(out, 'cli', 'mono.ttf'));
console.log(`CLI built to ${out}/decoroom.mjs`);
