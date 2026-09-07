import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

export async function acquireJobLease(id: string, durationMs: number) {
  const runId = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + durationMs);
  try {
    await prisma.jobLease.create({ data: { id, runId, lockedUntil } });
    return { id, runId, lockedUntil };
  } catch {
    const claimed = await prisma.jobLease.updateMany({
      where: { id, lockedUntil: { lte: now } },
      data: { runId, lockedUntil },
    });
    return claimed.count === 1 ? { id, runId, lockedUntil } : null;
  }
}

export async function releaseJobLease(lease: { id: string; runId: string }) {
  await prisma.jobLease.deleteMany({ where: { id: lease.id, runId: lease.runId } });
}
