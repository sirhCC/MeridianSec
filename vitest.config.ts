import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
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
        lines: 65,
        functions: 55,
        branches: 45,
        statements: 65,
      },
    },
  },
});
