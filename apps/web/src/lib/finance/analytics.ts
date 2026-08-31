import "server-only";

import type { FinancialAccount, InvestmentHolding, ManualFinancialPosition, Prisma } from "@prisma/client";

import {
  ACCOUNT_ROLE_LABELS,
  inferAccountRole,
  isInvestmentRole,
  isLiabilityRole,
  isRetirementRole,
} from "@/lib/finance/classification";
import { prisma } from "@/lib/prisma";

export type FinanceAnalyticsOptions = {
  rangeDays?: number;
  includePending?: boolean;
};

export type FinanceBreakdownItem = {
  id: string;
  label: string;
  value: number;
  detail: string;
  count: number;
  percent: number;
};

export type FinanceFlowPoint = {
  label: string;
  income: number;
  spending: number;
  net: number;
};

export type FinanceEventSummary = {
  id: string;
  accountId: string | null;
  accountName: string | null;
  date: Date;
  displayName: string;
  normalizedMerchant: string | null;
  amount: number;
  cashFlowAmount: number;
  eventType: string;
  primaryCategory: string;
  subcategory: string | null;
  pending: boolean;
  countsAsIncome: boolean;
  countsAsSpend: boolean;
  countsAsSavings: boolean;
  countsAsInvestmentContribution: boolean;
  countsAsTransfer: boolean;
  internalTransfer: boolean;
  investmentIncome: boolean;
  needsReview: boolean;
  confidence: number;
  classificationSource: string;
  classificationReason: string | null;
};

export type ManualPositionSummary = {
  id: string;
  kind: string;
  type: string;
  role: string;
  name: string;
  value: number;
  isoCurrencyCode: string | null;
  valuationDate: Date;
  valuationMethod: string;
  active: boolean;
};

export type FinanceNetWorthSummary = {
  totalAssets: number;
  totalLiabilities: number;
  totalNetWorth: number;
  liquidNetWorth: number;
  cash: number;
  investableAssets: number;
  retirementAssets: number;
  manualAssets: number;
  propertyAssets: number;
  vehicleAssets: number;
  creditLiabilities: number;
  loanLiabilities: number;
  mortgageLiabilities: number;
};

export type FinanceAnalytics = {
  currency: string;
  rangeDays: number;
  generatedAt: Date;
  transactionCount: number;
  pendingExcludedCount: number;
  netWorth: FinanceNetWorthSummary;
  cashFlow: {
    income: number;
    spending: number;
    netCashFlow: number;
    transfers: number;
    investmentContributions: number;
    investmentWithdrawals: number;
    dividends: number;
    interest: number;
    refunds: number;
    reimbursements: number;
    fees: number;
    debtPayments: number;
    cashFlowSeries: FinanceFlowPoint[];
  };
  savings: {
    grossIncome: number;
    consumptionSpending: number;
    savedAmount: number;
    savingsRate: number | null;
    brokerageContributions: number;
    retirementContributions: number;
    savingsTransfers: number;
  };
  spendingByCategory: FinanceBreakdownItem[];
  spendingByMerchant: FinanceBreakdownItem[];
  accountSpendBreakdown: FinanceBreakdownItem[];
  accountBreakdown: FinanceBreakdownItem[];
  investmentSummary: {
    totalValue: number;
    holdingsCount: number;
    holdingsBreakdown: FinanceBreakdownItem[];
  };
  recentEvents: FinanceEventSummary[];
  reviewQueue: FinanceEventSummary[];
  reviewQueueCount: number;
  manualPositions: ManualPositionSummary[];
};

const EVENT_INCLUDE = {
  account: {
    select: {
      id: true,
      name: true,
      type: true,
      subtype: true,
      canonicalRole: true,
      roleOverride: true,
      isoCurrencyCode: true,
    },
  },
  transaction: {
    select: {
      providerTransactionId: true,
      pendingTransactionId: true,
      isoCurrencyCode: true,
    },
  },
} satisfies Prisma.FinancialEventInclude;

