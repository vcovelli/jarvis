-- CreateTable
CREATE TABLE "MemoryState" (
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MemoryRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 2,
    "type" TEXT NOT NULL DEFAULT 'semantic',
    "domain" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "factKey" TEXT,
    "labels" TEXT[] DEFAULT ARRAY['private']::TEXT[],
    "assertion" TEXT NOT NULL DEFAULT 'user_stated',
    "confidenceKind" TEXT NOT NULL DEFAULT 'uncalibrated',
    "confidence" DOUBLE PRECISION,
    "extractionMethod" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'active',
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "supersededById" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sourceAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "embeddingVersion" TEXT,
    "embeddingDimension" INTEGER,
    "embeddingStatus" TEXT NOT NULL DEFAULT 'disabled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorySource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceAt" TIMESTAMP(3) NOT NULL,
    "reliability" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryCost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "reservedUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryRecord_userId_status_domain_sourceAt_idx" ON "MemoryRecord"("userId", "status", "domain", "sourceAt");

-- CreateIndex
CREATE INDEX "MemoryRecord_userId_factKey_status_idx" ON "MemoryRecord"("userId", "factKey", "status");

-- CreateIndex
CREATE INDEX "MemoryRecord_userId_domain_contentHash_idx" ON "MemoryRecord"("userId", "domain", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryRecord_userId_id_key" ON "MemoryRecord"("userId", "id");

-- CreateIndex
CREATE INDEX "MemorySource_userId_sourceType_sourceId_idx" ON "MemorySource"("userId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "MemorySource_memoryId_sourceType_sourceId_key" ON "MemorySource"("memoryId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "MemoryJob_status_availableAt_leaseUntil_idx" ON "MemoryJob"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "MemoryJob_userId_kind_status_idx" ON "MemoryJob"("userId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryJob_userId_dedupeKey_key" ON "MemoryJob"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "MemoryCost_userId_createdAt_idx" ON "MemoryCost"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryCost_jobId_attempt_key" ON "MemoryCost"("jobId", "attempt");

-- AddForeignKey
ALTER TABLE "MemoryState" ADD CONSTRAINT "MemoryState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_userId_memoryId_fkey" FOREIGN KEY ("userId", "memoryId") REFERENCES "MemoryRecord"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryJob" ADD CONSTRAINT "MemoryJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCost" ADD CONSTRAINT "MemoryCost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- PostgreSQL core full-text retrieval works without extensions. No CREATE EXTENSION.
ALTER TABLE "MemoryRecord" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS
  (setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', "content"), 'B')) STORED;
CREATE INDEX "MemoryRecord_searchVector_gin" ON "MemoryRecord" USING GIN ("searchVector") WHERE "status" = 'active';
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_status_check" CHECK ("status" IN ('active','superseded','deleted'));
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_type_check" CHECK ("type" IN ('semantic','episodic','working','procedural','reference'));
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_importance_check" CHECK ("importance" BETWEEN 1 AND 5);
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_embedding_check" CHECK (cardinality("embedding") = 0 OR ("embeddingDimension" = cardinality("embedding") AND "embeddingDimension" BETWEEN 1 AND 4096 AND "embeddingModel" IS NOT NULL AND "embeddingVersion" IS NOT NULL));
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_labels_check" CHECK (cardinality("labels") > 0 AND "labels" <@ ARRAY['private','finance','health','journal','infrastructure','work']::text[]);
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_superseded_owner_fkey" FOREIGN KEY ("userId", "supersededById") REFERENCES "MemoryRecord"("userId", "id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "MemoryJob" ADD CONSTRAINT "MemoryJob_kind_check" CHECK ("kind" IN ('extract','legacy','embed'));
ALTER TABLE "MemoryJob" ADD CONSTRAINT "MemoryJob_status_check" CHECK ("status" IN ('queued','running','succeeded','failed','cancelled'));
ALTER TABLE "MemoryJob" ADD CONSTRAINT "MemoryJob_attempts_check" CHECK ("attempts" BETWEEN 0 AND 3);
ALTER TABLE "MemoryCost" ADD CONSTRAINT "MemoryCost_reserved_check" CHECK ("reservedUsd" > 0 AND "reservedUsd" <= 0.05);
