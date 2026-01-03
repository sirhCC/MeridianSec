import { getPrisma } from '../db/client.js';
import { NotFoundError, RepositoryError } from './errors.js';
import type { Placement } from '../core/types.js';
import type { Placement as PrismaPlacement } from '@prisma/client';

function map(row: PrismaPlacement): Placement {
  return {
    id: row.id,
    canaryId: row.canaryId,
    locationType: row.locationType as Placement['locationType'],
    locationRef: row.locationRef,
    insertedAt: row.insertedAt,
  };
}

export interface CreatePlacementInput {
  canaryId: string;
  locationType: Placement['locationType'];
  locationRef: string;
}

export class PlacementRepository {
  private get prisma() {
    return getPrisma();
  }

  async create(data: CreatePlacementInput): Promise<Placement> {
    try {
      const row = await this.prisma.placement.create({ data });
      return map(row);
    } catch (err) {
      throw new RepositoryError('Failed to create placement', err);
    }
  }

  async listByCanary(canaryId: string): Promise<Placement[]> {
    try {
      const rows = await this.prisma.placement.findMany({
        where: { canaryId },
        orderBy: { insertedAt: 'desc' },
      });
      return rows.map(map);
    } catch (err) {
      throw new RepositoryError(`Failed to list placements for canary ${canaryId}`, err);
    }
  }

  async get(id: string): Promise<Placement> {
    try {
      const row = await this.prisma.placement.findUnique({ where: { id } });
      if (!row) throw new NotFoundError(`Placement ${id} not found`);
      return map(row);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new RepositoryError(`Failed to get placement ${id}`, err);
    }
  }
}
