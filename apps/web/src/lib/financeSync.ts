import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { callPlaid } from "@/lib/plaid";
import { decryptSecret } from "@/lib/serverCrypto";

type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  type: string;
  subtype?: string | null;
  mask?: string | null;
  balances?: {
    current?: number | null;
    available?: number | null;
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  };
};

type PlaidAccountsResponse = {
  accounts?: PlaidAccount[];
};

type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  date: string;
  authorized_date?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  amount: number;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  category?: string[] | null;
  pending?: boolean | null;
  payment_channel?: string | null;
};

type PlaidRemovedTransaction = {
  transaction_id: string;
};

type PlaidTransactionsSyncResponse = {
  added?: PlaidTransaction[];
  modified?: PlaidTransaction[];
  removed?: PlaidRemovedTransaction[];
  next_cursor?: string;
  has_more?: boolean;
};

type PlaidHolding = {
  account_id: string;
  security_id?: string | null;
  quantity: number;
  institution_price?: number | null;
  institution_value?: number | null;
  cost_basis?: number | null;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
};

type PlaidSecurity = {
  security_id?: string | null;
  name?: string | null;
  ticker_symbol?: string | null;
};

type PlaidInvestmentsResponse = {
  holdings?: PlaidHolding[];
  securities?: PlaidSecurity[];
};

export type FinanceSyncResult = {
  connectionId: string;
  accounts: number;
  transactionsAddedOrUpdated: number;
  transactionsRemoved: number;
  holdings: number;
};