type EventWithContext = Prisma.FinancialEventGetPayload<{ include: typeof EVENT_INCLUDE }>;
type AccountForNetWorth = FinancialAccount;
type HoldingForNetWorth = InvestmentHolding;
type ManualPositionForNetWorth = ManualFinancialPosition;

export async function getFinanceAnalytics(
  userId: string,
  options: FinanceAnalyticsOptions = {},
): Promise<FinanceAnalytics> {
  const rangeDays = coerceRangeDays(options.rangeDays);
  const includePending = options.includePending === true;
  const cutoff = getRangeCutoff(rangeDays);

  const [accounts, holdings, manualPositions, rangeEventsRaw, recentEventsRaw, reviewEvents, reviewEventCount] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.investmentHolding.findMany({ where: { userId }, orderBy: [{ institutionValue: "desc" }, { securityName: "asc" }] }),
    prisma.manualFinancialPosition.findMany({ where: { userId, active: true }, orderBy: [{ kind: "asc" }, { value: "desc" }] }),
    prisma.financialEvent.findMany({
      where: { userId, date: { gte: cutoff } },
      include: EVENT_INCLUDE,
      orderBy: { date: "asc" },
    }),
    prisma.financialEvent.findMany({
      where: { userId },
      include: EVENT_INCLUDE,
      orderBy: { date: "desc" },
      take: 80,
    }),
    prisma.financialEvent.findMany({
      where: { userId, needsReview: true },
      include: EVENT_INCLUDE,
      orderBy: [{ date: "desc" }, { confidence: "asc" }],
      take: 80,
    }),
    prisma.financialEvent.count({ where: { userId, needsReview: true } }),
  ]);

  const rangeEvents = filterPendingDuplicates(rangeEventsRaw, includePending);
  const recentEvents = filterPendingDuplicates(recentEventsRaw, includePending).slice(0, 24);
  const pendingExcludedCount = rangeEventsRaw.length - rangeEvents.length;
  const netWorth = calculateNetWorth(accounts, holdings, manualPositions);
  const currency = getPrimaryCurrency(accounts, holdings, manualPositions, rangeEvents) ?? "USD";
  const spendEvents = rangeEvents.filter((event) => event.countsAsSpend);
  const incomeEvents = rangeEvents.filter((event) => event.countsAsIncome);
  const transferEvents = rangeEvents.filter((event) => event.countsAsTransfer);
  const investmentContributionEvents = rangeEvents.filter((event) => event.countsAsInvestmentContribution);
  const investmentWithdrawalEvents = rangeEvents.filter((event) => event.eventType === "investment_withdrawal");
  const dividendEvents = rangeEvents.filter((event) => event.eventType === "dividend");
  const interestEvents = rangeEvents.filter((event) => event.eventType === "interest");
  const refundEvents = rangeEvents.filter((event) => event.eventType === "refund");
  const reimbursementEvents = rangeEvents.filter((event) => event.eventType === "reimbursement");
  const feeEvents = rangeEvents.filter((event) => event.eventType === "fee");
  const debtPaymentEvents = rangeEvents.filter((event) => event.eventType === "debt_payment" || event.eventType === "credit_card_payment");

  const income = roundMoney(incomeEvents.reduce((sum, event) => sum + Math.max(0, event.cashFlowAmount), 0));
  const spending = roundMoney(spendEvents.reduce((sum, event) => sum + Math.abs(event.cashFlowAmount || event.amount), 0));
  const netCashFlow = roundMoney(rangeEvents.reduce((sum, event) => sum + event.cashFlowAmount, 0));
  const investmentContributions = roundMoney(sumDeduped(investmentContributionEvents, (event) => Math.abs(event.amount)));
  const investmentWithdrawals = roundMoney(sumDeduped(investmentWithdrawalEvents, (event) => Math.abs(event.amount)));
  const savingsTransfers = roundMoney(sumDeduped(rangeEvents.filter((event) => event.eventType === "savings_transfer"), (event) => Math.abs(event.amount)));
  const savedAmount = roundMoney(income - spending);

  return {
    currency,
    rangeDays,
    generatedAt: new Date(),
    transactionCount: rangeEvents.length,
    pendingExcludedCount,
    netWorth,
    cashFlow: {
      income,
      spending,
      netCashFlow,
      transfers: roundMoney(sumDeduped(transferEvents, (event) => Math.abs(event.amount))),
      investmentContributions,
      investmentWithdrawals,
      dividends: roundMoney(dividendEvents.reduce((sum, event) => sum + Math.abs(event.cashFlowAmount || event.amount), 0)),
      interest: roundMoney(interestEvents.reduce((sum, event) => sum + Math.abs(event.cashFlowAmount || event.amount), 0)),
      refunds: roundMoney(refundEvents.reduce((sum, event) => sum + Math.abs(event.cashFlowAmount || event.amount), 0)),
      reimbursements: roundMoney(reimbursementEvents.reduce((sum, event) => sum + Math.abs(event.cashFlowAmount || event.amount), 0)),
      fees: roundMoney(feeEvents.reduce((sum, event) => sum + Math.abs(event.cashFlowAmount || event.amount), 0)),
      debtPayments: roundMoney(sumDeduped(debtPaymentEvents, (event) => Math.abs(event.amount))),
      cashFlowSeries: buildCashFlowSeries(rangeEvents, rangeDays),
    },
    savings: {
      grossIncome: income,
      consumptionSpending: spending,
      savedAmount,
      savingsRate: income > 0 ? savedAmount / income : null,
      brokerageContributions: roundMoney(sumDeduped(
        investmentContributionEvents.filter((event) => inferAccountRole(event.account) === "taxable_brokerage"),
        (event) => Math.abs(event.amount),
      )),
      retirementContributions: roundMoney(sumDeduped(
        investmentContributionEvents.filter((event) => isRetirementRole(inferAccountRole(event.account)) || inferAccountRole(event.account) === "hsa"),
        (event) => Math.abs(event.amount),
      )),
      savingsTransfers,
    },
    spendingByCategory: buildEventBreakdown(spendEvents, (event) => titleCase(event.primaryCategory), "events"),
    spendingByMerchant: buildEventBreakdown(spendEvents, (event) => event.normalizedMerchant ?? event.displayName, "events"),
    accountSpendBreakdown: buildEventBreakdown(spendEvents, (event) => event.account?.name ?? "Unknown account", "events"),
    accountBreakdown: buildAccountBreakdown(accounts, holdings, manualPositions),
    investmentSummary: {
      totalValue: roundMoney(netWorth.investableAssets + netWorth.retirementAssets),
      holdingsCount: holdings.length,
      holdingsBreakdown: buildHoldingBreakdown(holdings),
    },
    recentEvents: recentEvents.map(toEventSummary),
    reviewQueue: reviewEvents.map(toEventSummary),
    reviewQueueCount: reviewEventCount,
    manualPositions: manualPositions.map(toManualPositionSummary),
  };
}

