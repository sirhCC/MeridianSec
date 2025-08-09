import { describe, it, expect } from 'vitest';
import { buildServer } from '../../src/api/server.js';

describe('health endpoint', () => {
  it('returns ok', async () => {
    const s = await buildServer();
    const res = await s.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });
});
