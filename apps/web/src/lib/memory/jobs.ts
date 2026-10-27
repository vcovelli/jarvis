import { randomUUID } from "node:crypto";
import { type PrismaClient, type MemoryJob } from "@prisma/client";
import {
  allowedDisclosure,
  embeddingProvider,
  validateVector,
  type EmbeddingProvider,
} from "./embedding.ts";
import {
  classifyLabels,
  extractUserStatement,
  hasSecrets,
  type Candidate,
} from "./policy.ts";
import {
  audit,
  consolidate,
  lockMemory,
  revise,
  txOptions,
  type Tx,
} from "./store.ts";

export const LEASE_MS = 30000,
  MAX_ATTEMPTS = 3;
async function claim(db: PrismaClient, userId: string) {
  return db.$transaction(async (tx) => {
    await lockMemory(tx, userId);
    const stale = await tx.memoryJob.findMany({
      where: { userId, status: "running", leaseUntil: { lte: new Date() } },
      take: 20,
    });
    for (const job of stale)
      await tx.memoryJob.update({
        where: { id: job.id },
        data: {
          status: job.attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          leaseToken: null,
          leaseUntil: null,
          errorCode: "lease_expired",
        },
      });
    // One live worker per owner also serializes re-embedding across model changes.
    if (
      await tx.memoryJob.count({
        where: { userId, status: "running", leaseUntil: { gt: new Date() } },
      })
    )
      return null;
    const job = await tx.memoryJob.findFirst({
      where: {
        userId,
        status: "queued",
        attempts: { lt: MAX_ATTEMPTS },
        availableAt: { lte: new Date() },
      },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    });
    if (!job) return null;
    const running = await tx.memoryJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        attempts: { increment: 1 },
        leaseToken: randomUUID(),
        leaseUntil: new Date(Date.now() + LEASE_MS),
        errorCode: null,
      },
    });
    await audit(tx, userId, "job_started", {
      jobId: job.id,
      kind: job.kind,
      attempt: running.attempts,
    });
    return running;
  }, txOptions);
}
async function fenced(tx: Tx, job: MemoryJob) {
  const current = await tx.memoryJob.findFirst({
    where: {
      id: job.id,
      userId: job.userId,
      status: "running",
      leaseToken: job.leaseToken,
      leaseUntil: { gt: new Date() },
    },
  });
  return Boolean(current);
}
async function reserve(
  db: PrismaClient,
  job: MemoryJob,
  provider: EmbeddingProvider,
  text: string,
) {
  if (provider.kind !== "hosted") return;
  const usd =
    (Buffer.byteLength(text, "utf8") * provider.usdPerMillion) / 1000000;
  await db.$transaction(async (tx) => {
    await lockMemory(tx, job.userId);
    if (!(await fenced(tx, job))) throw new Error("lease_lost");
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const total = await tx.memoryCost.aggregate({
      where: { userId: job.userId, createdAt: { gte: day } },
      _sum: { reservedUsd: true },
    });
    if (
      !(usd > 0) ||
      usd > 0.05 ||
      (total._sum.reservedUsd ?? 0) + usd > provider.dailyUsd
    )
      throw new Error("budget_blocked");
    await tx.memoryCost.create({
      data: {
        userId: job.userId,
        jobId: job.id,
        attempt: job.attempts,
        reservedUsd: usd,
      },
    });
  }, txOptions);
}
export async function runMemoryJob(
  db: PrismaClient,
  userId: string,
  providerFactory: () => EmbeddingProvider | null = embeddingProvider,
) {
  const job = await claim(db, userId);
  if (!job) return false;
  try {
    let vectors:
      | { values: number[]; provider: EmbeddingProvider; hash: string }
      | undefined;
    let embeddingStatus = "disabled";
    if (job.kind === "embed") {
      const memory = await db.memoryRecord.findFirst({
        where: {
          id: job.sourceId,
          userId,
          status: "active",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      const provider = providerFactory();
      if (memory && provider) {
        const identity = `embed:${memory.id}:${provider.model}:${provider.version}:${provider.dimension}`;
        if (identity !== job.dedupeKey) embeddingStatus = "stale";
        else if (!allowedDisclosure(provider, memory.labels, memory.content))
          embeddingStatus = "policy_blocked";
        else {
          await reserve(db, job, provider, memory.content);
          const values = validateVector(
            await provider.embed(memory.content),
            provider.dimension,
          );
          vectors = { values, provider, hash: memory.contentHash };
          embeddingStatus = "ready";
        }
      }
    }
    await db.$transaction(async (tx) => {
      await lockMemory(tx, userId);
      if (!(await fenced(tx, job))) return;
      if (job.kind === "extract") {
        const message = await tx.assistantMessage.findFirst({
          where: {
            id: job.sourceId,
            userId,
            role: "user",
            conversation: { userId },
          },
          include: { conversation: { select: { domain: true } } },
        });
        if (message)
          for (const candidate of extractUserStatement(
            message.content,
            message.conversation.domain,
          ))
            await consolidate(tx, userId, candidate, {
              type: "user_message",
              id: message.id,
              at: message.createdAt,
              reliability: "user_stated",
            });
      } else if (job.kind === "legacy") {
        const original = await tx.assistantMemory.findFirst({
          where: { id: job.sourceId, userId },
        });
        const imported = await tx.memorySource.count({
          where: {
            userId,
            sourceType: "legacy_memory",
            sourceId: job.sourceId,
          },
        });
        if (
          original &&
          !imported &&
          !hasSecrets(`${original.key} ${original.value}`)
        ) {
          const manual = original.source === "manual";
          const candidate: Candidate = {
            type: "semantic",
            domain: original.domain,
            title: original.key,
            content: original.value,
            factKey: `legacy:${original.key}`,
            assertion: manual ? "user_stated" : "unverified",
            extractionMethod: "legacy-import-v2",
            importance: manual ? 3 : 1,
            correction: false,
          };
          await consolidate(tx, userId, candidate, {
            type: "legacy_memory",
            id: original.id,
            at: original.updatedAt,
            reliability: manual
              ? "user_confirmed"
              : "generated_summary_unverified",
          });
        }
      } else if (job.kind === "embed" && embeddingStatus !== "stale") {
        await tx.memoryRecord.updateMany({
          where: {
            id: job.sourceId,
            userId,
            status: "active",
            ...(vectors ? { contentHash: vectors.hash } : {}),
          },
          data: {
            embeddingStatus,
            ...(vectors
              ? {
                  embedding: vectors.values,
                  embeddingModel: vectors.provider.model,
                  embeddingVersion: vectors.provider.version,
                  embeddingDimension: vectors.provider.dimension,
                }
              : { embedding: [] }),
          },
        });
        await revise(tx, userId);
      } else if (job.kind !== "embed") throw new Error("invalid_job_kind");
      await tx.memoryJob.update({
        where: { id: job.id },
        data: { status: "succeeded", leaseToken: null, leaseUntil: null },
      });
      await audit(tx, userId, "job_completed", {
        jobId: job.id,
        kind: job.kind,
        embeddingStatus,
      });
    }, txOptions);
  } catch (error) {
    const permitted = [
      "budget_blocked",
      "lease_lost",
      "invalid_job_kind",
      "invalid_embedding",
      "embedding_content_rejected",
    ];
    const errorCode =
      error instanceof Error && permitted.includes(error.message)
        ? error.message
        : "processing_failed";
    await db.$transaction(async (tx) => {
      await lockMemory(tx, userId);
      if (!(await fenced(tx, job))) return;
      await tx.memoryJob.update({
        where: { id: job.id },
        data: {
          status:
            job.attempts >= MAX_ATTEMPTS || errorCode === "budget_blocked"
              ? "failed"
              : "queued",
          errorCode,
          availableAt: new Date(Date.now() + 1000 * 2 ** job.attempts),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (job.kind === "embed")
        await tx.memoryRecord.updateMany({
          where: { userId, id: job.sourceId, status: "active" },
          data: { embeddingStatus: "failed" },
        });
      await audit(tx, userId, "job_failed", {
        jobId: job.id,
        kind: job.kind,
        errorCode,
      });
    }, txOptions);
  }
  return true;
}
export async function diagnostics(db: PrismaClient, userId: string) {
  const [types, statuses, coverage, jobs, costs, recent, duplicates] =
    await Promise.all([
      db.memoryRecord.groupBy({
        by: ["type"],
        where: { userId },
        _count: true,
      }),
      db.memoryRecord.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
      }),
      db.memoryRecord.groupBy({
        by: ["embeddingStatus"],
        where: { userId, status: "active" },
        _count: true,
      }),
      db.memoryJob.groupBy({
        by: ["kind", "status"],
        where: { userId },
        _count: true,
      }),
      db.memoryCost.aggregate({
        where: { userId },
        _sum: { reservedUsd: true },
      }),
      db.auditLog.findMany({
        where: {
          userId,
          action: { in: ["memory.retrieved", "memory.context"] },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { action: true, createdAt: true, metadata: true },
      }),
      db.auditLog.count({ where: { userId, action: "memory.duplicate" } }),
    ]);
  const retrievals = recent
    .filter((r) => r.action === "memory.retrieved")
    .map((r) => r.metadata as { cacheHit?: boolean; latencyMs?: number });
  const contexts = recent
    .filter((r) => r.action === "memory.context")
    .map((r) => r.metadata as { tokenEstimate?: number });
  const metrics = {
    sampleCount: retrievals.length,
    cacheHitRate: retrievals.length
      ? retrievals.filter((r) => r.cacheHit).length / retrievals.length
      : null,
    meanRetrievalMs: retrievals.length
      ? retrievals.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) /
        retrievals.length
      : null,
    maxContextTokenEstimate: contexts.length
      ? Math.max(...contexts.map((c) => c.tokenEstimate ?? 0))
      : null,
  };
  return {
    total: types.reduce((sum, t) => sum + t._count, 0),
    metrics,
    types,
    statuses,
    coverage,
    jobs,
    reservedUsd: costs._sum.reservedUsd ?? 0,
    duplicates,
    recent,
    evaluation:
      "Run npm run test:memory:integration on an isolated database; retrieval metrics do not measure answer accuracy.",
  };
}
// Server-only entry point for future workers. No request-supplied agent identity is trusted.
export async function verifiedRunAgent(
  db: PrismaClient,
  userId: string,
  runId: string,
) {
  const run = await db.operationsRun.findFirst({
    where: {
      id: runId,
      userId,
      status: "running",
      leaseUntil: { gt: new Date() },
    },
    select: { domain: true },
  });
  const entitlement = await db.entitlement.findUnique({ where: { userId } });
  const profile = await db.operationsProfile.findUnique({
    where: { userId },
    select: { enabled: true, paused: true },
  });
  if (
    !run ||
    !profile?.enabled ||
    profile.paused ||
    !entitlement ||
    !["OWNER", "ADMIN"].includes(entitlement.tier) ||
    entitlement.status !== "active" ||
    (entitlement.expiresAt && entitlement.expiresAt <= new Date())
  )
    throw new Error("agent_not_authorized");
  return run.domain === "finance"
    ? "financial-analyst"
    : run.domain === "infrastructure"
      ? "infrastructure-monitor"
      : run.domain === "security"
        ? "security-analyst"
        : "executive-planner";
}
// Keep category classification visible to tests without model calls.
export { classifyLabels };
