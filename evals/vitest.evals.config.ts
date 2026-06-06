import { defineConfig } from 'vitest/config';
import path from 'path';

// Isolated config for the LLM eval harness. Deliberately separate from the
// root vitest.config.ts so:
//   - it globs ONLY evals/**/*.eval.ts (the unit suite never makes API calls)
//   - it does NOT load src/test/setup.ts (which mocks the Anthropic SDK) —
//     evals must hit the real API
//   - it runs in node, single-threaded, with a generous timeout for live calls
export default defineConfig({
  test: {
    environment: 'node',
    include: ['evals/**/*.eval.ts'],
    setupFiles: [path.resolve(__dirname, './runner/load-env.ts')],
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
});
