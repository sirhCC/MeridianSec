import { CanaryRepository, CreateCanaryInput } from '../repositories/canaryRepository.js';
import { PlacementRepository } from '../repositories/placementRepository.js';
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
}
