import { describe, it, expect } from 'vitest';
import { computeHashChain } from '../../src/utils/hashChain.js';

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
});
