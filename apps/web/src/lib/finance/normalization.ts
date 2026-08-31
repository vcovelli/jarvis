import "server-only";

import type { FinancialClassificationRule, Prisma } from "@prisma/client";

import {
  buildEventFlags,
  classifyTransaction,
  getDefaultCategoryForEventType,
  inferAccountRole,
  isInvestmentRole,
  normalizeMerchantName,
} from "@/lib/finance/classification";
import { prisma } from "@/lib/prisma";

export type NormalizeFinancialTransactionsOptions = {
  connectionId?: string;
  transactionIds?: string[];
  includeReviewed?: boolean;
  all?: boolean;
  limit?: number;
};

const TRANSACTION_INCLUDE = {
  account: true,
  connection: true,
  financialEvent: true,
} satisfies Prisma.FinancialTransactionInclude;

type TransactionWithContext = Prisma.FinancialTransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;
type EventWithTransferContext = Prisma.FinancialEventGetPayload<{
  include: {
    account: true;
    transaction: { select: { pendingTransactionId: true } };
  };
}>;

export async function normalizeFinancialTransactions(
  userId: string,
  options: NormalizeFinancialTransactionsOptions = {},
) {
  const transactionIds = Array.from(new Set((options.transactionIds ?? []).filter(Boolean)));
  const where = buildTransactionWhere(userId, options, transactionIds);
  const [transactions, rules] = await Promise.all([
    prisma.financialTransaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: { date: "asc" },
      take: options.limit,
    }),
    prisma.financialClassificationRule.findMany({
      where: { userId, enabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const normalizedEventIds: string[] = [];
  for (const transaction of transactions) {
    if (transaction.financialEvent?.userReviewedAt && options.includeReviewed !== true) {
      const preserved = await preserveReviewedEvent(transaction);
      normalizedEventIds.push(preserved.id);
      continue;
    }
    const event = await upsertCanonicalEvent(transaction, rules);
    normalizedEventIds.push(event.id);
  }

  const transferMatches = normalizedEventIds.length
    ? await matchFinancialTransfers(userId, normalizedEventIds)
    : 0;

  return {
    transactions: transactions.length,
    events: normalizedEventIds.length,
    transferMatches,
  };
}

export async function snapshotAccountBalances(userId: string, connectionId?: string, accountIds?: string[]) {
  const where: Prisma.FinancialAccountWhereInput = { userId };
  if (connectionId) where.connectionId = connectionId;
  if (accountIds?.length) where.id = { in: accountIds };

  const accounts = await prisma.financialAccount.findMany({ where });
  const snapshotDate = startOfUtcDay(new Date());
  for (const account of accounts) {
    await prisma.financialAccountBalanceSnapshot.upsert({
      where: { accountId_snapshotDate: { accountId: account.id, snapshotDate } },
      create: {
        userId,
        connectionId: account.connectionId,
        accountId: account.id,
        snapshotDate,
        currentBalance: account.currentBalance,
        availableBalance: account.availableBalance,
        isoCurrencyCode: account.isoCurrencyCode,
      },
      update: {
        connectionId: account.connectionId,
        currentBalance: account.currentBalance,
        availableBalance: account.availableBalance,
        isoCurrencyCode: account.isoCurrencyCode,
      },
    });
  }
  return accounts.length;
}

async function upsertCanonicalEvent(
  transaction: TransactionWithContext,
  rules: FinancialClassificationRule[],
) {
  const accountRole = inferAccountRole(transaction.account);
  const classification = classifyTransaction(transaction, {
    account: transaction.account,
    connection: transaction.connection,
    rules,
  });
  const metadata = toJsonObject({
    ...classification.metadata,
    providerAccountId: transaction.providerAccountId,
    providerTransactionId: transaction.providerTransactionId,
    pendingTransactionId: transaction.pendingTransactionId,
    paymentChannel: transaction.paymentChannel,
    plaidCategory: transaction.category,
    plaidPersonalFinanceCategory: {
      primary: transaction.personalFinanceCategoryPrimary,
      detailed: transaction.personalFinanceCategoryDetailed,
      confidence: transaction.personalFinanceCategoryConfidence,
    },
    accountRole,
  });

  const data = {
    userId: transaction.userId,
    source: "plaid_transaction",
    sourceId: transaction.providerTransactionId,
    transactionId: transaction.id,
    connectionId: transaction.connectionId,
    accountId: transaction.accountId,
    relatedEventId: null,
    transferGroupId: null,
    eventType: classification.eventType,
    primaryCategory: classification.primaryCategory,
    subcategory: classification.subcategory,
    normalizedMerchant: classification.normalizedMerchant,
    displayName: classification.displayName,
    amount: classification.amount,
    cashFlowAmount: classification.cashFlowAmount,
    date: transaction.date,
    authorizedDate: transaction.authorizedDate,
    pending: transaction.pending,
    countsAsIncome: classification.countsAsIncome,
    countsAsSpend: classification.countsAsSpend,
    countsAsSavings: classification.countsAsSavings,
    countsAsInvestmentContribution: classification.countsAsInvestmentContribution,
    countsAsTransfer: classification.countsAsTransfer,
    internalTransfer: classification.internalTransfer,
    investmentIncome: classification.investmentIncome,
    affectsNetWorth: classification.affectsNetWorth,
    needsReview: classification.needsReview,
    confidence: classification.confidence,
    classificationSource: classification.classificationSource,
    classificationReason: classification.classificationReason,
    reviewedByRuleId: classification.reviewedByRuleId,
    metadata: metadata as Prisma.InputJsonValue,
  };

  return prisma.financialEvent.upsert({
    where: { transactionId: transaction.id },
    create: data,
    update: data,
  });
}

async function preserveReviewedEvent(transaction: TransactionWithContext) {
  const existing = transaction.financialEvent;
  if (!existing) return upsertCanonicalEvent(transaction, []);
  const flags = buildEventFlags(existing.eventType, transaction.amount);
  return prisma.financialEvent.update({
    where: { id: existing.id },
    data: {
      sourceId: transaction.providerTransactionId,
      connectionId: transaction.connectionId,
      accountId: transaction.accountId,
      amount: transaction.amount,
      cashFlowAmount: flags.cashFlowAmount,
      date: transaction.date,
      authorizedDate: transaction.authorizedDate,
      pending: transaction.pending,
      countsAsIncome: flags.countsAsIncome,
      countsAsSpend: flags.countsAsSpend,
      countsAsSavings: flags.countsAsSavings,
      countsAsInvestmentContribution: flags.countsAsInvestmentContribution,
      countsAsTransfer: flags.countsAsTransfer,
      internalTransfer: flags.internalTransfer,
      investmentIncome: flags.investmentIncome,
      affectsNetWorth: flags.affectsNetWorth,
      metadata: mergeMetadata(existing.metadata, {
        providerAccountId: transaction.providerAccountId,
        providerTransactionId: transaction.providerTransactionId,
        pendingTransactionId: transaction.pendingTransactionId,
        accountRole: inferAccountRole(transaction.account),
      }) as Prisma.InputJsonValue,
    },
  });
}

async function matchFinancialTransfers(userId: string, seedEventIds: string[]) {
  const seeds = await prisma.financialEvent.findMany({
    where: { userId, id: { in: seedEventIds }, userReviewedAt: null },
    include: { account: true, transaction: { select: { pendingTransactionId: true } } },
  });
  if (!seeds.length) return 0;

  const minDate = new Date(Math.min(...seeds.map((event) => event.date.getTime())) - 3 * DAY_MS);
  const maxDate = new Date(Math.max(...seeds.map((event) => event.date.getTime())) + 3 * DAY_MS);
  const candidates = await prisma.financialEvent.findMany({
    where: {
      userId,
      userReviewedAt: null,
      eventType: { notIn: ["expense", "income", "refund", "fee", "reimbursement"] },
      date: { gte: minDate, lte: maxDate },
    },
    include: { account: true, transaction: { select: { pendingTransactionId: true } } },
  });

  const used = new Set<string>();
  let matches = 0;
  for (const seed of seeds) {
    if (used.has(seed.id) || seed.eventType === "ignored") continue;
    const match = findBestTransferMatch(seed, candidates, used);
    if (!match) continue;
    const transferType = inferTransferType(seed, match);
    const transferGroupId = `transfer:${[seed.id, match.id].sort().join(":")}`;
    await Promise.all([
      applyTransferMatch(seed, match.id, transferGroupId, transferType),
      applyTransferMatch(match, seed.id, transferGroupId, transferType),
    ]);
    used.add(seed.id);
    used.add(match.id);
    matches += 1;
  }
  return matches;
}

function findBestTransferMatch(
  seed: EventWithTransferContext,
  candidates: EventWithTransferContext[],
  used: Set<string>,
) {
  let best: { event: EventWithTransferContext; score: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.id === seed.id || used.has(candidate.id) || candidate.eventType === "ignored") continue;
    const score = scoreTransferCandidate(seed, candidate);
    if (score >= 80 && (!best || score > best.score)) best = { event: candidate, score };
  }
  return best?.event ?? null;
}

function scoreTransferCandidate(left: EventWithTransferContext, right: EventWithTransferContext) {
  if (!left.accountId || !right.accountId || left.accountId === right.accountId) return 0;
  if (left.pending || right.pending) return 0;
  const amountDelta = Math.abs(Math.abs(left.amount) - Math.abs(right.amount));
  if (amountDelta > 0.01) return 0;
  if ((left.amount > 0) === (right.amount > 0)) return 0;
  const dateDeltaDays = Math.abs(left.date.getTime() - right.date.getTime()) / DAY_MS;
  if (dateDeltaDays > 3) return 0;

  const leftRole = inferAccountRole(left.account);
  const rightRole = inferAccountRole(right.account);
  const leftInvestmentIntent = hasInvestmentTransferIntent(left, leftRole);
  const rightInvestmentIntent = hasInvestmentTransferIntent(right, rightRole);
  const hasInvestmentAccount = isInvestmentRole(leftRole) || isInvestmentRole(rightRole);
  if ((leftInvestmentIntent || rightInvestmentIntent) && !hasInvestmentAccount && leftInvestmentIntent !== rightInvestmentIntent) return 0;

  let score = 72;
  score += amountDelta === 0 ? 10 : 7;
  score += Math.max(0, 9 - dateDeltaDays * 3);
  if (left.sourceId && right.transaction?.pendingTransactionId === left.sourceId) score += 12;
  if (right.sourceId && left.transaction?.pendingTransactionId === right.sourceId) score += 12;
  if (leftRole === "credit_card" || rightRole === "credit_card") score += 8;
  if (isInvestmentRole(leftRole) || isInvestmentRole(rightRole)) score += 7;
  if ((leftRole === "savings" && rightRole === "checking") || (leftRole === "checking" && rightRole === "savings")) score += 6;
  if (looksLikeSameMerchant(left, right)) score -= 12;
  return score;
}

function hasInvestmentTransferIntent(event: EventWithTransferContext, role: string) {
  if (isInvestmentRole(role)) return true;
  if (event.eventType === "investment_contribution" || event.eventType === "investment_withdrawal") return true;
  const text = normalizeTransferSearchText([event.displayName, event.normalizedMerchant, event.primaryCategory, event.subcategory]);
  return matchesAnyInvestmentBrand(text);
}

function matchesAnyInvestmentBrand(text: string) {
  return ["schwab", "charles schwab", "fidelity", "vanguard", "robinhood", "etrade", "e trade", "betterment", "wealthfront", "interactive brokers", "ibkr", "merrill"].some((brand) => text.includes(brand));
}

function normalizeTransferSearchText(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9'&* ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTransferType(left: EventWithTransferContext, right: EventWithTransferContext) {
  const leftRole = inferAccountRole(left.account);
  const rightRole = inferAccountRole(right.account);
  const destination = left.amount < 0 ? left : right;
  const destinationRole = inferAccountRole(destination.account);
  const source = destination.id === left.id ? right : left;
  const sourceRole = inferAccountRole(source.account);

  if (leftRole === "credit_card" || rightRole === "credit_card") return "credit_card_payment";
  if (isInvestmentRole(destinationRole)) return "investment_contribution";
  if (isInvestmentRole(sourceRole)) return "investment_withdrawal";
  if ((leftRole === "savings" && rightRole === "checking") || (leftRole === "checking" && rightRole === "savings")) return "savings_transfer";
  return "transfer";
}

async function applyTransferMatch(
  event: EventWithTransferContext,
  relatedEventId: string,
  transferGroupId: string,
  eventType: string,
) {
  const defaults = getDefaultCategoryForEventType(eventType, "transfers");
  const flags = buildEventFlags(eventType, event.amount);
  await prisma.financialEvent.update({
    where: { id: event.id },
    data: {
      relatedEventId,
      transferGroupId,
      eventType,
      primaryCategory: defaults.primaryCategory,
      subcategory: defaults.subcategory,
      cashFlowAmount: flags.cashFlowAmount,
      countsAsIncome: flags.countsAsIncome,
      countsAsSpend: flags.countsAsSpend,
      countsAsSavings: flags.countsAsSavings,
      countsAsInvestmentContribution: flags.countsAsInvestmentContribution,
      countsAsTransfer: flags.countsAsTransfer,
      internalTransfer: flags.internalTransfer,
      investmentIncome: flags.investmentIncome,
      affectsNetWorth: flags.affectsNetWorth,
      needsReview: false,
      confidence: 0.95,
      classificationSource: "transfer_match",
      classificationReason: "Matched equal and opposite transaction on another account within three days.",
    },
  });
}

function buildTransactionWhere(userId: string, options: NormalizeFinancialTransactionsOptions, transactionIds: string[]) {
  const base: Prisma.FinancialTransactionWhereInput = { userId };
  if (options.all) {
    if (options.connectionId) base.connectionId = options.connectionId;
    return base;
  }

  const or: Prisma.FinancialTransactionWhereInput[] = [];
  if (transactionIds.length) or.push({ id: { in: transactionIds } });
  if (options.connectionId) or.push({ connectionId: options.connectionId, financialEvent: null });
  if (!or.length) return base;
  return { userId, OR: or } satisfies Prisma.FinancialTransactionWhereInput;
}

function looksLikeSameMerchant(left: EventWithTransferContext, right: EventWithTransferContext) {
  const leftMerchant = left.normalizedMerchant ?? normalizeMerchantName(left.displayName);
  const rightMerchant = right.normalizedMerchant ?? normalizeMerchantName(right.displayName);
  return leftMerchant === rightMerchant && leftMerchant !== "Unknown Merchant";
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function mergeMetadata(existing: Prisma.JsonValue | null, next: Record<string, unknown>) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing as Record<string, unknown> : {};
  return toJsonObject({ ...base, ...next });
}

function toJsonObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, toJsonValue(item)] as const)
      .filter(([, item]) => item !== undefined),
  );
}

function toJsonValue(value: unknown): Prisma.JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item) ?? null);
  if (typeof value === "object") return toJsonObject(value as Record<string, unknown>) as Prisma.JsonObject;
  return String(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;
