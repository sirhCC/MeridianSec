-- Migration: add AlertFailure table (dead-letter queue persistence)
CREATE TABLE "AlertFailure" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "detectionId" TEXT NOT NULL,
  "canaryId" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replayedAt" DATETIME,
  "replaySuccess" BOOLEAN
);
CREATE INDEX "AlertFailure_canaryId_createdAt_idx" ON "AlertFailure"("canaryId", "createdAt");
CREATE INDEX "AlertFailure_adapter_createdAt_idx" ON "AlertFailure"("adapter", "createdAt");
