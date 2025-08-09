-- CreateTable
CREATE TABLE "Canary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currentSecretHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canaryId" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "locationRef" TEXT NOT NULL,
    "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Placement_canaryId_fkey" FOREIGN KEY ("canaryId") REFERENCES "Canary" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canaryId" TEXT NOT NULL,
    "oldSecretHash" TEXT NOT NULL,
    "newSecretHash" TEXT NOT NULL,
    "rotatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedBy" TEXT NOT NULL,
    CONSTRAINT "Rotation_canaryId_fkey" FOREIGN KEY ("canaryId") REFERENCES "Canary" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Detection" (
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
    CONSTRAINT "Detection_canaryId_fkey" FOREIGN KEY ("canaryId") REFERENCES "Canary" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Detection_canaryId_detectionTime_idx" ON "Detection"("canaryId", "detectionTime");
