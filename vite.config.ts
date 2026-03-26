import { defineConfig } from 'vite';

export default defineConfig(() => {
  // APP env var selects a single app for dev/build:
  //   APP=viewer pnpm dev
  //   APP=workspace pnpm build
  // When unset, all apps are included.
  const app = process.env['APP'];

  const allInputs: Record<string, string> = {
    workspace: 'index.html',
    viewer:    'viewer.html',
  };

  const inputs = app ? { [app]: allInputs[app] } : allInputs;

  return {
    // WASM files served as assets; consumers use `?url` imports
    assetsInclude: ['**/*.wasm'],

    build: {
      target: 'es2022',
      rollupOptions: {
        input: inputs,
        output: {
          manualChunks: {
            codemirror: ['codemirror', '@codemirror/view', '@codemirror/state', '@codemirror/lang-javascript', '@codemirror/autocomplete', '@codemirror/language'],
            three:      ['three'],
          },
        },
      },
    },

    // Workers must be ES modules so they can use dynamic imports and top-level await
    worker: {
      format: 'es' as const,
    },

    server: {
      port: 5173,
    },
  };
});
