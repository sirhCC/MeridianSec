import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closePrisma } from '../../src/db/client.js';
import { ensureTestDb } from '../utils/db.js';
import path from 'path';
import fs from 'fs';

let app: Awaited<ReturnType<typeof import('../../src/api/server.js').buildServer>>;
const originalFetch = global.fetch;

beforeAll(async () => {
  const failingUrl = 'https://fail.example.com/webhook';
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input === failingUrl) {
      return new Response('boom', { status: 500 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const dbRel = './data/test-alert-dlq.db';
  const abs = path.resolve(process.cwd(), dbRel.replace(/^.\//, ''));
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  process.env.DATABASE_URL = 'file:' + dbRel;
  process.env.ALERT_THRESHOLD = '10';
  process.env.ALERT_STDOUT = '0';
  process.env.ALERT_WEBHOOK_URL = failingUrl;
  ensureTestDb();
  const { buildServer } = await import('../../src/api/server.js');
  app = await buildServer();
});

afterAll(async () => {
  global.fetch = originalFetch;
  await closePrisma();
});

describe('Alert dead-letter persistence', () => {
  it('persists failure after retries', async () => {
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash: 'deadletterhash', salt: 's' },
    });
    expect(createResp.statusCode).toBe(201);
    const canaryId = createResp.json().canary.id;
    const simResp = await app.inject({
      method: 'POST',
      url: '/v1/simulate/detection',
      payload: { canaryId, source: 'SIM', rawEventJson: '{}', confidenceScore: 99 },
    });
    expect(simResp.statusCode).toBe(202);
    await new Promise((r) => setTimeout(r, 400));
    const { getPrisma } = await import('../../src/db/client.js');
    const prisma = getPrisma();
    // @ts-expect-error prisma model after migration
    const failures = await prisma.alertFailure.findMany();
    expect(failures.length).toBeGreaterThan(0);
    const f = failures[0];
    expect(f.adapter).toBe('WebhookAlertChannel');
    expect(f.reason).toBe('Error');
    expect(f.attempts).toBeGreaterThanOrEqual(3);
  });
});