export async function snapshotNetWorth(userId: string, source = "sync") {
  const [accounts, holdings, manualPositions] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId } }),
    prisma.investmentHolding.findMany({ where: { userId } }),
    prisma.manualFinancialPosition.findMany({ where: { userId, active: true } }),
  ]);
  const snapshotDate = startOfUtcDay(new Date());
  const netWorth = calculateNetWorth(accounts, holdings, manualPositions);

  return prisma.financialNetWorthSnapshot.upsert({
    where: { userId_snapshotDate_source: { userId, snapshotDate, source } },
    create: {
      userId,
      snapshotDate,
      source,
      ...netWorth,
    },
    update: netWorth,
  });
}

function calculateNetWorth(
  accounts: AccountForNetWorth[],
  holdings: HoldingForNetWorth[],
  manualPositions: ManualPositionForNetWorth[],
): FinanceNetWorthSummary {
  const holdingValueByAccount = new Map<string, number>();
  holdings.forEach((holding) => {
    if (!holding.accountId) return;
    holdingValueByAccount.set(holding.accountId, (holdingValueByAccount.get(holding.accountId) ?? 0) + (holding.institutionValue ?? 0));
  });

  let cash = 0;
  let investableAssets = 0;
  let retirementAssets = 0;
  let accountAssets = 0;
  let creditLiabilities = 0;
  let loanLiabilities = 0;
  let mortgageLiabilities = 0;

  accounts.forEach((account) => {
    const role = inferAccountRole(account);
    const rawBalance = account.currentBalance ?? account.availableBalance ?? 0;
    const holdingValue = holdingValueByAccount.get(account.id) ?? 0;
    const balance = isInvestmentRole(role) && Math.abs(rawBalance) < 0.01 && holdingValue > 0 ? holdingValue : rawBalance;

    if (isLiabilityRole(role) || account.type === "credit" || account.type === "loan") {
      const liability = Math.abs(balance);
      if (role === "credit_card") creditLiabilities += liability;
      else if (role === "mortgage") mortgageLiabilities += liability;
      else loanLiabilities += liability;
      return;
    }

    const assetValue = Math.max(0, balance);
    accountAssets += assetValue;
    if (role === "checking" || role === "savings" || role === "cash") cash += assetValue;
    if (role === "taxable_brokerage") investableAssets += assetValue;
    if (isRetirementRole(role) || role === "hsa") retirementAssets += assetValue;
  });

  let manualAssets = 0;
  let manualLiabilities = 0;
  let propertyAssets = 0;
  let vehicleAssets = 0;
  manualPositions.forEach((position) => {
    const value = Math.abs(position.value);
    if (position.kind === "liability") {
      manualLiabilities += value;
      if (position.role === "mortgage") mortgageLiabilities += value;
      else if (position.role === "credit_card") creditLiabilities += value;
      else loanLiabilities += value;
      return;
    }
    manualAssets += value;
    if (position.role === "property") propertyAssets += value;
    else if (position.role === "vehicle") vehicleAssets += value;
    else if (position.role === "taxable_brokerage") investableAssets += value;
    else if (isRetirementRole(position.role) || position.role === "hsa") retirementAssets += value;
    else if (position.role === "checking" || position.role === "savings" || position.role === "cash") cash += value;
  });

  const totalAssets = roundMoney(accountAssets + manualAssets);
  const totalLiabilities = roundMoney(creditLiabilities + loanLiabilities + mortgageLiabilities + manualLiabilities);
  return {
    totalAssets,
    totalLiabilities,
    totalNetWorth: roundMoney(totalAssets - totalLiabilities),
    liquidNetWorth: roundMoney(cash + investableAssets - creditLiabilities),
    cash: roundMoney(cash),
    investableAssets: roundMoney(investableAssets),
    retirementAssets: roundMoney(retirementAssets),
    manualAssets: roundMoney(manualAssets),
    propertyAssets: roundMoney(propertyAssets),
    vehicleAssets: roundMoney(vehicleAssets),
    creditLiabilities: roundMoney(creditLiabilities),
    loanLiabilities: roundMoney(loanLiabilities),
    mortgageLiabilities: roundMoney(mortgageLiabilities),
  };
}

