import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', lab: 'lab.html', sound: 'sound.html', boards: 'boards.html', train: 'train.html' }, output: { manualChunks: { three: ['three'] } } }, target: 'es2020', chunkSizeWarningLimit: 900, assetsInlineLimit: 0 },
  server: { host: true },
});
