import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude end-to-end tests from vitest runner
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
});
