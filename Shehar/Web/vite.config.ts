import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: { target: 'es2020', chunkSizeWarningLimit: 900, sourcemap: false },
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
