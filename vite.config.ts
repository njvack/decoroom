import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
