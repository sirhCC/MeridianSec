import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';

describe('config loader', () => {
  it('loads defaults when file missing', () => {
    const cfg = loadConfig('nonexistent-config.json');
    expect(cfg.database.url).toContain('file:');
    expect(cfg.cloudtrail.mode).toBe('mock');
  });
});
