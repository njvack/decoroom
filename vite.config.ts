import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  // Shown in the help panel so a cached page can be told from a fresh one.
  define: { __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)) },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
