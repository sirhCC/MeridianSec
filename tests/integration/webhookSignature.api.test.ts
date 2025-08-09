import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closePrisma } from '../../src/db/client.js';
import { ensureTestDb } from '../utils/db.js';
import path from 'path';
import fs from 'fs';

let app: Awaited<ReturnType<typeof import('../../src/api/server.js').buildServer>>;
interface CapturedWebhook {
  headers: Record<string, string>;
  body: string;
}
const received: CapturedWebhook[] = [];

// Simple local webhook receiver via fetch mock
const originalFetch = global.fetch;

beforeAll(async () => {
  // Mock fetch to capture webhook call
  // First arg is URL
  // We only mock for the specific webhook URL
  const webhookUrl = 'https://example.com/webhook';
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input === webhookUrl) {
      const headers: Record<string, string> = {};
      if (init?.headers) {
        // Normalize headers (Headers, array, or object) into Record<string,string>
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => (headers[k] = v));
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) headers[k.toLowerCase()] = v as string;
        } else {
          for (const [k, v] of Object.entries(init.headers as Record<string, string>))
            headers[k.toLowerCase()] = v;
        }
      }
      received.push({ headers, body: (init?.body as string) || '' });
      return new Response('', { status: 200 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const dbRel = './data/test-webhook-sig.db';
  const abs = path.resolve(process.cwd(), dbRel.replace(/^\.\//, ''));
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  process.env.DATABASE_URL = 'file:' + dbRel;
  process.env.ALERT_THRESHOLD = '10';
  process.env.ALERT_STDOUT = '0';
  process.env.ALERT_WEBHOOK_URL = 'https://example.com/webhook';
  process.env.ALERT_HMAC_SECRET = 'supersecretkey';
  ensureTestDb();
  const { buildServer } = await import('../../src/api/server.js');
  app = await buildServer();
});

afterAll(async () => {
  global.fetch = originalFetch;
  await closePrisma();
});

describe('Webhook signature', () => {
  it('adds x-canary-signature header', async () => {
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash: 'sigtesthash1', salt: 's' },
    });
    expect(createResp.statusCode).toBe(201);
    const canaryId = createResp.json().canary.id;

    const simResp = await app.inject({
      method: 'POST',
      url: '/v1/simulate/detection',
      payload: { canaryId, source: 'SIM', rawEventJson: '{}', confidenceScore: 99 },
    });
    expect(simResp.statusCode).toBe(202);

    // Wait briefly for async alert send
    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBeGreaterThan(0);
    const hdrs = received[0].headers as Record<string, string>;
    expect(Object.keys(hdrs)).toContain('x-canary-signature');
    expect(hdrs['x-canary-signature']).toMatch(/^[0-9a-f]{64}$/);
  });
});
