import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closePrisma } from '../../src/db/client.js';
import { ensureTestDb } from '../utils/db.js';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

declare global {
  // eslint-disable-next-line no-var
  var __testDetectionId: string | undefined; // test-scoped handle
}

let failing = true;
const originalFetch = global.fetch;
const webhookUrl = 'https://replay.example.com/webhook';

beforeAll(async () => {
  // Ensure no stale connection to an old test DB
  await closePrisma();
  const dbRel = './data/test-alert-replay.db';
  const abs = path.resolve(process.cwd(), dbRel.replace(/^\.\//, ''));
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  process.env.DATABASE_URL = 'file:' + dbRel;
  process.env.ALERT_THRESHOLD = '10';
  process.env.ALERT_WEBHOOK_URL = webhookUrl;
  process.env.ALERT_STDOUT = '0';
  process.env.SYNC_DETECTIONS_FOR_TEST = '1';
  ensureTestDb();
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input === webhookUrl) {
      if (failing) return new Response('boom', { status: 500 });
      return new Response('ok', { status: 200 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  const { buildServer } = await import('../../src/api/server.js');
  const app = await buildServer();
  const create = await app.inject({
    method: 'POST',
    url: '/v1/canaries',
    payload: { type: 'AWS_IAM_KEY', currentSecretHash: 'hashhashhash123', salt: 's' },
  });
  const canaryId = create.json().canary.id;
  await app.inject({
    method: 'POST',
    url: '/v1/simulate/detection',
    payload: { canaryId, source: 'SIM', rawEventJson: '{}', confidenceScore: 99 },
  });
  // With SYNC_DETECTIONS_FOR_TEST the detection + alert attempts happen inline.
  const detResp = await app.inject({ method: 'GET', url: `/v1/canaries/${canaryId}/detections` });
  const detections = detResp.json().detections;
  global.__testDetectionId = detections[0].id as string;
});

afterAll(async () => {
  global.fetch = originalFetch;
  await closePrisma();
});

describe('Alert replay CLI', () => {
  it('replays failed alerts and marks success', async () => {
    const { getPrisma } = await import('../../src/db/client.js');
    const prisma = getPrisma();
  const detectionId = global.__testDetectionId!;
    // @ts-expect-error model via migration
    const initial = await prisma.alertFailure.findMany({ where: { detectionId } });
    expect(initial.length).toBe(1);
    expect(initial[0].replaySuccess).toBeNull();
    expect(initial[0].replayedAt).toBeNull();
    failing = false; // subsequent webhook attempts succeed
    const output = execSync('npx tsx src/cli/index.ts replay-failures --replay', {
      env: process.env,
    }).toString('utf8');
    expect(/Replayed .* OK/.test(output)).toBe(true);
    // @ts-expect-error model via migration
    const after = await prisma.alertFailure.findMany({ where: { detectionId } });
    expect(after[0].replaySuccess).toBe(true);
    expect(after[0].replayedAt).not.toBeNull();
  }, 30000); // increased from 15000 to 30000 to accommodate tsx startup + prisma engine on Windows CI
});
