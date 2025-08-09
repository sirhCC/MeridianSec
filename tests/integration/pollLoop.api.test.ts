import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closePrisma } from '../../src/db/client.js';
import { ensureTestDb } from '../utils/db.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
// Use the concrete return type of buildServer to avoid generic mismatch with custom logger types
type TestServer = Awaited<ReturnType<typeof import('../../src/api/server.js').buildServer>>;
let app!: TestServer; // assigned in beforeAll via dynamic import

describe('Polling detection loop', () => {
  beforeAll(async () => {
    const dbRel = './data/test-poll.db';
    const abs = path.resolve(process.cwd(), dbRel.replace(/^\.\//, ''));
    if (fs.existsSync(abs)) fs.unlinkSync(abs); // start fresh to avoid many canaries diluting random pick
    process.env.DATABASE_URL = 'file:' + dbRel;
    process.env.CLOUDTRAIL_POLL_INTERVAL_MS = '150';
    process.env.ENABLE_POLL_LOOP = '1';
    process.env.POLL_ALL_CANARIES = '1';
    await closePrisma();
    ensureTestDb();
    const { buildServer } = await import('../../src/api/server.js');
    app = await buildServer();
  });

  it('emits synthetic detection without simulate endpoint', async () => {
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
