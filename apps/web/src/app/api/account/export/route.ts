import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { getAuthenticatedUserId } from "@/lib/authBoundary";
import { sanitizePortableExport } from "@/lib/exportSecurity";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getAuthenticatedUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      userState: { select: { state: true, createdAt: true, updatedAt: true } },
      entitlement: { select: { tier: true, status: true, expiresAt: true, createdAt: true, updatedAt: true } },
      financialConnections: { select: { id: true, provider: true, institutionId: true, institutionName: true, products: true, status: true, lastSyncedAt: true, createdAt: true, updatedAt: true } },
      financialAccounts: true,
      financialTransactions: true,
      investmentHoldings: true,
      financialEvents: true,
      financialClassificationRules: true,
      manualFinancialPositions: { include: { valuations: true } },
      financialAccountBalanceSnapshots: true,
      financialNetWorthSnapshots: true,
      assistantConversations: { include: { messages: true } },
      assistantMemories: true,
      auditLogs: { orderBy: { createdAt: "desc" }, take: 500 },
    },
  });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const payload = sanitizePortableExport({
    format: "jarvis-user-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    user,
  });
  await writeAuditLog({ action: "account.data_exported", userId, request });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="jarvis-export-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
