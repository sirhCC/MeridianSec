import { getPrisma } from '../db/client.js';
import type { AlertFailureRecord } from '../core/types.js';
import { RepositoryError } from './errors.js';

// Inline shape to avoid reliance on generated client during initial migration addition
interface RowShape {
  id: string;
  detectionId: string;
  canaryId: string;
  adapter: string;
  reason: string;
  payloadJson: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  replayedAt: Date | null;
  replaySuccess: boolean | null;
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
  private get prisma() {
    return getPrisma();
  }
  private async updatePendingGauge() {
    try {
      const { alertFailuresPendingGauge } = await import('../metrics/index.js');
      const pending = await this.prisma.alertFailure.count({ where: { replayedAt: null } });
      alertFailuresPendingGauge.set(pending);
    } catch {
      /* metrics optional */
    }
  }

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
      const row: RowShape = await this.prisma.alertFailure.create({ data: { ...params } });
      void this.updatePendingGauge();
      return map(row);
    } catch (err) {
      throw new RepositoryError('Failed to persist alert failure', err);
    }
  }

  async list(limit = 50): Promise<AlertFailureRecord[]> {
    try {
      const rows: RowShape[] = await this.prisma.alertFailure.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      return rows.map(map);
    } catch (err) {
      throw new RepositoryError('Failed to list alert failures', err);
    }
  }

  async get(id: string): Promise<AlertFailureRecord | null> {
    try {
      const row: RowShape | null = await this.prisma.alertFailure.findUnique({ where: { id } });
      return row ? map(row) : null;
    } catch (err) {
      throw new RepositoryError(`Failed to get alert failure ${id}`, err);
    }
  }

  async markReplay(id: string, success: boolean) {
    try {
      // Fetch existing to compute age
      const existing: RowShape | null = await this.prisma.alertFailure.findUnique({
        where: { id },
      });
      await this.prisma.alertFailure.update({
        where: { id },
        data: { replayedAt: new Date(), replaySuccess: success },
      });
      if (existing) {
        try {
          const { alertFailureReplayAgeSeconds } = await import('../metrics/index.js');
          const ageSec = (Date.now() - existing.createdAt.getTime()) / 1000;
          alertFailureReplayAgeSeconds.observe(ageSec);
        } catch {
          /* metric optional */
        }
      }
      void this.updatePendingGauge();
    } catch (err) {
      throw new RepositoryError(`Failed to mark replay for ${id}`, err);
    }
  }

  /**
   * Purge alert failure records matching criteria. Supports dry-run to only count.
   * @param criteria olderThan: Date cutoff (createdAt < olderThan). replayedOnly: only purge records that have been replayed (success or failure). successfulOnly: only purge records replayed successfully. dryRun: if true, do not delete.
   */
  async purge(criteria: {
    olderThan?: Date;
    replayedOnly?: boolean;
    successfulOnly?: boolean;
    dryRun?: boolean;
  }): Promise<{ count: number }> {
    const where: Record<string, unknown> = {};
    if (criteria.olderThan) {
      // createdAt strictly less than cutoff
      where.createdAt = { lt: criteria.olderThan };
    }
    if (criteria.successfulOnly) {
      where.replaySuccess = true;
    } else if (criteria.replayedOnly) {
      where.replayedAt = { not: null };
    }
    try {
      if (criteria.dryRun) {
        const count: number = await this.prisma.alertFailure.count({ where });
        return { count };
      }
      const result = await this.prisma.alertFailure.deleteMany({ where });
      // Recompute pending gauge (deletions might have impacted pending if olderThan used without replay flags)
      void this.updatePendingGauge();
      return { count: result.count };
    } catch (err) {
      throw new RepositoryError('Failed to purge alert failures', err);
    }
  }

  async pendingCount(): Promise<number> {
    // Count unreplayed failures
    try {
      return await this.prisma.alertFailure.count({ where: { replayedAt: null } });
    } catch (err) {
      throw new RepositoryError('Failed to count pending alert failures', err);
    }
  }
}
