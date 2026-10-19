-- CreateTable
CREATE TABLE "OperationsProfile" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT true,
    "preferences" JSONB NOT NULL,
    "perJobUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "dailyUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "monthlyUsd" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "assumedWatts" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "electricityRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "workerSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationsProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OperationsSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationsSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "reservedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "apiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "energyEstimateUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assumedWatts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "electricityRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 'deterministic',
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "localInferenceMs" INTEGER,
    "estimatedBusinessValueUsd" DOUBLE PRECISION,
    "verifiedRevenueUsd" DOUBLE PRECISION,
    "approvalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "changed" BOOLEAN NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "brief" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "actionHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsApproval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "actionHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsExecution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "decisionId" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsOutcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "observedResult" TEXT NOT NULL,
    "variance" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsCostReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "reservedUsd" DOUBLE PRECISION NOT NULL,
    "apiCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "energyEstimateUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsCostReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationsSchedule_nextRunAt_idx" ON "OperationsSchedule"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsSchedule_userId_domain_key" ON "OperationsSchedule"("userId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsRun_dedupeKey_key" ON "OperationsRun"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsRun_approvalId_key" ON "OperationsRun"("approvalId");

-- CreateIndex
CREATE INDEX "OperationsRun_userId_status_availableAt_idx" ON "OperationsRun"("userId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "OperationsRun_userId_createdAt_idx" ON "OperationsRun"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsObservation_runId_key" ON "OperationsObservation"("runId");

-- CreateIndex
CREATE INDEX "OperationsObservation_userId_domain_createdAt_idx" ON "OperationsObservation"("userId", "domain", "createdAt");

-- CreateIndex
CREATE INDEX "OperationsDecision_userId_status_createdAt_idx" ON "OperationsDecision"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsApproval_decisionId_key" ON "OperationsApproval"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsExecution_approvalId_key" ON "OperationsExecution"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsExecution_runId_key" ON "OperationsExecution"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsNotification_dedupeKey_key" ON "OperationsNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "OperationsNotification_userId_availableAt_idx" ON "OperationsNotification"("userId", "availableAt");

-- CreateIndex
CREATE INDEX "OperationsOutcome_userId_decisionId_idx" ON "OperationsOutcome"("userId", "decisionId");

-- CreateIndex
CREATE INDEX "OperationsCostReservation_userId_createdAt_idx" ON "OperationsCostReservation"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsCostReservation_runId_attempt_key" ON "OperationsCostReservation"("runId", "attempt");

-- AddForeignKey
ALTER TABLE "OperationsProfile" ADD CONSTRAINT "OperationsProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsSchedule" ADD CONSTRAINT "OperationsSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsRun" ADD CONSTRAINT "OperationsRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsObservation" ADD CONSTRAINT "OperationsObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsDecision" ADD CONSTRAINT "OperationsDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsApproval" ADD CONSTRAINT "OperationsApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsExecution" ADD CONSTRAINT "OperationsExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsNotification" ADD CONSTRAINT "OperationsNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsOutcome" ADD CONSTRAINT "OperationsOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsCostReservation" ADD CONSTRAINT "OperationsCostReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
