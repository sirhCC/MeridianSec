import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AlertFailureRepository } from '../../src/repositories/alertFailureRepository.js';
import { closePrisma } from '../../src/db/client.js';
import { ensureTestDb } from '../utils/db.js';
import crypto from 'crypto';

const repo = new AlertFailureRepository();

function mockParams() {
  return {
    detectionId: crypto.randomUUID(),
    canaryId: crypto.randomUUID(),
    adapter: 'WebhookAlertChannel',
    reason: 'Error',
    payloadJson: JSON.stringify({ foo: 'bar', canaryId: 'x' }),
    attempts: 3,
    lastError: 'boom',
  };
}

describe('AlertFailureRepository', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'file:./data/test-alert-failure-unit.db';
    ensureTestDb();
  });

  it('records and retrieves a failure', async () => {
    const r = await repo.record(mockParams());
    expect(r.id).toBeDefined();
    const fetched = await repo.get(r.id);
    expect(fetched?.id).toBe(r.id);
    expect(fetched?.replaySuccess).toBeNull();
  });

  it('lists failures in descending order', async () => {
    const a = await repo.record(mockParams());
    await new Promise(r => setTimeout(r, 5));
    const b = await repo.record(mockParams());
    const list = await repo.list(10);
    expect(list[0].id).toBe(b.id);
    expect(list.find(f => f.id === a.id)).toBeDefined();
  });

  it('marks replay success and failure', async () => {
    const rec = await repo.record(mockParams());
    await repo.markReplay(rec.id, true);
    const afterSuccess = await repo.get(rec.id);
    expect(afterSuccess?.replaySuccess).toBe(true);
    expect(afterSuccess?.replayedAt).toBeInstanceOf(Date);

    const rec2 = await repo.record(mockParams());
    await repo.markReplay(rec2.id, false);
    const afterFail = await repo.get(rec2.id);
    expect(afterFail?.replaySuccess).toBe(false);
  });
});

afterAll(async () => {
  await closePrisma();
});
