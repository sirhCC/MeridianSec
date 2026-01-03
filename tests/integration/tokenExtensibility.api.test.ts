import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { closePrisma, resetPrisma, ensurePrismaConnected } from '../../src/db/client.js';
import crypto from 'crypto';
import { ensureTestDb } from '../utils/db.js';

let app: Awaited<ReturnType<typeof buildServer>>;

describe('Token Type Extensibility Integration', () => {
  beforeAll(async () => {
    await resetPrisma();
    process.env.DATABASE_URL = 'file:./data/test-token-extensibility.db';
    ensureTestDb();
    await ensurePrismaConnected();
    app = await buildServer();
  });

  afterAll(async () => {
    await closePrisma();
  });

  it('rotates AWS_IAM_KEY canary with proper token format', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');

    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'AWS_IAM_KEY', currentSecretHash, salt },
    });
    expect(createResp.statusCode).toBe(201);
    const canaryId = createResp.json().canary.id;

    const rotateResp = await app.inject({
      method: 'POST',
      url: `/v1/canaries/${canaryId}/rotate`,
    });
    expect(rotateResp.statusCode).toBe(200);
    const rotateBody = rotateResp.json();

    // Verify new secret follows AWS format
    expect(rotateBody.mockSecret).toMatch(/^AKIA[A-Z0-9]{20}$/);
    expect(rotateBody.rotation.oldSecretHash).toBe(currentSecretHash);
    expect(rotateBody.rotation.newSecretHash).not.toBe(currentSecretHash);
  });

  it('rotates FAKE_API_KEY canary with proper token format', async () => {
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');

    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'FAKE_API_KEY', currentSecretHash, salt },
    });
    expect(createResp.statusCode).toBe(201);
    const canaryId = createResp.json().canary.id;

    const rotateResp = await app.inject({
      method: 'POST',
      url: `/v1/canaries/${canaryId}/rotate`,
    });
    expect(rotateResp.statusCode).toBe(200);
    const rotateBody = rotateResp.json();

    // Verify new secret follows FAKE_API_KEY format
    expect(rotateBody.mockSecret).toMatch(/^CNRY_[a-f0-9]{32}$/);
    expect(rotateBody.rotation.oldSecretHash).toBe(currentSecretHash);
    expect(rotateBody.rotation.newSecretHash).not.toBe(currentSecretHash);
  });

  it('handles multiple rotations with different token types', async () => {
    // Create both types of canaries
    const salt1 = crypto.randomBytes(8).toString('hex');
    const salt2 = crypto.randomBytes(8).toString('hex');

    const aws = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: {
        type: 'AWS_IAM_KEY',
        currentSecretHash: crypto.randomBytes(16).toString('hex'),
        salt: salt1,
      },
    });
    const awsId = aws.json().canary.id;

    const fakeApi = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: {
        type: 'FAKE_API_KEY',
        currentSecretHash: crypto.randomBytes(16).toString('hex'),
        salt: salt2,
      },
    });
    const fakeApiId = fakeApi.json().canary.id;

    // Rotate both
    const awsRotate = await app.inject({
      method: 'POST',
      url: `/v1/canaries/${awsId}/rotate`,
    });
    const fakeRotate = await app.inject({
      method: 'POST',
      url: `/v1/canaries/${fakeApiId}/rotate`,
    });

    // Verify each uses its own generator
    expect(awsRotate.json().mockSecret).toMatch(/^AKIA/);
    expect(fakeRotate.json().mockSecret).toMatch(/^CNRY_/);
    expect(awsRotate.json().mockSecret).not.toMatch(/^CNRY_/);
    expect(fakeRotate.json().mockSecret).not.toMatch(/^AKIA/);
  });

  it('detection flow works identically regardless of token type', async () => {
    // Create a FAKE_API_KEY canary
    const currentSecretHash = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(8).toString('hex');

    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/canaries',
      payload: { type: 'FAKE_API_KEY', currentSecretHash, salt },
    });
    const canaryId = createResp.json().canary.id;

    // Simulate detection - this should work without any token-type-specific logic
    const detectResp = await app.inject({
      method: 'POST',
      url: '/v1/simulate/detection',
      payload: {
        canaryId,
        source: 'SIM',
        confidenceScore: 95,
        actorIdentity: 'test-actor',
      },
    });
    expect(detectResp.statusCode).toBe(202); // Detection processing is async

    // Poll for the detection to appear
    let detection: { canaryId: string; confidenceScore: number; hashChainCurr: string } | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const detResp = await app.inject({
        method: 'GET',
        url: `/v1/canaries/${canaryId}/detections`,
      });
      const body = detResp.json();
      if (body.detections && body.detections.length > 0) {
        detection = body.detections[0];
        break;
      }
    }

    expect(detection).toBeDefined();
    expect(detection.canaryId).toBe(canaryId);
    expect(detection.confidenceScore).toBe(95);
    expect(detection.hashChainCurr).toBeDefined();

    // Proves detection engine doesn't need token-type-specific code
  });
});
