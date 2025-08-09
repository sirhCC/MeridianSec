import { describe, it, expect } from 'vitest';
import { buildCanonicalPayload, hmacSign } from '../../src/utils/signing.js';

describe('signing utilities', () => {
  it('produces stable canonical JSON ordering keys', () => {
    const obj = { b: 2, a: 1, z: { c: 3, a: 1 }, arr: [{ y: 2, x: 1 }] };
    const canon = buildCanonicalPayload(obj);
    expect(canon).toBe('{"a":1,"arr":[{"x":1,"y":2}],"b":2,"z":{"a":1,"c":3}}');
  });

  it('hmacSign returns expected sha256 hex', () => {
    const body = 'test-body';
    const secret = 'secret';
    const sig = hmacSign(body, secret);
    // precomputed via Node crypto
    expect(sig).toBe('cd165584491f0734ce620343b5022ffe092f535a2468bb2d283e32ebbe0cd7eb');
  });
});
