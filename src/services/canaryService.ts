import { CanaryRepository, CreateCanaryInput } from '../repositories/canaryRepository.js';
import { PlacementRepository } from '../repositories/placementRepository.js';
import { RotationRepository } from '../repositories/rotationRepository.js';
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
    const canary = await this.canaryRepo.get(id);
    const oldHash = canary.currentSecretHash;
    // Generate new mock secret (consistent pattern) and hash with existing salt
    const newSecret = 'ROT' + crypto.randomBytes(16).toString('hex');
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
      const { rotationsTotal } = await import('../metrics/index.js');
      rotationsTotal.inc({ type: 'default' });
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
