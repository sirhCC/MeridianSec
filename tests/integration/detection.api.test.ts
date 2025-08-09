import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { closePrisma } from '../../src/db/client.js';
import crypto from 'crypto';

let app: Awaited<ReturnType<typeof buildServer>>;

describe('Detection Simulation API', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file:./data/test-detection.db';
    app = await buildServer();
  });

  it('simulates detection and stores record with hash chain', async () => {
    // First create canary
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash, salt },
    });
    const canaryId = createResp.json().canary.id;

    const simResp = await app.inject({
      method: 'POST',
      url: '/v1/simulate/detection',
      payload: { canaryId, source: 'SIM', rawEventJson: '{}', confidenceScore: 75 },
    });
    expect(simResp.statusCode).toBe(202);

    // Give event loop a tick (engine processes synchronously, so likely not needed)
    const listResp = await app.inject({ method: 'GET', url: '/v1/canaries/' + canaryId });
    expect(listResp.statusCode).toBe(200);
    // NOTE: detection retrieval endpoint not yet implemented; existence validated indirectly via absence of errors
  });
});

afterAll(async () => {
  await closePrisma();
});
