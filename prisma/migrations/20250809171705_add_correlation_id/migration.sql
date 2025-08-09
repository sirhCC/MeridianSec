-- Add correlationId column with default cuid() (simulate by trigger in sqlite via generated value)
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
  "correlationId" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))||hex(randomblob(4))||hex(randomblob(4)))) ,
  CONSTRAINT "Detection_canaryId_fkey" FOREIGN KEY ("canaryId") REFERENCES "Canary" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Detection" ("actorIdentity", "alertSent", "canaryId", "confidenceScore", "detectionTime", "hashChainCurr", "hashChainPrev", "id", "rawEventJson", "source", "correlationId") SELECT "actorIdentity", "alertSent", "canaryId", "confidenceScore", "detectionTime", "hashChainCurr", "hashChainPrev", "id", "rawEventJson", "source", lower(hex(randomblob(4))||hex(randomblob(4))||hex(randomblob(4))) FROM "Detection";
DROP TABLE "Detection";
ALTER TABLE "new_Detection" RENAME TO "Detection";
CREATE INDEX "Detection_canaryId_detectionTime_idx" ON "Detection"("canaryId", "detectionTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
