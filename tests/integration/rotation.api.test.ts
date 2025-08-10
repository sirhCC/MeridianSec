import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { closePrisma } from '../../src/db/client.js';
import crypto from 'crypto';
import { ensureTestDb } from '../utils/db.js';

let app: Awaited<ReturnType<typeof buildServer>>;

describe('Canary Rotation API', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file:./data/test-rotation.db';
  ensureTestDb();
    app = await buildServer();
  });

  it('rotates a canary secret and records rotation', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash, salt },
    });
    expect(createResp.statusCode).toBe(201);
    const canaryId = createResp.json().canary.id;

    const rotateResp = await app.inject({ method: 'POST', url: `/v1/canaries/${canaryId}/rotate` });
    expect(rotateResp.statusCode).toBe(200);
    const rotBody = rotateResp.json();
    expect(rotBody.rotation.oldSecretHash).toBe(currentSecretHash);
    expect(rotBody.rotation.newSecretHash).not.toBe(currentSecretHash);
    expect(rotBody.mockSecret).toBeDefined();

    // Rotate again to ensure chain of rotations
    const rotateResp2 = await app.inject({
      method: 'POST',
      url: `/v1/canaries/${canaryId}/rotate`,
    });
    expect(rotateResp2.statusCode).toBe(200);
    const rotBody2 = rotateResp2.json();
    expect(rotBody2.rotation.oldSecretHash).toBe(rotBody.rotation.newSecretHash);
  });
});

afterAll(async () => {
  await closePrisma();
});
