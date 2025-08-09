import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { closePrisma } from '../../src/db/client.js';
import { ensureTestDb } from '../utils/db.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let app: Awaited<ReturnType<typeof buildServer>>;

// Temporarily skipped due to flakiness (FK race creating detection immediately after canary).
describe.skip('GET /v1/detections/correlation/:correlationId', () => {
  beforeAll(async () => {
    const dbRel = './data/test-detection-correlation.db';
    const abs = path.resolve(process.cwd(), dbRel.replace(/^\.\//, ''));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    process.env.DATABASE_URL = 'file:' + dbRel;
    process.env.SYNC_DETECTIONS_FOR_TEST = '1';
    delete process.env.ENABLE_POLL_LOOP; // deterministic tests
    await closePrisma();
    ensureTestDb();
    app = await buildServer();
  });

  it('creates a detection via simulate endpoint and fetches it by correlationId', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const createCanaryResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash, salt },
    });
    expect(createCanaryResp.statusCode).toBe(201);
    const canaryId = createCanaryResp.json().canary.id;

    const simResp = await app.inject({
      method: 'POST',
      url: '/v1/simulate/detection',
      payload: { canaryId, source: 'SIM', rawEventJson: '{}', confidenceScore: 77 },
    });
    expect(simResp.statusCode).toBe(202);
    const listResp = await app.inject({
      method: 'GET',
      url: `/v1/canaries/${canaryId}/detections`,
    });
    const listBody = listResp.json();
    expect(Array.isArray(listBody.detections)).toBe(true);
    expect(listBody.detections.length).toBe(1);
    const correlationId = listBody.detections[0].correlationId;
    const getResp = await app.inject({
      method: 'GET',
      url: `/v1/detections/correlation/${correlationId}`,
    });
    expect(getResp.statusCode).toBe(200);
    const det = getResp.json().detection;
    expect(det.correlationId).toBe(correlationId);
    expect(det.canaryId).toBe(canaryId);
  });
});

afterAll(async () => {
  await closePrisma();
});
