-- AlterTable
ALTER TABLE "FinancialAccount" ADD COLUMN "canonicalRole" TEXT;
ALTER TABLE "FinancialAccount" ADD COLUMN "roleOverride" TEXT;

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN "pendingTransactionId" TEXT;
ALTER TABLE "FinancialTransaction" ADD COLUMN "personalFinanceCategoryPrimary" TEXT;
ALTER TABLE "FinancialTransaction" ADD COLUMN "personalFinanceCategoryDetailed" TEXT;
ALTER TABLE "FinancialTransaction" ADD COLUMN "personalFinanceCategoryConfidence" TEXT;

-- CreateTable
CREATE TABLE "FinancialEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'plaid_transaction',
    "sourceId" TEXT,
    "transactionId" TEXT,
    "connectionId" TEXT,
    "accountId" TEXT,
    "relatedEventId" TEXT,
    "transferGroupId" TEXT,
    "eventType" TEXT NOT NULL,
    "primaryCategory" TEXT NOT NULL,
    "subcategory" TEXT,
    "normalizedMerchant" TEXT,
    "displayName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "cashFlowAmount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "authorizedDate" TIMESTAMP(3),
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "countsAsIncome" BOOLEAN NOT NULL DEFAULT false,
    "countsAsSpend" BOOLEAN NOT NULL DEFAULT false,
    "countsAsSavings" BOOLEAN NOT NULL DEFAULT false,
    "countsAsInvestmentContribution" BOOLEAN NOT NULL DEFAULT false,
    "countsAsTransfer" BOOLEAN NOT NULL DEFAULT false,
    "internalTransfer" BOOLEAN NOT NULL DEFAULT false,
    "investmentIncome" BOOLEAN NOT NULL DEFAULT false,
    "affectsNetWorth" BOOLEAN NOT NULL DEFAULT true,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classificationSource" TEXT NOT NULL DEFAULT 'heuristic',
    "classificationReason" TEXT,
    "userReviewedAt" TIMESTAMP(3),
    "reviewedByRuleId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialClassificationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "matchType" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "matchValueNormalized" TEXT,
    "institutionId" TEXT,
    "connectionId" TEXT,
    "accountId" TEXT,
    "amount" DOUBLE PRECISION,
    "eventType" TEXT NOT NULL,
    "primaryCategory" TEXT NOT NULL,
    "subcategory" TEXT,
    "normalizedMerchant" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.98,
    "source" TEXT NOT NULL DEFAULT 'user_rule',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialClassificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualFinancialPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "isoCurrencyCode" TEXT,
    "valuationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valuationMethod" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "acquisitionCost" DOUBLE PRECISION,
    "acquisitionDate" TIMESTAMP(3),
    "linkedLiabilityId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualFinancialPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualFinancialPositionValuation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "valuationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valuationMethod" TEXT NOT NULL DEFAULT 'manual',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualFinancialPositionValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccountBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "accountId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "currentBalance" DOUBLE PRECISION,
    "availableBalance" DOUBLE PRECISION,
    "isoCurrencyCode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'sync',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAccountBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialNetWorthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "totalAssets" DOUBLE PRECISION NOT NULL,
    "totalLiabilities" DOUBLE PRECISION NOT NULL,
    "totalNetWorth" DOUBLE PRECISION NOT NULL,
    "liquidNetWorth" DOUBLE PRECISION NOT NULL,
    "cash" DOUBLE PRECISION NOT NULL,
    "investableAssets" DOUBLE PRECISION NOT NULL,
    "retirementAssets" DOUBLE PRECISION NOT NULL,
    "manualAssets" DOUBLE PRECISION NOT NULL,
    "propertyAssets" DOUBLE PRECISION NOT NULL,
    "vehicleAssets" DOUBLE PRECISION NOT NULL,
    "creditLiabilities" DOUBLE PRECISION NOT NULL,
    "loanLiabilities" DOUBLE PRECISION NOT NULL,
    "mortgageLiabilities" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'sync',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialNetWorthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_transactionId_key" ON "FinancialEvent"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_userId_source_sourceId_key" ON "FinancialEvent"("userId", "source", "sourceId");

