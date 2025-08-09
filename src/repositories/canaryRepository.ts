import { getPrisma } from '../db/client.js';
import { NotFoundError, RepositoryError } from './errors.js';
import type { Canary } from '../core/types.js';
import type { Canary as PrismaCanary } from '@prisma/client';

// Data mapping helper (currently 1:1 but isolates future changes)
function map(row: PrismaCanary): Canary {
  return {
    id: row.id,
    type: row.type as Canary['type'],
    active: row.active ?? true,
    currentSecretHash: row.currentSecretHash,
    salt: row.salt,
    createdAt: row.createdAt,
  };
}

export interface CreateCanaryInput {
  type: string;
  active?: boolean;
  currentSecretHash: string;
  salt: string;
}

export class CanaryRepository {
  private prisma = getPrisma();

  async create(data: CreateCanaryInput): Promise<Canary> {
    try {
      const row = await this.prisma.canary.create({
        data: { ...data, active: data.active ?? true },
      });
      return map(row);
    } catch (err) {
      throw new RepositoryError('Failed to create canary', err);
    }
  }

  async get(id: string): Promise<Canary> {
    try {
      const row = await this.prisma.canary.findUnique({ where: { id } });
      if (!row) throw new NotFoundError(`Canary ${id} not found`);
      return map(row);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new RepositoryError(`Failed to get canary ${id}`, err);
    }
  }

  async list(): Promise<Canary[]> {
    try {
      const rows = await this.prisma.canary.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(map);
    } catch (err) {
      throw new RepositoryError('Failed to list canaries', err);
    }
  }

  async updateSecretHash(id: string, newHash: string): Promise<Canary> {
    try {
      const row = await this.prisma.canary.update({
        where: { id },
        data: { currentSecretHash: newHash },
      });
      return map(row);
    } catch (err) {
      throw new RepositoryError(`Failed to update canary secret hash ${id}`, err);
    }
  }
}