function buildCashFlowSeries(events: EventWithContext[], rangeDays: number): FinanceFlowPoint[] {
  const bucketCount = rangeDays <= 30 ? 6 : rangeDays <= 90 ? 8 : 10;
  const end = new Date();
  const start = getRangeCutoff(rangeDays);
  const spanMs = Math.max(1, end.getTime() - start.getTime());
  const bucketMs = spanMs / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start.getTime() + bucketMs * index);
    return {
      label: formatBucketLabel(bucketStart),
      income: 0,
      spending: 0,
      net: 0,
    };
  });

  events.forEach((event) => {
    const timestamp = event.date.getTime();
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((timestamp - start.getTime()) / bucketMs)));
    if (event.countsAsIncome) buckets[index].income += Math.max(0, event.cashFlowAmount);
    if (event.countsAsSpend) buckets[index].spending += Math.abs(event.cashFlowAmount || event.amount);
    buckets[index].net += event.cashFlowAmount;
  });

  return buckets.map((bucket) => ({
    label: bucket.label,
    income: roundMoney(bucket.income),
    spending: roundMoney(bucket.spending),
    net: roundMoney(bucket.net),
  }));
}

function buildEventBreakdown(
  events: EventWithContext[],
  getKey: (event: EventWithContext) => string,
  detailLabel: string,
): FinanceBreakdownItem[] {
  const totals = new Map<string, { total: number; count: number }>();
  events.forEach((event) => {
    const key = cleanLabel(getKey(event));
    const current = totals.get(key) ?? { total: 0, count: 0 };
    current.total += Math.abs(event.cashFlowAmount || event.amount);
    current.count += 1;
    totals.set(key, current);
  });
  return mapBreakdown(totals, detailLabel, 7);
}

