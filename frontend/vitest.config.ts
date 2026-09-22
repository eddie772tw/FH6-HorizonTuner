import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@platform/hud': path.resolve(import.meta.dirname, 'src/platform/hud.windows.tsx') } },
  test: {
    // Keep HUD-owned renderer contracts next to their standalone assets while
    // retaining one frontend Vitest entry point for local and CI verification.
    // React/main-GUI boundary tests remain under src/features/overlay_control.
    include: ['src/**/*.test.ts', '../hud_overlay/*/tests/**/*.test.ts'],
    // Exclude end-to-end tests from vitest runner
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
});
