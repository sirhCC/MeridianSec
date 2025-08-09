import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { closePrisma } from '../../src/db/client.js';
import crypto from 'crypto';

let app: Awaited<ReturnType<typeof buildServer>>;

describe('Polling detection loop', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'file:./data/test-poll.db';
    process.env.CLOUDTRAIL_POLL_INTERVAL_MS = '150';
    process.env.ENABLE_POLL_LOOP = '1';
    app = await buildServer();
  });

  it('emits synthetic detection without simulate endpoint', async () => {
    // create a canary; then wait for a polling-generated detection
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash, salt },
    });
    expect(createResp.statusCode).toBe(201);
    const canaryId = createResp.json().canary.id;

    let detectionsLen = 0;
    for (let i = 0; i < 30; i++) {
      // up to ~4.5s
      const list = await app.inject({ method: 'GET', url: `/v1/canaries/${canaryId}/detections` });
      if (list.statusCode === 200) {
        detectionsLen = list.json().detections.length;
        if (detectionsLen > 0) break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(detectionsLen).toBeGreaterThan(0);
  });
});

afterAll(async () => {
  await closePrisma();
});
