import { getPrisma } from '../db/client.js';
import { RepositoryError } from './errors.js';
import type { Rotation } from '../core/types.js';
import type { Rotation as PrismaRotation } from '@prisma/client';

function map(row: PrismaRotation): Rotation {
  return {
    id: row.id,
    canaryId: row.canaryId,
    oldSecretHash: row.oldSecretHash,
    newSecretHash: row.newSecretHash,
    rotatedAt: row.rotatedAt,
    rotatedBy: row.rotatedBy,
  };
}

export interface CreateRotationInput {
  canaryId: string;
  oldSecretHash: string;
  newSecretHash: string;
  rotatedBy: string;
}

export class RotationRepository {
  private get prisma() {
    return getPrisma();
  }

  async create(data: CreateRotationInput): Promise<Rotation> {
    try {
      const row = await this.prisma.rotation.create({ data });
      return map(row);
    } catch (err) {
      throw new RepositoryError('Failed to create rotation', err);
    }
  }

  async listByCanary(canaryId: string): Promise<Rotation[]> {
    try {
      const rows = await this.prisma.rotation.findMany({
        where: { canaryId },
        orderBy: { rotatedAt: 'desc' },
      });
      return rows.map(map);
    } catch (err) {
      throw new RepositoryError(`Failed to list rotations for canary ${canaryId}`, err);
    }
  }
}
