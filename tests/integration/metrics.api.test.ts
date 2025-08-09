import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closePrisma } from '../../src/db/client.js';
import { ensureTestDb } from '../utils/db.js';
import fs from 'fs';
import path from 'path';

let app: Awaited<ReturnType<typeof import('../../src/api/server.js').buildServer>>;

describe('Metrics endpoint', () => {
  beforeAll(async () => {
    const dbRel = './data/test-metrics.db';
    const abs = path.resolve(process.cwd(), dbRel.replace(/^\.\//, ''));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    process.env.DATABASE_URL = 'file:' + dbRel;
    process.env.ALERT_THRESHOLD = '10'; // very low to trigger alerts
    process.env.ALERT_STDOUT = '0'; // silence stdout channel to reduce noise
    ensureTestDb();
    const { buildServer } = await import('../../src/api/server.js');
    app = await buildServer();
  });

  it('exposes Prometheus metrics including detections_total', async () => {
    // Create canary
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash: 'hashhash1234', salt: 's' },
    });
    expect(createResp.statusCode).toBe(201);
    const canaryId = createResp.json().canary.id;
    // Simulate detection above threshold
    const simResp = await app.inject({
      method: 'POST',
      url: '/v1/simulate/detection',
      payload: { canaryId, source: 'SIM', rawEventJson: '{}', confidenceScore: 90 },
    });
    expect(simResp.statusCode).toBe(202);
    // Poll metrics until counter increments
    let metrics = '';
    for (let i = 0; i < 10; i++) {
      const m = await app.inject({ method: 'GET', url: '/metrics' });
      metrics = m.body as string;
      if (/detections_total{source="SIM"} 1/.test(metrics)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(metrics).toMatch(/detections_total{source="SIM"} 1/);
  });
});

afterAll(async () => {
  await closePrisma();
});
