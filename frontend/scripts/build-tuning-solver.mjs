import { build } from 'vite';
import { fileURLToPath } from 'node:url';

await build({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  build: {
    ssr: fileURLToPath(new URL('tuning-solver-entry.ts', import.meta.url)),
    outDir: 'dist-solver', emptyOutDir: true, target: 'node22',
    rollupOptions: { output: { entryFileNames: 'tuning-solver.mjs' } },
  },
});
