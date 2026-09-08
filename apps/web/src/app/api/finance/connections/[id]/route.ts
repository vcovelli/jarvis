import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getAuthenticatedUserId, ownedWhere } from "@/lib/authBoundary";
import { writeAuditLog } from "@/lib/audit";
import { snapshotNetWorth } from "@/lib/finance/analytics";
import { prisma } from "@/lib/prisma";
import { removePlaidItem } from "@/lib/plaidRemoval";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = getAuthenticatedUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing connection id." }, { status: 400 });

  const connection = await prisma.financialConnection.findFirst({
    where: ownedWhere(userId, id),
    select: {
      id: true,
      provider: true,
      institutionName: true,
      accessTokenEncrypted: true,
    },
  });
  if (!connection) return NextResponse.json({ error: "Financial connection was not found." }, { status: 404 });

  const plaidRemoval = await removePlaidItem(connection.provider, connection.accessTokenEncrypted);
  const deleted = await prisma.$transaction(async (tx) => {
    const accountIds = (await tx.financialAccount.findMany({
      where: { userId, connectionId: connection.id },
      select: { id: true },
    })).map((account) => account.id);
    const transactionIds = (await tx.financialTransaction.findMany({
      where: { userId, connectionId: connection.id },
      select: { id: true },
    })).map((transaction) => transaction.id);

    const eventFilters: Prisma.FinancialEventWhereInput[] = [{ connectionId: connection.id }];
    const snapshotFilters: Prisma.FinancialAccountBalanceSnapshotWhereInput[] = [{ connectionId: connection.id }];
    const ruleFilters: Prisma.FinancialClassificationRuleWhereInput[] = [{ connectionId: connection.id }];

    if (accountIds.length) {
      eventFilters.push({ accountId: { in: accountIds } });
      snapshotFilters.push({ accountId: { in: accountIds } });
      ruleFilters.push({ accountId: { in: accountIds } });
    }
    if (transactionIds.length) {
      eventFilters.push({ transactionId: { in: transactionIds } });
    }

    const events = await tx.financialEvent.deleteMany({ where: { userId, OR: eventFilters } });
    const balanceSnapshots = await tx.financialAccountBalanceSnapshot.deleteMany({
      where: { userId, OR: snapshotFilters },
    });
    const rules = await tx.financialClassificationRule.deleteMany({ where: { userId, OR: ruleFilters } });

    await tx.financialConnection.delete({ where: { id: connection.id } });

    return {
      accounts: accountIds.length,
      transactions: transactionIds.length,
      events: events.count,
      balanceSnapshots: balanceSnapshots.count,
      classificationRules: rules.count,
    };
  });

  await snapshotNetWorth(userId, "sync");
  await writeAuditLog({
    action: "finance.plaid_connection_removed",
    userId,
    request,
    metadata: { connectionId: connection.id, provider: connection.provider, providerRevoked: plaidRemoval.removed, deleted },
  });

  return NextResponse.json({
    connectionId: connection.id,
    institutionName: connection.institutionName,
    plaid: plaidRemoval,
    deleted,
    updatedAt: Date.now(),
  });
}
