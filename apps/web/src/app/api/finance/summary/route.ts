import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlaidSetup } from "@/lib/plaid";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = getPlaidSetup();
  const [connections, accounts, transactions, holdings] = await Promise.all([
    prisma.financialConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        institutionName: true,
        products: true,
        status: true,
        lastSyncedAt: true,
        createdAt: true,
      },
    }),
    prisma.financialAccount.findMany({
      where: { userId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: {
        id: true,
        connectionId: true,
        name: true,
        officialName: true,
        type: true,
        subtype: true,
        mask: true,
        currentBalance: true,
        availableBalance: true,
        isoCurrencyCode: true,
        unofficialCurrencyCode: true,
        updatedAt: true,
      },
    }),
    prisma.financialTransaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 80,
      select: {
        id: true,
        accountId: true,
        date: true,
        name: true,
        merchantName: true,
        amount: true,
        category: true,
        pending: true,
        isoCurrencyCode: true,
      },
    }),
    prisma.investmentHolding.findMany({
      where: { userId },
      orderBy: [{ institutionValue: "desc" }, { securityName: "asc" }],
      take: 80,
      select: {
        id: true,
        accountId: true,
        securityName: true,
        tickerSymbol: true,
        quantity: true,
        institutionPrice: true,
        institutionValue: true,
        costBasis: true,
        isoCurrencyCode: true,
        updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    setup,
    connections,
    accounts,
    transactions,
    holdings,
    updatedAt: Date.now(),
  });
}
