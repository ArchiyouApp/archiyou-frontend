import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es' as const,
  },
  server: {
    port: 5175,
  },
});
