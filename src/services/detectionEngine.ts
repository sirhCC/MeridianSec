import { EventBus } from '../events/eventBus.js';
import { DetectionRepository } from '../repositories/detectionRepository.js';
import { computeHashChain } from '../utils/hashChain.js';
import { getLogger } from '../utils/logging.js';

export interface DetectionEvents {
  [k: string]: unknown;
  detectionProduced: {
    canaryId: string;
    source: 'SIM' | 'CLOUDTRAIL' | 'MANUAL';
    rawEventJson: string;
    actorIdentity?: string;
    confidenceScore: number;
  };
}

export class DetectionEngine {
  private bus: EventBus<DetectionEvents>;
  private repo: DetectionRepository;
  private running = false;

  constructor(opts?: { bus?: EventBus<DetectionEvents>; repo?: DetectionRepository }) {
    this.bus = opts?.bus || new EventBus<DetectionEvents>();
    this.repo = opts?.repo || new DetectionRepository();
  }

  get eventBus() {
    return this.bus;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.bus.on('detectionProduced', async (evt) => {
      try {
        await this.handle(evt);
      } catch (err) {
        getLogger().error({ err }, 'Failed to process detectionProduced');
      }
    });
  }

  stop() {
    this.running = false;
  }

  private async handle(evt: DetectionEvents['detectionProduced']) {
    if (!this.running) return;
    const latest = await this.repo.getLatestForCanary(evt.canaryId);
    const prevHash = latest?.hashChainCurr || null;
    const canonical = JSON.stringify({
      canaryId: evt.canaryId,
      source: evt.source,
      rawEventJson: evt.rawEventJson,
      confidenceScore: evt.confidenceScore,
      actorIdentity: evt.actorIdentity || null,
      prev: prevHash,
    });
    const currHash = computeHashChain(prevHash, canonical);
    const record = await this.repo.create({
      canaryId: evt.canaryId,
      source: evt.source,
      rawEventJson: evt.rawEventJson,
      actorIdentity: evt.actorIdentity,
      confidenceScore: evt.confidenceScore,
      hashChainPrev: prevHash,
      hashChainCurr: currHash,
    });
    getLogger().info(
      { detectionId: record.id, canaryId: record.canaryId, hash: record.hashChainCurr },
      'canary-detection',
    );
  }
}
