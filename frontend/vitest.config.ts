import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The S650 Canvas is a standalone HUD runtime. Keep its unit and
    // launcher-boundary tests next to the assets while retaining this single
    // frontend Vitest entry point for local and CI verification.
    include: ['src/**/*.test.ts', '../hud_overlay/s650_hmi/tests/**/*.test.ts'],
    // Exclude end-to-end tests from vitest runner
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
});
