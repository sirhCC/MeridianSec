import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { ensureTestDb } from '../utils/db.js';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Focused tests for purge-failures confirmation & quiet mode behaviours.

describe('purge-failures CLI flags', () => {
  const cliSrc = path.resolve(__dirname, '../../src/cli/index.ts');
  let prisma: PrismaClient;
  let dbFile: string;
  let envBase: Record<string, string>;

  async function freshDb() {
    // unique DB per test to avoid cross-test contamination
    dbFile = path.resolve(
      __dirname,
      `../../prisma/data/test-purge-unit-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    process.env.DATABASE_URL = 'file:' + dbFile;
    process.env.PURGE_CONFIRM_THRESHOLD = '1'; // low threshold for prompt
    ensureTestDb();
    prisma = new PrismaClient();
    envBase = { DATABASE_URL: process.env.DATABASE_URL!, PURGE_CONFIRM_THRESHOLD: '1' };
  }

  async function seed(n: number) {
    for (let i = 0; i < n; i++) {
      await prisma.alertFailure.create({
        data: {
          detectionId: `d-${i}`,
          canaryId: `c-${i}`,
          adapter: 'test',
          reason: 'simulated',
          payloadJson: JSON.stringify({ canaryId: `c-${i}`, detectionId: `d-${i}` }),
          attempts: 1,
          lastError: 'x',
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days old
          replayedAt: new Date(),
          replaySuccess: true,
        },
      });
    }
  }

  it('aborts without YES confirmation (exit 3)', async () => {
    await freshDb();
    await seed(2);
    // Launch process and write to stdin after slight delay to ensure prompt printed
    const child = execa(
      'npx',
      ['tsx', cliSrc, 'purge-failures', '--older-than', '5', '--successful-only'],
      {
        env: envBase,
        reject: false,
      },
    );
    // Wait briefly then send NO
    setTimeout(() => {
      child.stdin?.write('NO\n');
    }, 100);
    const res = await child;
    expect(res.exitCode).toBe(3);
  }, 15000);

  it('deletes with --force quietly (exit 0)', async () => {
    await freshDb();
    await seed(2);
    const res = await execa(
      'npx',
      [
        'tsx',
        cliSrc,
        'purge-failures',
        '--older-than',
        '5',
        '--successful-only',
        '--force',
        '--quiet',
      ],
      { env: envBase },
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout.trim()).toBe(''); // quiet => no output
  });
});
