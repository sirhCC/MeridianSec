import { getPrisma } from '../db/client.js';
import { RepositoryError } from './errors.js';
import type { Detection } from '../core/types.js';
import type { Detection as PrismaDetection } from '@prisma/client';

function map(row: PrismaDetection): Detection {
  return {
    id: row.id,
    canaryId: row.canaryId,
    detectionTime: row.detectionTime,
    source: row.source as Detection['source'],
    rawEventJson: row.rawEventJson,
    actorIdentity: row.actorIdentity ?? undefined,
    confidenceScore: row.confidenceScore,
    alertSent: row.alertSent,
    hashChainPrev: row.hashChainPrev,
    hashChainCurr: row.hashChainCurr,
    correlationId: row.correlationId,
  };
}

export interface CreateDetectionInput {
  canaryId: string;
  source: Detection['source'];
  rawEventJson: string;
  actorIdentity?: string;
  confidenceScore: number;
  hashChainPrev?: string | null;
  hashChainCurr: string;
  correlationId: string;
}

export class DetectionRepository {
  private get prisma() {
    return getPrisma();
  }

  async create(data: CreateDetectionInput): Promise<Detection> {
    try {
      const row = await this.prisma.detection.create({ data });
      return map(row);
    } catch (err) {
      throw new RepositoryError('Failed to create detection', err);
    }
  }

  async listByCanary(canaryId: string): Promise<Detection[]> {
    try {
      const rows = await this.prisma.detection.findMany({
        where: { canaryId },
        orderBy: [{ detectionTime: 'asc' }, { id: 'asc' }],
      });
      return rows.map(map);
    } catch (err) {
      throw new RepositoryError(`Failed to list detections for canary ${canaryId}`, err);
    }
  }

  async getLatestForCanary(canaryId: string): Promise<Detection | null> {
    try {
      const row = await this.prisma.detection.findFirst({
        where: { canaryId },
        orderBy: { detectionTime: 'desc' },
      });
      return row ? map(row) : null;
    } catch (err) {
      throw new RepositoryError(`Failed to get latest detection for canary ${canaryId}`, err);
    }
  }

  async findByCorrelationId(correlationId: string): Promise<Detection | null> {
    try {
      const row = await this.prisma.detection.findFirst({ where: { correlationId } });
      return row ? map(row) : null;
    } catch (err) {
      throw new RepositoryError(`Failed to find detection by correlationId ${correlationId}`, err);
    }
  }
}