-- CreateIndex
CREATE INDEX "FinancialEvent_userId_date_idx" ON "FinancialEvent"("userId", "date");

-- CreateIndex
CREATE INDEX "FinancialEvent_userId_eventType_date_idx" ON "FinancialEvent"("userId", "eventType", "date");

-- CreateIndex
CREATE INDEX "FinancialEvent_userId_transferGroupId_idx" ON "FinancialEvent"("userId", "transferGroupId");

-- CreateIndex
CREATE INDEX "FinancialEvent_userId_needsReview_idx" ON "FinancialEvent"("userId", "needsReview");

-- CreateIndex
CREATE INDEX "FinancialEvent_accountId_date_idx" ON "FinancialEvent"("accountId", "date");

-- CreateIndex
CREATE INDEX "FinancialClassificationRule_userId_enabled_priority_idx" ON "FinancialClassificationRule"("userId", "enabled", "priority");

-- CreateIndex
CREATE INDEX "FinancialClassificationRule_userId_matchType_idx" ON "FinancialClassificationRule"("userId", "matchType");

-- CreateIndex
CREATE INDEX "FinancialClassificationRule_accountId_idx" ON "FinancialClassificationRule"("accountId");

-- CreateIndex
CREATE INDEX "FinancialClassificationRule_connectionId_idx" ON "FinancialClassificationRule"("connectionId");

-- CreateIndex
CREATE INDEX "ManualFinancialPosition_userId_active_kind_type_idx" ON "ManualFinancialPosition"("userId", "active", "kind", "type");

-- CreateIndex
CREATE INDEX "ManualFinancialPosition_userId_role_idx" ON "ManualFinancialPosition"("userId", "role");

-- CreateIndex
CREATE INDEX "ManualFinancialPositionValuation_userId_valuationDate_idx" ON "ManualFinancialPositionValuation"("userId", "valuationDate");

-- CreateIndex
CREATE INDEX "ManualFinancialPositionValuation_positionId_valuationDate_idx" ON "ManualFinancialPositionValuation"("positionId", "valuationDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccountBalanceSnapshot_accountId_snapshotDate_key" ON "FinancialAccountBalanceSnapshot"("accountId", "snapshotDate");

-- CreateIndex
CREATE INDEX "FinancialAccountBalanceSnapshot_userId_snapshotDate_idx" ON "FinancialAccountBalanceSnapshot"("userId", "snapshotDate");

-- CreateIndex
CREATE INDEX "FinancialAccountBalanceSnapshot_connectionId_idx" ON "FinancialAccountBalanceSnapshot"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialNetWorthSnapshot_userId_snapshotDate_source_key" ON "FinancialNetWorthSnapshot"("userId", "snapshotDate", "source");

-- CreateIndex
CREATE INDEX "FinancialNetWorthSnapshot_userId_snapshotDate_idx" ON "FinancialNetWorthSnapshot"("userId", "snapshotDate");

-- CreateIndex
CREATE INDEX "FinancialTransaction_userId_pending_pendingTransactionId_idx" ON "FinancialTransaction"("userId", "pending", "pendingTransactionId");

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FinancialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialClassificationRule" ADD CONSTRAINT "FinancialClassificationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualFinancialPosition" ADD CONSTRAINT "ManualFinancialPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualFinancialPositionValuation" ADD CONSTRAINT "ManualFinancialPositionValuation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualFinancialPositionValuation" ADD CONSTRAINT "ManualFinancialPositionValuation_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ManualFinancialPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccountBalanceSnapshot" ADD CONSTRAINT "FinancialAccountBalanceSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccountBalanceSnapshot" ADD CONSTRAINT "FinancialAccountBalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccountBalanceSnapshot" ADD CONSTRAINT "FinancialAccountBalanceSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FinancialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialNetWorthSnapshot" ADD CONSTRAINT "FinancialNetWorthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
