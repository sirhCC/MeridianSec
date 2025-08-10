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
    await new Promise((r) => setTimeout(r, 5));
    const b = await repo.record(mockParams());
    const list = await repo.list(10);
    const idxA = list.findIndex((f) => f.id === a.id);
    const idxB = list.findIndex((f) => f.id === b.id);
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(-1);
    // Newest (b) should appear before older (a)
    expect(idxB).toBeLessThan(idxA);
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

  it('purges replayed vs successful records (dry-run + delete)', async () => {
    const baselineReplayed = (await repo.purge({ replayedOnly: true, dryRun: true })).count;
    const baselineSuccessful = (await repo.purge({ successfulOnly: true, dryRun: true })).count;
    const success = await repo.record(mockParams());
    const failure = await repo.record(mockParams());
    const untouched = await repo.record(mockParams());
    await repo.markReplay(success.id, true);
    await repo.markReplay(failure.id, false);
    const afterReplayed = (await repo.purge({ replayedOnly: true, dryRun: true })).count;
    expect(afterReplayed - baselineReplayed).toBeGreaterThanOrEqual(2); // at least the two we added
    const del = await repo.purge({ successfulOnly: true });
    expect(del.count).toBeGreaterThanOrEqual(1); // at least our new success
    const afterSuccessful = (await repo.purge({ successfulOnly: true, dryRun: true })).count;
    // After deletion the total successful should be <= baselineSuccessful (cannot exceed baseline if ours was deleted)
    expect(afterSuccessful).toBeLessThanOrEqual(baselineSuccessful);
    // Remaining replayed count should equal (afterReplayed - deleted successes)
    const remainingReplayed = (await repo.purge({ replayedOnly: true, dryRun: true })).count;
    expect(remainingReplayed).toBe(afterReplayed - del.count);
    expect(untouched.id).toBeDefined();
  });
});

afterAll(async () => {
  await closePrisma();
});
