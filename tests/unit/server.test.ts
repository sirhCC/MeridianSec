import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { ensureTestDb } from '../utils/db.js';
import { closePrisma, resetPrisma, ensurePrismaConnected } from '../../src/db/client.js';

beforeAll(async () => {
  await resetPrisma();
  process.env.DATABASE_URL = 'file:./data/test-health.db';
  ensureTestDb();
  await ensurePrismaConnected();
});

describe('health endpoint', () => {
  it('returns ok with enriched fields', async () => {
    const s = await buildServer();
    const res = await s.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('build.version');
    expect(body).toHaveProperty('engine.running');
    expect(body).toHaveProperty('canaries.count');
    expect(body).toHaveProperty('detections.processed');
  });
});

afterAll(async () => {
  await closePrisma();
});
