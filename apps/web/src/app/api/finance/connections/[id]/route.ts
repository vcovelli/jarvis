import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { snapshotNetWorth } from "@/lib/finance/analytics";
import { callPlaid } from "@/lib/plaid";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/serverCrypto";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type PlaidRemovalResult = {
  attempted: boolean;
  removed: boolean;
  warning: string | null;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing connection id." }, { status: 400 });

  const connection = await prisma.financialConnection.findFirst({
    where: { id, userId },
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

  return NextResponse.json({
    connectionId: connection.id,
    institutionName: connection.institutionName,
    plaid: plaidRemoval,
    deleted,
    updatedAt: Date.now(),
  });
}

async function removePlaidItem(provider: string, accessTokenEncrypted: string): Promise<PlaidRemovalResult> {
  if (provider !== "plaid") return { attempted: false, removed: false, warning: null };

  try {
    await callPlaid("/item/remove", { access_token: decryptSecret(accessTokenEncrypted) });
    return { attempted: true, removed: true, warning: null };
  } catch (error) {
    return {
      attempted: true,
      removed: false,
      warning: error instanceof Error ? error.message : "Plaid item removal failed.",
    };
  }
}
