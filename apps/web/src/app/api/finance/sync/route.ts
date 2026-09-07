import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { getAuthenticatedUserId } from "@/lib/authBoundary";
import { FinanceSyncInProgressError, syncAllFinancialConnections, syncFinancialConnection } from "@/lib/financeSync";
import { PlaidApiError, PlaidConfigError } from "@/lib/plaid";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getAuthenticatedUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(request, "financeSync", userId);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : undefined;
  await writeAuditLog({ action: "finance.sync_started", userId, request, metadata: { connectionId, scope: connectionId ? "connection" : "user" } });
  try {
    const results = connectionId
      ? [await syncFinancialConnection(userId, connectionId)]
      : await syncAllFinancialConnections(userId);
    await writeAuditLog({ action: "finance.sync_completed", userId, request, metadata: { connectionId, connections: results.length } });
    return NextResponse.json({ results, updatedAt: Date.now() });
  } catch (error) {
    const status = error instanceof PlaidConfigError || error instanceof PlaidApiError || error instanceof FinanceSyncInProgressError ? error.status : 500;
    const message = error instanceof FinanceSyncInProgressError
      ? error.message
      : error instanceof PlaidConfigError
        ? "Finance sync is not configured on this server."
        : error instanceof PlaidApiError
          ? "The finance provider could not complete the sync."
          : "Finance sync failed.";
    console.error("[finance] sync_failed", { userId, connectionId, status, errorType: error instanceof Error ? error.name : "UnknownError" });
    await writeAuditLog({ action: "finance.sync_failed", outcome: "failure", userId, request, metadata: { connectionId, status } });
    return NextResponse.json({ error: message }, { status });
  }
}
