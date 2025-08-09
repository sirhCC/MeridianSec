import { describe, it, expect, beforeEach } from 'vitest';
import { DetectionEngine } from '../../src/services/detectionEngine.js';
import { EventBus } from '../../src/events/eventBus.js';
import { __resetLoggerForTests, __enableTestLogCollector } from '../../src/utils/logging.js';

// Simple mock repo to avoid DB
interface MockRecord {
  id: string;
  detectionTime: Date;
  hashChainCurr: string;
  canaryId: string;
  source: string;
  confidenceScore: number;
  rawEventJson: string;
  actorIdentity?: string;
}
class MockDetectionRepo {
  private rec: MockRecord | null = null;
  async getLatestForCanary() {
    return this.rec;
  }
  async create(
    data: Omit<MockRecord, 'id' | 'detectionTime' | 'hashChainCurr'> & { hashChainCurr: string },
  ) {
    this.rec = {
      id: 'd1',
      detectionTime: new Date(),
      hashChainCurr: data.hashChainCurr,
      canaryId: data.canaryId,
      source: data.source,
      confidenceScore: data.confidenceScore,
      rawEventJson: data.rawEventJson,
      actorIdentity: data.actorIdentity,
    };
    return this.rec;
  }
}

beforeEach(() => {
  process.env.TEST_LOG_COLLECTOR = '1';
  __resetLoggerForTests();
  __enableTestLogCollector();
});

describe('Detection correlation ID', () => {
  it('logs correlationId on detection', async () => {
    const bus = new EventBus();
    const mockRepo =
      new MockDetectionRepo() as unknown as import('../../src/repositories/detectionRepository.js').DetectionRepository;
    const engine = new DetectionEngine({ bus, repo: mockRepo });
    engine.start();
    bus.emit('detectionProduced', {
      canaryId: 'c1',
      source: 'SIM',
      rawEventJson: '{}',
      confidenceScore: 50,
    });
    let detectionLog = '';
    for (let i = 0; i < 10; i++) {
      // up to ~500ms
      await new Promise((r) => setTimeout(r, 50));
      const logs =
        (globalThis as unknown as { __LOG_COLLECTOR__?: string[] }).__LOG_COLLECTOR__ || [];
      detectionLog = logs.find((l) => l.includes('canary-detection')) || '';
      if (detectionLog) break;
    }
    expect(detectionLog).toContain('correlationId');
  });
});
