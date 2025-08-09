import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CanaryRepository } from '../../src/repositories/canaryRepository.js';
import { RotationRepository } from '../../src/repositories/rotationRepository.js';
import { DetectionRepository } from '../../src/repositories/detectionRepository.js';
import { closePrisma } from '../../src/db/client.js';
import crypto from 'crypto';

const canaryRepo = new CanaryRepository();
const rotationRepo = new RotationRepository();
const detectionRepo = new DetectionRepository();

describe('Rotation & Detection Repositories', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'file:./data/test-canary-unit2.db';
  });

  it('records rotation entries', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const canary = await canaryRepo.create({ type: 'AWS_IAM_KEY', currentSecretHash, salt });
    const newHash = crypto.randomBytes(16).toString('hex');
    const rotation = await rotationRepo.create({
      canaryId: canary.id,
      oldSecretHash: currentSecretHash,
      newSecretHash: newHash,
      rotatedBy: 'test',
    });
    const list = await rotationRepo.listByCanary(canary.id);
    expect(list.find((r) => r.id === rotation.id)).toBeDefined();
  });

  it('records detection entries and retrieves latest', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');
    const canary = await canaryRepo.create({ type: 'FAKE_API_KEY', currentSecretHash, salt });
    const det = await detectionRepo.create({
      canaryId: canary.id,
      source: 'SIM',
      rawEventJson: '{}',
      confidenceScore: 90,
      hashChainCurr: 'abc123',
    });
    const list = await detectionRepo.listByCanary(canary.id);
    expect(list.length).toBe(1);
    const latest = await detectionRepo.getLatestForCanary(canary.id);
    expect(latest?.id).toBe(det.id);
  });
});

afterAll(async () => {
  await closePrisma();
});
