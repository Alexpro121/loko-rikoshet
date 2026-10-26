import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } }, target: 'es2020', chunkSizeWarningLimit: 900, assetsInlineLimit: 0 },
  server: { host: true },
});
