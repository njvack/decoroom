import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

const BUILD = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7);

// version.json lets an open page notice that a newer build is live.
const versionJson: Plugin = {
  name: 'version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
  },
};

export default defineConfig({
  base: './',
  plugins: [preact(), versionJson],
  // Shown in the help panel so a cached page can be told from a fresh one.
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
