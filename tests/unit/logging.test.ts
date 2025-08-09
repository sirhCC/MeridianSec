import { describe, it, expect, beforeEach } from 'vitest';
import { getLogger, __resetLoggerForTests } from '../../src/utils/logging.js';

describe('logging singleton', () => {
  beforeEach(() => {
    __resetLoggerForTests();
  });

  it('returns same instance', () => {
    const a = getLogger();
    const b = getLogger();
    expect(a).toBe(b);
  });

  it('honors LOG_LEVEL env', () => {
    process.env.LOG_LEVEL = 'debug';
    __resetLoggerForTests();
    const l = getLogger();
    expect(l.level).toBe('debug');
  });
});
