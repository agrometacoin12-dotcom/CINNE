import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer-only Vite config. The Electron main + preload bundles are built by
// scripts/build-electron.mjs (esbuild) into dist-electron/.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome126',
    sourcemap: false,
  },
  server: {
    port: 5183,
    strictPort: true,
  },
});
