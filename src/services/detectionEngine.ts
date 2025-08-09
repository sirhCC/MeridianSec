import { EventBus } from '../events/eventBus.js';
import { DetectionRepository } from '../repositories/detectionRepository.js';
import { CanaryRepository } from '../repositories/canaryRepository.js';
import { loadConfig } from '../config/index.js';
import { computeHashChain } from '../utils/hashChain.js';
import { getLogger } from '../utils/logging.js';
import { loadAlertingFromEnv, AlertingService } from './alerting.js';

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
  private pollTimer: NodeJS.Timeout | null = null;
  private cfg = loadConfig();
  private canaryRepo = new CanaryRepository();
  private alerting: AlertingService | null = null;

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
    // initialize alerting (lazy, env-based)
    this.alerting = loadAlertingFromEnv();
    this.bus.on('detectionProduced', async (evt) => {
      try {
        await this.handle(evt);
      } catch (err) {
        getLogger().error({ err }, 'Failed to process detectionProduced');
      }
    });
    // Start poll loop for mock cloudtrail mode
    if (process.env.ENABLE_POLL_LOOP === '1' && this.cfg.cloudtrail.mode === 'mock') {
      const interval = this.cfg.cloudtrail.pollIntervalMs;
      // Fire one immediate tick to reduce initial latency in tests
      void this.pollTick();
      this.pollTimer = setInterval(() => void this.pollTick(), interval);
    }
  }

  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
    // Alerting if threshold met
    if (this.alerting) {
      await this.alerting.maybeAlert({
        canaryId: record.canaryId,
        detectionId: record.id,
        confidenceScore: record.confidenceScore,
        source: record.source,
        hash: record.hashChainCurr,
        createdAt: record.detectionTime.toISOString(),
      });
    }
  }

  private async pollTick() {
    if (!this.running) return;
    try {
      const canaries = await this.canaryRepo.list();
      if (canaries.length === 0) return;
      if (process.env.POLL_ALL_CANARIES === '1') {
        // Deterministic test mode: emit a detection for every canary each tick
        for (const c of canaries) {
          this.bus.emit('detectionProduced', {
            canaryId: c.id,
            source: 'CLOUDTRAIL',
            rawEventJson: JSON.stringify({ synthetic: true, ts: Date.now() }),
            confidenceScore: 40,
          });
        }
      } else {
        // Default: pick a random canary to emit a synthetic detection (low volume)
        const pick = canaries[Math.floor(Math.random() * canaries.length)];
        this.bus.emit('detectionProduced', {
          canaryId: pick.id,
          source: 'CLOUDTRAIL',
          rawEventJson: JSON.stringify({ synthetic: true, ts: Date.now() }),
          confidenceScore: 40,
        });
      }
    } catch (err) {
      getLogger().warn({ err }, 'pollTick failed');
    }
  }
}