function buildAccountBreakdown(
  accounts: AccountForNetWorth[],
  holdings: HoldingForNetWorth[],
  manualPositions: ManualPositionForNetWorth[],
): FinanceBreakdownItem[] {
  const holdingValueByAccount = new Map<string, number>();
  holdings.forEach((holding) => {
    if (!holding.accountId) return;
    holdingValueByAccount.set(holding.accountId, (holdingValueByAccount.get(holding.accountId) ?? 0) + (holding.institutionValue ?? 0));
  });

  const totals = new Map<string, { total: number; count: number }>();
  accounts.forEach((account) => {
    const role = inferAccountRole(account);
    const rawBalance = account.currentBalance ?? account.availableBalance ?? 0;
    const holdingValue = holdingValueByAccount.get(account.id) ?? 0;
    const balance = isInvestmentRole(role) && Math.abs(rawBalance) < 0.01 && holdingValue > 0 ? holdingValue : rawBalance;
    const label = ACCOUNT_ROLE_LABELS[role] ?? titleCase(role);
    const current = totals.get(label) ?? { total: 0, count: 0 };
    current.total += Math.abs(balance);
    current.count += 1;
    totals.set(label, current);
  });
  manualPositions.forEach((position) => {
    const label = ACCOUNT_ROLE_LABELS[position.role] ?? titleCase(position.role || position.type);
    const current = totals.get(label) ?? { total: 0, count: 0 };
    current.total += Math.abs(position.value);
    current.count += 1;
    totals.set(label, current);
  });
  return mapBreakdown(totals, "positions", 8);
}

function buildHoldingBreakdown(holdings: HoldingForNetWorth[]): FinanceBreakdownItem[] {
  const totals = new Map<string, { total: number; count: number }>();
  holdings.forEach((holding) => {
    const value = holding.institutionValue ?? 0;
    if (value <= 0) return;
    const label = holding.tickerSymbol ?? holding.securityName ?? "Holding";
    const current = totals.get(label) ?? { total: 0, count: 0 };
    current.total += value;
    current.count += 1;
    totals.set(label, current);
  });
  return mapBreakdown(totals, "holdings", 8);
}

function mapBreakdown(totals: Map<string, { total: number; count: number }>, detailLabel: string, take: number): FinanceBreakdownItem[] {
  const total = Array.from(totals.values()).reduce((sum, item) => sum + item.total, 0);
  const sorted = Array.from(totals.entries()).sort((left, right) => right[1].total - left[1].total);
  const visible = sorted.slice(0, take);
  const rest = sorted.slice(take);
  const items = visible.map(([label, item], index) => ({
    id: `${slugify(label)}-${index}`,
    label,
    value: roundMoney(item.total),
    detail: `${item.count} ${detailLabel}`,
    count: item.count,
    percent: total > 0 ? item.total / total : 0,
  }));
  if (rest.length) {
    const otherTotal = rest.reduce((sum, [, item]) => sum + item.total, 0);
    const otherCount = rest.reduce((sum, [, item]) => sum + item.count, 0);
    items.push({
      id: "other",
      label: "Other",
      value: roundMoney(otherTotal),
      detail: `${otherCount} ${detailLabel}`,
      count: otherCount,
      percent: total > 0 ? otherTotal / total : 0,
    });
  }
  return items;
}

