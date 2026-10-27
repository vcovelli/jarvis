import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  assertAccess,
  classifyLabels,
  contentHash,
  extractUserStatement,
  MemoryError,
  safeText,
  validateCandidate,
  type Access,
  type Candidate,
} from "./policy.ts";
import { embeddingProvider } from "./embedding.ts";

export type Tx = Prisma.TransactionClient;
export const txOptions = { timeout: 10000, maxWait: 5000 };
export async function lockMemory(tx: Tx, userId: string) {
  await tx.memoryState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  await tx.$queryRaw`SELECT "userId" FROM "MemoryState" WHERE "userId" = ${userId} FOR UPDATE`;
}
export async function revise(tx: Tx, userId: string) {
  await tx.memoryState.update({
    where: { userId },
    data: { revision: { increment: 1 } },
  });
}
export async function audit(
  tx: Tx,
  userId: string,
  action: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.auditLog.create({
    data: { userId, action: `memory.${action}`, metadata },
  });
}
export type Source = {
  type: "user_message" | "legacy_memory" | "manual";
  id: string;
  at: Date;
  reliability: string;
};
async function verifySource(tx: Tx, userId: string, source: Source) {
  if (
    source.type === "user_message" &&
    !(await tx.assistantMessage.findFirst({
      where: { id: source.id, userId, role: "user", conversation: { userId } },
      select: { id: true },
    }))
  )
    throw new MemoryError("Source not found.", 404);
  if (
    source.type === "legacy_memory" &&
    !(await tx.assistantMemory.findFirst({
      where: { id: source.id, userId },
      select: { id: true },
    }))
  )
    throw new MemoryError("Source not found.", 404);
}
export async function enqueue(
  tx: Tx | PrismaClient,
  userId: string,
  kind: "extract" | "embed" | "legacy",
  sourceId: string,
  version = "v2",
) {
  const dedupeKey = `${kind}:${sourceId}:${version}`;
  const existing = await tx.memoryJob.findUnique({
    where: { userId_dedupeKey: { userId, dedupeKey } },
  });
  if (existing) return existing;
  if (
    (await tx.memoryJob.count({
      where: { userId, status: { in: ["queued", "running"] } },
    })) >= 1000
  ) {
    await audit(tx, userId, "queue_full", { kind, sourceId });
    return null;
  }
  return tx.memoryJob.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey } },
    create: { userId, kind, sourceId, dedupeKey },
    update: {},
  });
}
export async function queueEmbedding(tx: Tx, userId: string, id: string) {
  let provider;
  try {
    provider = embeddingProvider();
  } catch {
    return;
  }
  if (!provider) return;
  const job = await enqueue(
    tx,
    userId,
    "embed",
    id,
    `${provider.model}:${provider.version}:${provider.dimension}`,
  );
  await tx.memoryRecord.updateMany({
    where: { userId, id, status: "active" },
    data: { embeddingStatus: job ? "pending" : "queue_full" },
  });
}
// Called under the user's MemoryState lock. Provenance is checked before writing.
export async function consolidate(
  tx: Tx,
  userId: string,
  input: Candidate,
  source: Source,
  correctId?: string,
) {
  const c = validateCandidate(input);
  await verifySource(tx, userId, source);
  let target = null;
  if (correctId) {
    target = await tx.memoryRecord.findFirst({
      where: { id: correctId, userId, status: "active" },
    });
    if (!target) throw new MemoryError("Memory not found.", 404);
    c.domain = target.domain;
    c.factKey = target.factKey ?? `manual:${target.id}`;
  }
  const hash = contentHash(c.content);
  const duplicate = await tx.memoryRecord.findFirst({
    where: { userId, domain: c.domain, contentHash: hash },
    orderBy: { createdAt: "desc" },
  });
  if (duplicate && !correctId) {
    // Tombstones and superseded evidence cannot be resurrected by replay/backfill.
    if (duplicate.status === "active") {
      await tx.memorySource.upsert({
        where: {
          memoryId_sourceType_sourceId: {
            memoryId: duplicate.id,
            sourceType: source.type,
            sourceId: source.id,
          },
        },
        create: {
          userId,
          memoryId: duplicate.id,
          sourceType: source.type,
          sourceId: source.id,
          sourceAt: source.at,
          reliability: source.reliability,
        },
        update: {},
      });
      await revise(tx, userId);
    }
    await audit(tx, userId, "duplicate", {
      memoryId: duplicate.id,
      sourceId: source.id,
    });
    return duplicate;
  }
  const related = c.factKey
    ? await tx.memoryRecord.findMany({
        where: {
          userId,
          domain: c.domain,
          factKey: c.factKey,
          status: "active",
        },
        orderBy: [{ sourceAt: "desc" }, { id: "asc" }],
        take: 30,
      })
    : [];
  if (target && !related.some((r) => r.id === target.id)) related.push(target);
  const correction = Boolean(correctId) || c.correction;
  // Historical imports cannot replace a more recent plan. Ambiguous changes require review.
  const newer = related.find((r) => r.sourceAt > source.at);
  const newerCorrection = related.find(
    (r) =>
      r.sourceAt > source.at &&
      (r.extractionMethod === "user-confirmed" ||
        extractUserStatement(r.content, r.domain).some((c) => c.correction)),
  );
  const maySupersede = correction && !newer && c.assertion === "user_stated";
  const conflict = related.length > 0 && !maySupersede && !newerCorrection;
  const record = await tx.memoryRecord.create({
    data: {
      userId,
      type: c.type,
      domain: c.domain,
      title: c.title,
      content: c.content,
      contentHash: hash,
      factKey: c.factKey,
      labels: classifyLabels(c.domain, `${c.title} ${c.content}`),
      assertion: c.assertion,
      confidenceKind:
        c.assertion === "user_stated"
          ? "user_statement_not_probability"
          : "uncalibrated",
      extractionMethod: c.extractionMethod,
      importance: c.importance,
      conflict,
      ...(newerCorrection
        ? {
            status: "superseded",
            supersededById: newerCorrection.id,
            validUntil: newerCorrection.sourceAt,
          }
        : {}),
      sourceAt: source.at,
      effectiveAt: source.at,
      expiresAt:
        c.type === "working" ? new Date(+source.at + 7 * 86400000) : null,
      sources: {
        create: {
          sourceType: source.type,
          sourceId: source.id,
          sourceAt: source.at,
          reliability: source.reliability,
        },
      },
    },
  });
  if (related.length && !newerCorrection) {
    await tx.memoryRecord.updateMany({
      where: { userId, id: { in: related.map((r) => r.id) } },
      data: maySupersede
        ? {
            status: "superseded",
            supersededById: record.id,
            validUntil: source.at,
            conflict: false,
            embedding: [],
            embeddingStatus: "disabled",
          }
        : { conflict: true },
    });
  }
  if (!newerCorrection) await queueEmbedding(tx, userId, record.id);
  await revise(tx, userId);
  await audit(
    tx,
    userId,
    maySupersede ? "corrected" : conflict ? "conflict" : "created",
    {
      memoryId: record.id,
      sourceId: source.id,
      previousIds: related.map((r) => r.id),
    },
  );
  return record;
}
export async function saveManual(
  db: PrismaClient,
  access: Access,
  value: {
    title: unknown;
    content: unknown;
    domain: unknown;
    correctId?: string;
  },
) {
  assertAccess(access, true);
  const title = safeText(value.title, 120),
    content = safeText(value.content);
  return db.$transaction(async (tx) => {
    await lockMemory(tx, access.userId);
    const existing = value.correctId
      ? await tx.memoryRecord.findFirst({
          where: {
            id: value.correctId,
            userId: access.userId,
            status: "active",
          },
        })
      : null;
    if (value.correctId && !existing)
      throw new MemoryError("Memory not found.", 404);
    return consolidate(
      tx,
      access.userId,
      {
        type: (existing?.type as Candidate["type"]) ?? "semantic",
        domain: existing?.domain ?? String(value.domain),
        title,
        content,
        factKey: existing?.factKey ?? `manual:${contentHash(title)}`,
        assertion: "user_stated",
        extractionMethod: "user-confirmed",
        importance: 4,
        correction: Boolean(value.correctId),
      },
      {
        type: "manual",
        id: randomUUID(),
        at: new Date(),
        reliability: "user_confirmed",
      },
      value.correctId,
    );
  }, txOptions);
}
export async function deleteMemory(
  db: PrismaClient,
  access: Access,
  id: string,
) {
  assertAccess(access, true);
  return db.$transaction(async (tx) => {
    await lockMemory(tx, access.userId);
    const found = await tx.memoryRecord.findFirst({
      where: { id, userId: access.userId, status: { not: "deleted" } },
      include: { sources: true },
    });
    if (!found) throw new MemoryError("Memory not found.", 404);
    await tx.memoryRecord.update({
      where: { id },
      data: {
        status: "deleted",
        title: "Deleted saved memory",
        content: "",
        embedding: [],
        embeddingStatus: "disabled",
        conflict: false,
      },
    });
    await tx.memoryJob.updateMany({
      where: {
        userId: access.userId,
        kind: "embed",
        sourceId: id,
        status: { in: ["queued", "running"] },
      },
      data: { status: "cancelled", leaseToken: null, leaseUntil: null },
    });
    await revise(tx, access.userId);
    await audit(tx, access.userId, "deleted", { memoryId: id });
    return { deleted: true, originalSourcePreserved: true };
  }, txOptions);
}
