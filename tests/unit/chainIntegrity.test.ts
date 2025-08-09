import { describe, it, expect } from 'vitest';
import { verifyDetectionChain } from '../../src/utils/chainIntegrity.js';
import { computeHashChain } from '../../src/utils/hashChain.js';
import type { Detection } from '../../src/core/types.js';

function makeDetection(partial: Partial<Detection>): Detection {
  return {
    id: partial.id || Math.random().toString(36).slice(2),
    canaryId: partial.canaryId || 'canary-1',
    detectionTime: partial.detectionTime || new Date(),
    source: partial.source || 'SIM',
    rawEventJson: partial.rawEventJson || '{}',
    actorIdentity: partial.actorIdentity,
    confidenceScore: partial.confidenceScore ?? 50,
    alertSent: partial.alertSent ?? false,
    hashChainPrev: partial.hashChainPrev ?? null,
    hashChainCurr: partial.hashChainCurr || '',
  };
}

describe('verifyDetectionChain', () => {
  it('validates an empty chain', () => {
    const res = verifyDetectionChain([]);
    expect(res.valid).toBe(true);
    expect(res.breaks.length).toBe(0);
  });

  it('accepts a valid two-element chain', () => {
    // first
    const canonical1 = JSON.stringify({
      canaryId: 'canary-1',
      source: 'SIM',
      rawEventJson: '{}',
      confidenceScore: 60,
      actorIdentity: null,
      prev: null,
    });
    const h1 = computeHashChain(null, canonical1);
    const d1 = makeDetection({
      id: 'd1',
      confidenceScore: 60,
      hashChainPrev: null,
      hashChainCurr: h1,
    });
    // second
    const canonical2 = JSON.stringify({
      canaryId: 'canary-1',
      source: 'SIM',
      rawEventJson: '{}',
      confidenceScore: 70,
      actorIdentity: null,
      prev: h1,
    });
    const h2 = computeHashChain(h1, canonical2);
    const d2 = makeDetection({
      id: 'd2',
      confidenceScore: 70,
      hashChainPrev: h1,
      hashChainCurr: h2,
    });
    const res = verifyDetectionChain([d1, d2]);
    expect(res.valid).toBe(true);
    expect(res.breaks.length).toBe(0);
    expect(res.lastHash).toBe(h2);
  });

  it('detects tampering (current hash mismatch)', () => {
    // Build a correct first detection
    const canonical1 = JSON.stringify({
      canaryId: 'canary-1',
      source: 'SIM',
      rawEventJson: '{}',
      confidenceScore: 50,
      actorIdentity: null,
      prev: null,
    });
    const h1 = computeHashChain(null, canonical1);
    const d1 = makeDetection({ id: 'd1', confidenceScore: 50, hashChainCurr: h1 });
    // Second detection but tamper by altering rawEventJson without updating hash
    const canonical2 = JSON.stringify({
      canaryId: 'canary-1',
      source: 'SIM',
      rawEventJson: '{"tampered":true}',
      confidenceScore: 55,
      actorIdentity: null,
      prev: h1,
    });
    const correctH2 = computeHashChain(h1, canonical2);
    const d2 = makeDetection({
      id: 'd2',
      confidenceScore: 55,
      rawEventJson: '{"tampered":true}',
      hashChainPrev: h1,
      hashChainCurr: 'badhash'.padEnd(64, '0'), // force mismatch
    });
    const res = verifyDetectionChain([d1, d2]);
    expect(res.valid).toBe(false);
    expect(res.breaks.length).toBe(1);
    expect(res.breaks[0].reason).toBe('CURR_MISMATCH');
    expect(res.breaks[0].expected).toBe(correctH2);
    expect(res.lastHash).toBe(h1); // only first valid
  });

  it('detects prev mismatch', () => {
    // first detection
    const canonical1 = JSON.stringify({
      canaryId: 'canary-1',
      source: 'SIM',
      rawEventJson: '{}',
      confidenceScore: 50,
      actorIdentity: null,
      prev: null,
    });
    const h1 = computeHashChain(null, canonical1);
    const d1 = makeDetection({ id: 'd1', confidenceScore: 50, hashChainCurr: h1 });
    // second with incorrect prev reference (simulate removal/reorder)
    const canonical2 = JSON.stringify({
      canaryId: 'canary-1',
      source: 'SIM',
      rawEventJson: '{}',
      confidenceScore: 55,
      actorIdentity: null,
      prev: 'WRONG',
    });
    const h2 = computeHashChain('WRONG', canonical2);
    const d2 = makeDetection({
      id: 'd2',
      confidenceScore: 55,
      hashChainPrev: 'WRONG',
      hashChainCurr: h2,
    });
    const res = verifyDetectionChain([d1, d2]);
    expect(res.valid).toBe(false);
    expect(res.breaks[0].reason).toBe('PREV_MISMATCH');
    expect(res.lastHash).toBe(h1);
  });
});
