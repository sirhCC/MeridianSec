/*
  Warnings:

  - Added the required column `correlationId` to the `Detection` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Detection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canaryId" TEXT NOT NULL,
    "detectionTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "rawEventJson" TEXT NOT NULL,
    "actorIdentity" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "hashChainPrev" TEXT,
    "hashChainCurr" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    CONSTRAINT "Detection_canaryId_fkey" FOREIGN KEY ("canaryId") REFERENCES "Canary" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Detection" ("actorIdentity", "alertSent", "canaryId", "confidenceScore", "detectionTime", "hashChainCurr", "hashChainPrev", "id", "rawEventJson", "source") SELECT "actorIdentity", "alertSent", "canaryId", "confidenceScore", "detectionTime", "hashChainCurr", "hashChainPrev", "id", "rawEventJson", "source" FROM "Detection";
DROP TABLE "Detection";
ALTER TABLE "new_Detection" RENAME TO "Detection";
CREATE UNIQUE INDEX "Detection_correlationId_key" ON "Detection"("correlationId");
CREATE INDEX "Detection_canaryId_detectionTime_idx" ON "Detection"("canaryId", "detectionTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
