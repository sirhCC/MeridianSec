import { getPrisma } from '../db/client.js';
import type { AlertFailureRecord } from '../core/types.js';
import { RepositoryError } from './errors.js';

// Inline shape to avoid reliance on generated client during initial migration addition
interface RowShape {
  id: string; detectionId: string; canaryId: string; adapter: string; reason: string;
  payloadJson: string; attempts: number; lastError: string | null; createdAt: Date;
  replayedAt: Date | null; replaySuccess: boolean | null;
}

function map(row: RowShape): AlertFailureRecord {
  return {
    id: row.id,
    detectionId: row.detectionId,
    canaryId: row.canaryId,
    adapter: row.adapter,
    reason: row.reason,
    payloadJson: row.payloadJson,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    replayedAt: row.replayedAt,
    replaySuccess: row.replaySuccess,
  };
}

export class AlertFailureRepository {
  private prisma = getPrisma();

  async record(params: {
    detectionId: string;
    canaryId: string;
    adapter: string;
    reason: string;
    payloadJson: string;
    attempts: number;
    lastError?: string;
  }): Promise<AlertFailureRecord> {
    try {
  // @ts-expect-error prisma model added in new migration; type available post generate
  const row: RowShape = await this.prisma.alertFailure.create({ data: { ...params } });
      return map(row);
    } catch (err) {
      throw new RepositoryError('Failed to persist alert failure', err);
    }
  }

  async list(limit = 50): Promise<AlertFailureRecord[]> {
    try {
  // @ts-expect-error prisma model added in new migration; type available post generate
  const rows: RowShape[] = await this.prisma.alertFailure.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
      return rows.map(map);
    } catch (err) {
      throw new RepositoryError('Failed to list alert failures', err);
    }
  }

  async get(id: string): Promise<AlertFailureRecord | null> {
    try {
  // @ts-expect-error prisma model added in new migration; type available post generate
  const row: RowShape | null = await this.prisma.alertFailure.findUnique({ where: { id } });
      return row ? map(row) : null;
    } catch (err) {
      throw new RepositoryError(`Failed to get alert failure ${id}`, err);
    }
  }

  async markReplay(id: string, success: boolean) {
    try {
  // @ts-expect-error prisma model added in new migration; type available post generate
  await this.prisma.alertFailure.update({
        where: { id },
        data: { replayedAt: new Date(), replaySuccess: success },
      });
    } catch (err) {
      throw new RepositoryError(`Failed to mark replay for ${id}`, err);
    }
  }
}