export async function syncAllFinancialConnections(userId: string) {
  const connections = await prisma.financialConnection.findMany({
    where: { userId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  const results: FinanceSyncResult[] = [];
  for (const connection of connections) {
    results.push(await syncFinancialConnection(userId, connection.id));
  }
  return results;
}

export async function syncFinancialConnection(userId: string, connectionId: string) {
  const connection = await prisma.financialConnection.findFirst({
    where: { id: connectionId, userId, status: "active" },
  });
  if (!connection) {
    throw new Error("Financial connection was not found.");
  }

  const accessToken = decryptSecret(connection.accessTokenEncrypted);
  const accountIdByProvider = await syncAccounts(userId, connection.id, accessToken);
  const transactions = connection.products.includes("transactions")
    ? await syncTransactions(userId, connection.id, accessToken, connection.cursor, accountIdByProvider)
    : { cursor: connection.cursor ?? undefined, upserted: 0, removed: 0 };
  const holdings = connection.products.includes("investments")
    ? await syncHoldings(userId, connection.id, accessToken, accountIdByProvider)
    : 0;

  await prisma.financialConnection.update({
    where: { id: connection.id },
    data: {
      cursor: transactions.cursor,
      lastSyncedAt: new Date(),
    },
  });

  return {
    connectionId: connection.id,
    accounts: accountIdByProvider.size,
    transactionsAddedOrUpdated: transactions.upserted,
    transactionsRemoved: transactions.removed,
    holdings,
  };
}

async function syncAccounts(userId: string, connectionId: string, accessToken: string) {
  const response = await callPlaid<PlaidAccountsResponse>("/accounts/get", {
    access_token: accessToken,
  });
  const accountIdByProvider = new Map<string, string>();

  for (const account of response.accounts ?? []) {
    const saved = await prisma.financialAccount.upsert({
      where: {
        connectionId_providerAccountId: {
          connectionId,
          providerAccountId: account.account_id,
        },
      },
      create: {
        userId,
        connectionId,
        providerAccountId: account.account_id,
        name: account.name,
        officialName: account.official_name ?? undefined,
        type: account.type,
        subtype: account.subtype ?? undefined,
        mask: account.mask ?? undefined,
        currentBalance: account.balances?.current ?? undefined,
        availableBalance: account.balances?.available ?? undefined,
        isoCurrencyCode: account.balances?.iso_currency_code ?? undefined,
        unofficialCurrencyCode: account.balances?.unofficial_currency_code ?? undefined,
      },
      update: {
        name: account.name,
        officialName: account.official_name ?? undefined,
        type: account.type,
        subtype: account.subtype ?? undefined,
        mask: account.mask ?? undefined,
        currentBalance: account.balances?.current ?? undefined,
        availableBalance: account.balances?.available ?? undefined,
        isoCurrencyCode: account.balances?.iso_currency_code ?? undefined,
        unofficialCurrencyCode: account.balances?.unofficial_currency_code ?? undefined,
      },
    });
    accountIdByProvider.set(account.account_id, saved.id);
  }

  return accountIdByProvider;
}

async function syncTransactions(
  userId: string,
  connectionId: string,
  accessToken: string,
  initialCursor: string | null,
  accountIdByProvider: Map<string, string>,
) {
  let cursor = initialCursor ?? undefined;
  let hasMore = true;
  let upserted = 0;
  let removed = 0;

  while (hasMore) {
    const response = await callPlaid<PlaidTransactionsSyncResponse>("/transactions/sync", {
      access_token: accessToken,
      cursor,
      count: 100,
    });

    for (const transaction of [...(response.added ?? []), ...(response.modified ?? [])]) {
      await upsertTransaction(userId, connectionId, transaction, accountIdByProvider);
      upserted += 1;
    }

    const removedIds = (response.removed ?? [])
      .map((transaction) => transaction.transaction_id)
      .filter(Boolean);
    if (removedIds.length) {
      const result = await prisma.financialTransaction.deleteMany({
        where: {
          connectionId,
          providerTransactionId: { in: removedIds },
        },
      });
      removed += result.count;
    }

    cursor = response.next_cursor ?? cursor;
    hasMore = response.has_more === true;
  }

  return { cursor, upserted, removed };
}

async function upsertTransaction(
  userId: string,
  connectionId: string,
  transaction: PlaidTransaction,
  accountIdByProvider: Map<string, string>,
) {
  const data = {
    userId,
    connectionId,
    accountId: accountIdByProvider.get(transaction.account_id),
    providerTransactionId: transaction.transaction_id,
    providerAccountId: transaction.account_id,
    date: parsePlaidDate(transaction.date) ?? new Date(),
    authorizedDate: parsePlaidDate(transaction.authorized_date),
    name: transaction.name ?? transaction.merchant_name ?? "Transaction",
    merchantName: transaction.merchant_name ?? undefined,
    amount: transaction.amount,
    isoCurrencyCode: transaction.iso_currency_code ?? undefined,
    unofficialCurrencyCode: transaction.unofficial_currency_code ?? undefined,
    category: transaction.category ?? [],
    pending: Boolean(transaction.pending),
    paymentChannel: transaction.payment_channel ?? undefined,
    raw: transaction as unknown as Prisma.InputJsonValue,
  };

  await prisma.financialTransaction.upsert({
    where: {
      connectionId_providerTransactionId: {
        connectionId,
        providerTransactionId: transaction.transaction_id,
      },
    },
    create: data,
    update: data,
  });
}

async function syncHoldings(
  userId: string,
  connectionId: string,
  accessToken: string,
  accountIdByProvider: Map<string, string>,
) {
  const response = await callPlaid<PlaidInvestmentsResponse>("/investments/holdings/get", {
    access_token: accessToken,
  });
  const securities = new Map(
    (response.securities ?? []).map((security) => [security.security_id, security]),
  );
  const holdings = response.holdings ?? [];

  await prisma.investmentHolding.deleteMany({ where: { connectionId } });
  if (!holdings.length) return 0;

  await prisma.investmentHolding.createMany({
    data: holdings.map((holding) => {
      const security = securities.get(holding.security_id);
      const holdingKey = `${holding.account_id}:${holding.security_id ?? security?.ticker_symbol ?? security?.name ?? "cash"}`;
      return {
        userId,
        connectionId,
        accountId: accountIdByProvider.get(holding.account_id),
        holdingKey,
        providerAccountId: holding.account_id,
        providerSecurityId: holding.security_id ?? undefined,
        securityName: security?.name ?? undefined,
        tickerSymbol: security?.ticker_symbol ?? undefined,
        quantity: holding.quantity,
        institutionPrice: holding.institution_price ?? undefined,
        institutionValue: holding.institution_value ?? undefined,
        costBasis: holding.cost_basis ?? undefined,
        isoCurrencyCode: holding.iso_currency_code ?? undefined,
        unofficialCurrencyCode: holding.unofficial_currency_code ?? undefined,
        raw: holding as unknown as Prisma.InputJsonValue,
      };
    }),
  });

  return holdings.length;
}

function parsePlaidDate(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
