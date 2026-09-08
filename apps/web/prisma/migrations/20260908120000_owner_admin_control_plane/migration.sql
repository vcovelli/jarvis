-- Additive defaults preserve users and keep rollout independent of entitlement.
CREATE TYPE "RolloutLevel" AS ENUM ('STABLE', 'BETA', 'EXPERIMENTAL');
CREATE TYPE "FeatureStage" AS ENUM ('STABLE', 'BETA', 'EXPERIMENTAL', 'OFF');
ALTER TABLE "User" ADD COLUMN "rolloutLevel" "RolloutLevel" NOT NULL DEFAULT 'STABLE',
                   ADD COLUMN "lastActiveAt" TIMESTAMP(3);
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");
CREATE INDEX "User_rolloutLevel_idx" ON "User"("rolloutLevel");
CREATE TABLE "FeatureFlag" (
  "key" TEXT NOT NULL,
  "stage" "FeatureStage" NOT NULL DEFAULT 'OFF',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);
-- Retain operational history when its actor deletes an account.
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- OWNER uses the existing Entitlement.tier string. No automatic privilege grants.
