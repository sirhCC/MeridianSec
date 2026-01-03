import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { closePrisma, resetPrisma, ensurePrismaConnected } from '../../src/db/client.js';
import crypto from 'crypto';
import { ensureTestDb } from '../utils/db.js';

let app: Awaited<ReturnType<typeof buildServer>>;

describe('Canary API', () => {
  beforeAll(async () => {
    // Use a separate sqlite file for integration test to avoid interfering with dev db
    await resetPrisma();
    process.env.DATABASE_URL = 'file:./data/test-canary.db';
    delete process.env.ENABLE_POLL_LOOP; // keep deterministic
    ensureTestDb();
    await ensurePrismaConnected();
    app = await buildServer();
  });

  it('creates and retrieves a canary', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: {
        type: 'AWS_IAM_KEY',
        currentSecretHash,
        salt,
        placements: [{ locationType: 'REPO_FILE', locationRef: 'README.md' }],
      },
    });
    expect(createResp.statusCode).toBe(201);
    const body = createResp.json();
    expect(body.canary.id).toBeDefined();
    const id = body.canary.id;

    const getResp = await app.inject({ method: 'GET', url: `/v1/canaries/${id}` });
    expect(getResp.statusCode).toBe(200);
    const getBody = getResp.json();
    expect(getBody.canary.id).toBe(id);
    expect(getBody.placements.length).toBe(1);

    const listResp = await app.inject({ method: 'GET', url: '/v1/canaries' });
    expect(listResp.statusCode).toBe(200);
    const listBody = listResp.json();
    expect(Array.isArray(listBody.canaries)).toBe(true);
    expect(listBody.canaries.length).toBeGreaterThan(0);
  });

  it('returns 400 on validation error (missing salt)', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const resp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: {
        type: 'AWS_IAM_KEY',
        currentSecretHash,
        // salt omitted intentionally
      },
    });
    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// Ensure prisma disconnect after tests
afterAll(async () => {
  await closePrisma();
});
