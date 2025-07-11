import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The load suite writes ten thousand journal lines and fsyncs each one.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/cli/main.ts'],
      // The floor is a floor, not a target. It is here to make a pull request
      // that quietly stops covering a rule branch fail rather than pass.
      thresholds: {
        statements: 97,
        branches: 92,
        functions: 96,
        lines: 97,
      },
    },
  },
});
