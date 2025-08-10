import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CanaryRepository } from '../../src/repositories/canaryRepository.js';
import { PlacementRepository } from '../../src/repositories/placementRepository.js';
import { closePrisma } from '../../src/db/client.js';
import crypto from 'crypto';
import { ensureTestDb } from '../utils/db.js';

const canaryRepo = new CanaryRepository();
const placementRepo = new PlacementRepository();

describe('CanaryRepository', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'file:./data/test-canary-unit.db';
  ensureTestDb();
  });

  it('creates and lists canaries', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const created = await canaryRepo.create({ type: 'AWS_IAM_KEY', currentSecretHash, salt });
    const fetched = await canaryRepo.get(created.id);
    expect(fetched.id).toBe(created.id);
    const list = await canaryRepo.list();
    expect(list.find((c) => c.id === created.id)).toBeDefined();
  });

  it('creates placements for a canary', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const c = await canaryRepo.create({ type: 'FAKE_API_KEY', currentSecretHash, salt });
    await placementRepo.create({ canaryId: c.id, locationType: 'REPO_FILE', locationRef: 'X' });
    const placements = await placementRepo.listByCanary(c.id);
    expect(placements.length).toBe(1);
  });
});

afterAll(async () => {
  await closePrisma();
});
