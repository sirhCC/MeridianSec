import { describe, it, expect, vi } from 'vitest';
import { AlertingService } from '../../src/services/alerting.js';

// Mock global fetch for webhook channel tests
const originalFetch = global.fetch;

describe('AlertingService', () => {
  it('does not alert below threshold', async () => {
    const svc = new AlertingService({ threshold: 70, enableStdout: false });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await svc.maybeAlert({
      canaryId: 'c1',
      detectionId: 'd1',
      confidenceScore: 65,
      source: 'SIM',
      hash: 'h',
      createdAt: new Date().toISOString(),
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sends webhook and retries on failure', async () => {
    const calls: number[] = [];
    let attempt = 0;
    interface MockRes {
      ok: boolean;
      status: number;
    }
    // First two attempts fail, third succeeds
    global.fetch = (async () => {
      attempt++;
      calls.push(attempt);
      if (attempt < 3) {
        return { ok: false, status: 500 } as MockRes;
      }
      return { ok: true, status: 200 } as MockRes;
    }) as unknown as typeof fetch;

    const svc = new AlertingService({
      threshold: 10,
      enableStdout: false,
      webhook: { url: 'https://example.test/hook' },
    });
    await svc.maybeAlert({
      canaryId: 'c1',
      detectionId: 'd1',
      confidenceScore: 50,
      source: 'SIM',
      hash: 'h',
      createdAt: new Date().toISOString(),
    });
    expect(calls.length).toBe(3); // 2 failures + 1 success
    global.fetch = originalFetch;
  });
});
