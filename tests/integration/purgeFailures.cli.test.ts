import { describe, it, expect, beforeAll } from 'vitest';
import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { ensureTestDb } from '../utils/db.js';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('purge-failures CLI', () => {
  const prisma = new PrismaClient();
  const cliSrc = path.resolve(__dirname, '../../src/cli/index.ts');
  const dbFile = path.resolve(__dirname, '../../prisma/data/test-purge-cli.db');
  process.env.DATABASE_URL = 'file:' + dbFile;

  beforeAll(async () => {
    // Ensure clean db file
    if (fs.existsSync(dbFile)) fs.rmSync(dbFile);
    ensureTestDb();
    // create some alertFailure rows manually (simulate fails)
    // Slightly older timestamps
    const base = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    for (let i = 0; i < 3; i++) {
      await prisma.alertFailure.create({
        data: {
          detectionId: `d-${i}`,
          canaryId: `c-${i}`,
          adapter: 'test',
          reason: 'simulated',
          payloadJson: JSON.stringify({ test: true }),
          attempts: 1,
          lastError: 'x',
          createdAt: new Date(base.getTime() + i * 1000),
          replayedAt: new Date(),
          replaySuccess: true,
        },
      });
    }
  });

  it('dry-run then delete with metrics delta', async () => {
    const dry = await execa(
      'npx',
      [
        'tsx',
        cliSrc,
        'purge-failures',
        '--older-than',
        '30',
        '--successful-only',
        '--dry-run',
        '--json',
      ],
      {
        env: { DATABASE_URL: process.env.DATABASE_URL, PURGE_CONFIRM_THRESHOLD: '1' },
      },
    );
    const dryOut = JSON.parse(dry.stdout);
    expect(dryOut.wouldDelete).toBeGreaterThan(0);
    expect(dryOut.deleted).toBe(0);

    const del = await execa(
      'npx',
      [
        'tsx',
        cliSrc,
        'purge-failures',
        '--older-than',
        '30',
        '--successful-only',
        '--force',
        '--json',
      ],
      {
        env: { DATABASE_URL: process.env.DATABASE_URL, PURGE_CONFIRM_THRESHOLD: '1' },
      },
    );
    const delOut = JSON.parse(del.stdout);
    expect(delOut.deleted).toBe(dryOut.wouldDelete);
    expect(delOut.metricsDelta.alertFailuresPurgedTotal.delta).toBe(delOut.deleted);
  });
});
