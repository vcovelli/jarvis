import "server-only";
import { prisma } from "@/lib/prisma";
import { LAST_ACTIVE_INTERVAL_MS, needsActivityUpdate } from "@/lib/admin/policy";
export async function recordUserActivity(userId: string, lastActiveAt: Date | null) {
  const now = new Date();
  if (!needsActivityUpdate(lastActiveAt, now)) return;
  try {
    // A conditional update also bounds writes across multiple application workers.
    await prisma.user.updateMany({ where: { id: userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lte: new Date(now.getTime() - LAST_ACTIVE_INTERVAL_MS) } }] }, data: { lastActiveAt: now } });
  } catch { /* Activity telemetry must not interrupt authentication. */ }
}