function filterPendingDuplicates(events: EventWithContext[], includePending: boolean) {
  const postedPendingIds = new Set(
    events
      .filter((event) => !event.pending)
      .map((event) => event.transaction?.pendingTransactionId ?? getMetadataString(event.metadata, "pendingTransactionId"))
      .filter((value): value is string => Boolean(value)),
  );
  return events.filter((event) => {
    if (!event.pending) return true;
    if (!includePending) return false;
    return !event.sourceId || !postedPendingIds.has(event.sourceId);
  });
}

function toEventSummary(event: EventWithContext): FinanceEventSummary {
  return {
    id: event.id,
    accountId: event.accountId,
    accountName: event.account?.name ?? null,
    date: event.date,
    displayName: event.displayName,
    normalizedMerchant: event.normalizedMerchant,
    amount: event.amount,
    cashFlowAmount: event.cashFlowAmount,
    eventType: event.eventType,
    primaryCategory: event.primaryCategory,
    subcategory: event.subcategory,
    pending: event.pending,
    countsAsIncome: event.countsAsIncome,
    countsAsSpend: event.countsAsSpend,
    countsAsSavings: event.countsAsSavings,
    countsAsInvestmentContribution: event.countsAsInvestmentContribution,
    countsAsTransfer: event.countsAsTransfer,
    internalTransfer: event.internalTransfer,
    investmentIncome: event.investmentIncome,
    needsReview: event.needsReview,
    confidence: event.confidence,
    classificationSource: event.classificationSource,
    classificationReason: event.classificationReason,
  };
}

function toManualPositionSummary(position: ManualPositionForNetWorth): ManualPositionSummary {
  return {
    id: position.id,
    kind: position.kind,
    type: position.type,
    role: position.role,
    name: position.name,
    value: position.value,
    isoCurrencyCode: position.isoCurrencyCode,
    valuationDate: position.valuationDate,
    valuationMethod: position.valuationMethod,
    active: position.active,
  };
}

function sumDeduped(events: EventWithContext[], getValue: (event: EventWithContext) => number) {
  const seen = new Set<string>();
  return events.reduce((sum, event) => {
    const key = event.transferGroupId ?? event.id;
    if (seen.has(key)) return sum;
    seen.add(key);
    return sum + getValue(event);
  }, 0);
}

function getPrimaryCurrency(
  accounts: AccountForNetWorth[],
  holdings: HoldingForNetWorth[],
  manualPositions: ManualPositionForNetWorth[],
  events: EventWithContext[],
) {
  const currencies = [
    ...accounts.map((item) => item.isoCurrencyCode),
    ...holdings.map((item) => item.isoCurrencyCode),
    ...manualPositions.map((item) => item.isoCurrencyCode),
    ...events.map((item) => item.account?.isoCurrencyCode ?? item.transaction?.isoCurrencyCode),
  ].filter((value): value is string => Boolean(value));
  const counts = new Map<string, number>();
  currencies.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function getRangeCutoff(rangeDays: number) {
  const date = new Date();
  date.setDate(date.getDate() - rangeDays + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatBucketLabel(value: Date) {
  return value.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function cleanLabel(value: string) {
  return value.trim() || "Uncategorized";
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function getMetadataString(metadata: Prisma.JsonValue | null, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function coerceRangeDays(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 60;
  return Math.min(730, Math.max(7, Math.round(value)));
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
