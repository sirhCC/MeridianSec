import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    poolOptions: {
      threads: {
        isolate: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**',
        'src/index.ts',
        'src/core/types.ts', // type-only
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 60,
        branches: 50,
      },
    },
  },
});
