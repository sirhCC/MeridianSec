// Domain model TypeScript interfaces mirroring Prisma but decoupled for testability

export type CanaryType = 'AWS_IAM_KEY' | 'FAKE_API_KEY';
export type PlacementLocationType = 'REPO_FILE' | 'CI_VAR' | 'S3_OBJECT' | 'ENV_FILE';
export type DetectionSource = 'CLOUDTRAIL' | 'SIM' | 'MANUAL';

export interface Canary {
  id: string;
  type: CanaryType;
  active: boolean;
  currentSecretHash: string;
  salt: string;
  createdAt: Date;
}

export interface Placement {
  id: string;
  canaryId: string;
  locationType: PlacementLocationType;
  locationRef: string;
  insertedAt: Date;
}

export interface Rotation {
  id: string;
  canaryId: string;
  oldSecretHash: string;
  newSecretHash: string;
  rotatedAt: Date;
  rotatedBy: string;
}

export interface Detection {
  id: string;
  canaryId: string;
  detectionTime: Date;
  source: DetectionSource;
  rawEventJson: string;
  actorIdentity?: string;
  confidenceScore: number;
  alertSent: boolean;
  hashChainPrev?: string | null;
  hashChainCurr: string;
  correlationId: string; // persisted correlation trace id
}

export interface AlertFailureRecord {
  id: string;
  detectionId: string;
  canaryId: string;
  adapter: string;
  reason: string;
  payloadJson: string;
  attempts: number;
  lastError?: string | null;
  createdAt: Date;
  replayedAt?: Date | null;
  replaySuccess?: boolean | null;
}
}
