import { CanaryRepository, CreateCanaryInput } from '../repositories/canaryRepository.js';
import { PlacementRepository } from '../repositories/placementRepository.js';
import { RotationRepository } from '../repositories/rotationRepository.js';
import { TokenGeneratorFactory } from '../tokens/index.js';
import crypto from 'crypto';
import type { Canary, Placement } from '../core/types.js';

export interface CreateCanaryRequest {
  type: string; // external type value
  placements?: { locationType: Placement['locationType']; locationRef: string }[];
  currentSecretHash: string;
  salt: string;
}

export class CanaryService {
  constructor(
    private canaryRepo = new CanaryRepository(),
    private placementRepo = new PlacementRepository(),
    private rotationRepo = new RotationRepository(),
  ) {}

  async create(req: CreateCanaryRequest): Promise<{ canary: Canary; placements: Placement[] }> {
    // Basic validation (further enforced via schema upstream)
    const data: CreateCanaryInput = {
      type: req.type,
      currentSecretHash: req.currentSecretHash,
      salt: req.salt,
    };
    const canary = await this.canaryRepo.create(data);
    const placements: Placement[] = [];
    if (req.placements?.length) {
      for (const p of req.placements) {
        const created = await this.placementRepo.create({
          canaryId: canary.id,
          locationType: p.locationType,
          locationRef: p.locationRef,
        });
        placements.push(created);
      }
    }
    return { canary, placements };
  }

  async get(id: string): Promise<{ canary: Canary; placements: Placement[] }> {
    const canary = await this.canaryRepo.get(id);
    const placements = await this.placementRepo.listByCanary(id);
    return { canary, placements };
  }

  async list(): Promise<Canary[]> {
    return this.canaryRepo.list();
  }

  async rotate(
    id: string,
    rotatedBy = 'system',
  ): Promise<{
    rotation: { oldSecretHash: string; newSecretHash: string };
    canary: Canary;
    generatedSecret: string;
  }> {
    const start = process.hrtime.bigint();
    const canary = await this.canaryRepo.get(id);
    const oldHash = canary.currentSecretHash;

    // Generate new secret using token generator for the canary's type
    const generated = TokenGeneratorFactory.generate(canary.type);
    const newSecret = generated.secret;

    // Hashing strategy: sha256(salt + secret)
    const newHash = crypto
      .createHash('sha256')
      .update(canary.salt + newSecret)
      .digest('hex');
    const updated = await this.canaryRepo.updateSecretHash(id, newHash);
    await this.rotationRepo.create({
      canaryId: id,
      oldSecretHash: oldHash,
      newSecretHash: newHash,
      rotatedBy,
    });
    // metrics
    try {
      const { rotationsTotal, rotationsLatencySeconds } = await import('../metrics/index.js');
      rotationsTotal.inc({ type: canary.type });
      const end = process.hrtime.bigint();
      rotationsLatencySeconds.observe(Number(end - start) / 1e9);
    } catch {
      /* ignore dynamic import errors in tests */
    }
    return {
      rotation: { oldSecretHash: oldHash, newSecretHash: newHash },
      canary: updated,
      generatedSecret: newSecret,
    };
  }
}
