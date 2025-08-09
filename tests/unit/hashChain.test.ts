import { describe, it, expect } from 'vitest';
import { computeHashChain, hashSecret, randomSalt } from '../../src/utils/hashChain.js';

describe('computeHashChain', () => {
  it('produces deterministic value', () => {
    const a = computeHashChain(null, '{"a":1}');
    const b = computeHashChain(null, '{"a":1}');
    expect(a).toEqual(b);
  });
  it('changes with prev hash', () => {
    const base = computeHashChain(null, '{"a":1}');
    const chained = computeHashChain(base, '{"a":1}');
    expect(chained).not.toEqual(base);
  });
  it('hashSecret is deterministic for same salt', () => {
    const salt = 'abcd';
    expect(hashSecret('secret', salt)).toEqual(hashSecret('secret', salt));
  });
  it('randomSalt produces hex of expected length', () => {
    const s = randomSalt(8); // 8 bytes -> 16 hex chars
    expect(s).toMatch(/^[0-9a-f]{16}$/);
  });
});
