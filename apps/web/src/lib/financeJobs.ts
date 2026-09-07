import { writeAuditLog } from "@/lib/audit";
import { syncFinancialConnection } from "@/lib/financeSync";
import { acquireJobLease, releaseJobLease } from "@/lib/jobLease";
import { prisma } from "@/lib/prisma";

export async function runScheduledFinanceSync() {
  const lease = await acquireJobLease("finance-sync-all", 30 * 60_000);
  if (!lease) return { started: false as const, reason: "already_running" as const, results: [] };
  try {
    const connections = await prisma.financialConnection.findMany({
      where: { status: "active", provider: "plaid" },
      select: { id: true, userId: true },
      orderBy: { createdAt: "asc" },
    });
    const results: Array<{ connectionId: string; userId: string; ok: boolean; error?: string }> = [];
    for (const connection of connections) {
      try {
        await syncFinancialConnection(connection.userId, connection.id);
        results.push({ connectionId: connection.id, userId: connection.userId, ok: true });
        await writeAuditLog({ action: "finance.scheduled_sync_completed", userId: connection.userId, metadata: { connectionId: connection.id } });
      } catch (error) {
        const errorType = error instanceof Error ? error.name : "UnknownError";
        console.error("[jobs] finance_connection_sync_failed", { connectionId: connection.id, userId: connection.userId, errorType });
        results.push({ connectionId: connection.id, userId: connection.userId, ok: false, error: "sync_failed" });
        await writeAuditLog({ action: "finance.scheduled_sync_failed", outcome: "failure", userId: connection.userId, metadata: { connectionId: connection.id } });
      }
    }
    return { started: true as const, results };
  } finally {
    await releaseJobLease(lease);
  }
}
