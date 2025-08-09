import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../src/config/index.js';

describe('config error handling', () => {
  it('throws on invalid JSON', () => {
    const tmp = path.join(process.cwd(), 'bad-config.json');
    fs.writeFileSync(tmp, '{ invalid');
    try {
      expect(() => loadConfig('bad-config.json')).toThrow();
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
