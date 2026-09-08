"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MobileSectionNav } from "@/components/MobileSectionNav";

import { useJarvisState } from "@/lib/jarvisStore";

type PlaidInstitution = {
  institution_id?: string;
  name?: string;
};

type PlaidMetadata = {
  institution?: PlaidInstitution;
};

type PlaidCreateOptions = {
  token: string;
  onSuccess: (publicToken: string, metadata: PlaidMetadata) => void | Promise<void>;
  onExit?: (error: unknown, metadata: unknown) => void;
};

type PlaidHandler = {
  open: () => void;
  exit?: () => void;
  destroy?: () => void;
};

declare global {
  interface Window {
    Plaid?: {
      create: (options: PlaidCreateOptions) => PlaidHandler;
    };
  }
}

type FinanceSetup = {
  configured: boolean;
  environment: string;
  products: string[];
  countryCodes: string[];
  missing: string[];
};

type FinanceConnection = {
  id: string;
  provider: string;
  institutionName: string | null;
  products: string[];
  status: string;
  lastSyncedAt: string | null;
  createdAt: string;
};

type FinanceAccount = {
  id: string;
  connectionId: string;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  canonicalRole: string | null;
  roleOverride: string | null;
  updatedAt: string;
};

type FinanceTransaction = {
  id: string;
  accountId: string | null;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  category: string[];
  pending: boolean;
  isoCurrencyCode: string | null;
  pendingTransactionId: string | null;
  personalFinanceCategoryPrimary: string | null;
  personalFinanceCategoryDetailed: string | null;
  personalFinanceCategoryConfidence: string | null;
};

type InvestmentHolding = {
  id: string;
  accountId: string | null;
  securityName: string | null;
  tickerSymbol: string | null;
  quantity: number;
  institutionPrice: number | null;
  institutionValue: number | null;
  costBasis: number | null;
  isoCurrencyCode: string | null;
  updatedAt: string;
};

type FinanceEvent = {
  id: string;
  accountId: string | null;
  accountName: string | null;
  date: string;
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

type ManualFinancialPosition = {
  id: string;
  kind: string;
  type: string;
  role: string;
  name: string;
  value: number;
  isoCurrencyCode: string | null;
  valuationDate: string;
  valuationMethod: string;
  active: boolean;
};

type FinanceAnalyticsBreakdownItem = {
  id: string;
  label: string;
  value: number;
  detail: string;
  count: number;
  percent: number;
};

type FinanceAnalytics = {
  currency: string;
  rangeDays: number;
  generatedAt: string;
  transactionCount: number;
  pendingExcludedCount: number;
  netWorth: {
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
    cashFlowSeries: FlowPoint[];
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
  spendingByCategory: FinanceAnalyticsBreakdownItem[];
  spendingByMerchant: FinanceAnalyticsBreakdownItem[];
  accountSpendBreakdown: FinanceAnalyticsBreakdownItem[];
  accountBreakdown: FinanceAnalyticsBreakdownItem[];
  investmentSummary: {
    totalValue: number;
    holdingsCount: number;
    holdingsBreakdown: FinanceAnalyticsBreakdownItem[];
  };
  recentEvents: FinanceEvent[];
  reviewQueue: FinanceEvent[];
  reviewQueueCount: number;
  manualPositions: ManualFinancialPosition[];
};

type FinanceSummary = {
  setup: FinanceSetup;
  connections: FinanceConnection[];
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  holdings: InvestmentHolding[];
  events: FinanceEvent[];
  manualPositions: ManualFinancialPosition[];
  analytics: FinanceAnalytics | null;
  updatedAt: number;
};

type ActionStatus = "idle" | "loading" | "syncing" | "error";
type FinanceAssistantStatus = "idle" | "loading" | "error";
type FinanceMobileView = "overview" | "spending" | "accounts" | "activity" | "investments";
type PlaidConnectionType = "bank" | "investment";
type PlaidLinkTokenResponse = {
  linkToken: string;
  expiration: string;
  connectionType: PlaidConnectionType;
  products: string[];
  linkSession: string;
};

type FinanceConnectionDeleteResponse = {
  plaid?: {
    attempted: boolean;
    removed: boolean;
    warning: string | null;
  };
  deleted?: {
    accounts: number;
    transactions: number;
    events: number;
    balanceSnapshots: number;
    classificationRules: number;
  };
};

type RangeKey = "1" | "7" | "14" | "30" | "60" | "90" | "180";
type ChartId = "cashflow" | "categories" | "accounts" | "investments" | "merchants";
type BreakdownMode = "category" | "account";
type Tone = "good" | "warn" | "bad" | "neutral";

type BreakdownItem = {
  id: string;
  label: string;
  value: number;
  detail: string;
  color: string;
  percent: number;
};

type FlowPoint = {
  label: string;
  income: number;
  spending: number;
  net: number;
};

type FinanceDashboard = {
  currency: string;
  netWorth: number;
  liquidNetWorth: number;
  cash: number;
  investments: number;
  liabilities: number;
  periodIncome: number;
  periodSpend: number;
  netFlow: number;
  savingsRate: number | null;
  cashBufferMonths: number | null;
  transactionCount: number;
  pendingCount: number;
  connectedInstitutionCount: number;
  filteredTransactions: FinanceTransaction[];
  recentEvents: FinanceEvent[];
  reviewQueue: FinanceEvent[];
  accounts: FinanceAccount[];
  holdings: InvestmentHolding[];
  manualPositions: ManualFinancialPosition[];
  reviewCount: number;
  flowSeries: FlowPoint[];
  categoryBreakdown: BreakdownItem[];
  accountSpendBreakdown: BreakdownItem[];
  accountTypeBreakdown: BreakdownItem[];
  investmentBreakdown: BreakdownItem[];
  topMerchants: BreakdownItem[];
  insights: Array<{ label: string; value: string; tone: Tone }>;
};

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: "1", label: "1D" },
  { value: "7", label: "7D" },
  { value: "14", label: "14D" },
  { value: "30", label: "30D" },
  { value: "60", label: "60D" },
  { value: "90", label: "90D" },
  { value: "180", label: "180D" },
];

const RANGE_VALUES = RANGE_OPTIONS.map((option) => option.value);

// Central chart registry: edit this list to rename, reorder, or remove dashboard charts.
const FINANCE_CHARTS: Array<{
  id: ChartId;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: "cashflow",
    label: "Flow",
    title: "Cashflow cadence",
    description: "Income, spend, and net movement across the selected range.",
  },
  {
    id: "categories",
    label: "Spend",
    title: "Spend concentration",
    description: "Largest outflow buckets from Plaid transactions.",
  },
  {
    id: "accounts",
    label: "Accounts",
    title: "Balance architecture",
    description: "Assets and liabilities grouped by account type.",
  },
  {
    id: "investments",
    label: "Invest",
    title: "Investment allocation",
    description: "Largest holdings from investment accounts.",
  },
  {
    id: "merchants",
    label: "Merchants",
    title: "Merchant pressure",
    description: "Top merchants by spend for the selected range.",
  },
];

const CHART_VALUES = FINANCE_CHARTS.map((chart) => chart.id);
const BREAKDOWN_OPTIONS: Array<{ value: BreakdownMode; label: string }> = [
  { value: "category", label: "Category" },
  { value: "account", label: "Account" },
];
const BREAKDOWN_VALUES = BREAKDOWN_OPTIONS.map((option) => option.value);

const FINANCIAL_EVENT_TYPE_OPTIONS = [
  "income",
  "expense",
  "transfer",
  "credit_card_payment",
  "savings_transfer",
  "investment_contribution",
  "investment_withdrawal",
  "investment_trade",
  "dividend",
  "interest",
  "refund",
  "reimbursement",
  "fee",
  "debt_payment",
  "asset_purchase",
  "asset_sale",
  "asset_adjustment",
  "liability_adjustment",
  "ignored",
  "unknown",
];

const SUGGESTED_FINANCE_CATEGORIES = [
  "income",
  "groceries",
  "food_dining",
  "shopping",
  "transportation",
  "housing_utilities",
  "healthcare",
  "travel",
  "entertainment",
  "transfers",
  "savings",
  "investments",
  "debt",
  "fees",
  "refunds",
  "reimbursements",
  "uncategorized",
];

const CHART_COLORS = [
  "#67e8f9",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#f472b6",
  "#38bdf8",
  "#f97316",
  "#c084fc",
];

const ACCOUNT_TYPE_META: Record<string, { label: string; color: string; order: number }> = {
  depository: { label: "Cash", color: "#67e8f9", order: 1 },
  cash: { label: "Cash", color: "#67e8f9", order: 1 },
  checking: { label: "Checking", color: "#38bdf8", order: 2 },
  savings: { label: "Savings", color: "#34d399", order: 3 },
  investment: { label: "Investments", color: "#34d399", order: 4 },
  taxable_brokerage: { label: "Taxable brokerage", color: "#2dd4bf", order: 5 },
  retirement_401k: { label: "401(k)", color: "#a78bfa", order: 6 },
  retirement_403b: { label: "403(b)", color: "#c084fc", order: 7 },
  retirement_ira: { label: "IRA", color: "#818cf8", order: 8 },
  retirement_roth_ira: { label: "Roth IRA", color: "#f472b6", order: 9 },
  hsa: { label: "HSA", color: "#14b8a6", order: 10 },
  credit: { label: "Credit", color: "#fb7185", order: 20 },
  credit_card: { label: "Credit cards", color: "#fb7185", order: 20 },
  loan: { label: "Loans", color: "#fbbf24", order: 21 },
  student_loan: { label: "Student loans", color: "#fbbf24", order: 22 },
  mortgage: { label: "Mortgage", color: "#f97316", order: 23 },
  vehicle_loan: { label: "Vehicle loans", color: "#fdba74", order: 24 },
  property: { label: "Property", color: "#eab308", order: 30 },
  vehicle: { label: "Vehicles", color: "#94a3b8", order: 31 },
  other_asset: { label: "Other assets", color: "#94a3b8", order: 32 },
  other_liability: { label: "Other liabilities", color: "#fda4af", order: 33 },
};

const financePreferenceKeys = {
  chart: "jarvis-finance-chart",
  range: "jarvis-finance-range",
  breakdown: "jarvis-finance-breakdown",
  hidePending: "jarvis-finance-hide-pending",
  overviewOpen: "jarvis-finance-overview-open",
  chartsOpen: "jarvis-finance-charts-open",
  reviewOpen: "jarvis-finance-review-open",
  accountsOpen: "jarvis-finance-accounts-open",
  transactionsOpen: "jarvis-finance-transactions-open",
  investmentsOpen: "jarvis-finance-investments-open",
  assistantOpen: "jarvis-finance-assistant-open",
};

const DISPLAY_LOCALE = "en-US";

const PLAID_CONNECTION_OPTIONS: Array<{
  value: PlaidConnectionType;
  label: string;
  description: string;
  products: string[];
}> = [
  {
    value: "bank",
    label: "Bank / Credit Card",
    description: "Balances, spending and transactions",
    products: ["transactions"],
  },
  {
    value: "investment",
    label: "Investment Account",
    description: "Balances, transactions and investment holdings",
    products: ["transactions", "investments"],
  },
];

const FINANCE_ASSISTANT_PROMPTS = [
  "What changed in my finances this month?",
  "Where is my spending concentrated?",
  "How much income, spend, transfers, and investing activity do I have?",
  "What financial events still need review?",
];

const REVIEW_PRESETS: Array<{
  label: string;
  eventType: string;
  primaryCategory: string;
  subcategory: string;
}> = [
  { label: "Paycheck", eventType: "income", primaryCategory: "income", subcategory: "payroll" },
  { label: "Expense", eventType: "expense", primaryCategory: "uncategorized", subcategory: "general" },
  { label: "Investment", eventType: "investment_contribution", primaryCategory: "investments", subcategory: "contribution" },
  { label: "Transfer", eventType: "transfer", primaryCategory: "transfers", subcategory: "internal" },
  { label: "Refund", eventType: "refund", primaryCategory: "refunds", subcategory: "refund" },
  { label: "Ignore", eventType: "ignored", primaryCategory: "uncategorized", subcategory: "ignored" },
];

function buildDemoFinanceSummary(rangeDays = 30): FinanceSummary {
  const now = new Date();
  const updatedAt = now.getTime();
  const nowIso = now.toISOString();
  const connectionId = "demo-plaid-main";
  const investmentConnectionId = "demo-plaid-investments";
  const accounts: FinanceAccount[] = [
    buildDemoAccount({ id: "demo-checking", connectionId, name: "Demo Checking", type: "depository", subtype: "checking", balance: 8400, available: 8125, role: "checking" }),
    buildDemoAccount({ id: "demo-savings", connectionId, name: "Demo High Yield Savings", type: "depository", subtype: "savings", balance: 18500, available: 18500, role: "savings" }),
    buildDemoAccount({ id: "demo-card", connectionId, name: "Demo Rewards Card", type: "credit", subtype: "credit card", balance: 1240, available: 8760, role: "credit_card" }),
    buildDemoAccount({ id: "demo-brokerage", connectionId: investmentConnectionId, name: "Demo Brokerage", type: "investment", subtype: "brokerage", balance: 64200, available: null, role: "taxable_brokerage" }),
    buildDemoAccount({ id: "demo-401k", connectionId: investmentConnectionId, name: "Demo 401(k)", type: "investment", subtype: "401k", balance: 118500, available: null, role: "retirement_401k" }),
  ];
  const holdings: InvestmentHolding[] = [
    buildDemoHolding("demo-holding-vti", "demo-brokerage", "Vanguard Total Stock Market ETF", "VTI", 82, 294, 24108, 19750),
    buildDemoHolding("demo-holding-vxus", "demo-brokerage", "Vanguard Total International Stock ETF", "VXUS", 140, 72, 10080, 9130),
    buildDemoHolding("demo-holding-sgov", "demo-brokerage", "iShares Treasury ETF", "SGOV", 210, 100.4, 21084, 21010),
    buildDemoHolding("demo-holding-target", "demo-401k", "Target Retirement Index Fund", "TRI", 720, 164.58, 118500, 99000),
  ];
  const events: FinanceEvent[] = [
    buildDemoEvent({ id: "demo-event-payroll-1", accountId: "demo-checking", accountName: "Demo Checking", offset: -2, name: "Northstar Payroll", amount: -4250, cashFlowAmount: 4250, eventType: "income", category: "income", subcategory: "payroll", income: true, confidence: 0.98, reason: "Demo payroll deposit matched employer cadence." }),
    buildDemoEvent({ id: "demo-event-rent", accountId: "demo-checking", accountName: "Demo Checking", offset: -4, name: "Harbor Lofts Rent", amount: 1600, cashFlowAmount: -1600, eventType: "expense", category: "housing_utilities", subcategory: "rent", spend: true, confidence: 0.96 }),
    buildDemoEvent({ id: "demo-event-grocery", accountId: "demo-card", accountName: "Demo Rewards Card", offset: -5, name: "Market Basket", amount: 126.42, cashFlowAmount: -126.42, eventType: "expense", category: "groceries", subcategory: "supermarket", spend: true, confidence: 0.94 }),
    buildDemoEvent({ id: "demo-event-dining", accountId: "demo-card", accountName: "Demo Rewards Card", offset: -6, name: "Bluebird Cafe", amount: 64.2, cashFlowAmount: -64.2, eventType: "expense", category: "food_dining", subcategory: "restaurant", spend: true, confidence: 0.9 }),
    buildDemoEvent({ id: "demo-event-invest", accountId: "demo-checking", accountName: "Demo Checking", offset: -8, name: "Atlas Brokerage ACH", amount: 750, cashFlowAmount: 750, eventType: "investment_contribution", category: "investments", subcategory: "contribution", investing: true, confidence: 0.93, reason: "Demo ACH movement into an investment account is excluded from spend." }),
    buildDemoEvent({ id: "demo-event-transfer", accountId: "demo-checking", accountName: "Demo Checking", offset: -9, name: "Transfer to Savings", amount: 500, cashFlowAmount: 500, eventType: "savings_transfer", category: "savings", subcategory: "internal", transfer: true, savings: true, confidence: 0.95 }),
    buildDemoEvent({ id: "demo-event-payroll-2", accountId: "demo-checking", accountName: "Demo Checking", offset: -16, name: "Northstar Payroll", amount: -4250, cashFlowAmount: 4250, eventType: "income", category: "income", subcategory: "payroll", income: true, confidence: 0.98 }),
    buildDemoEvent({ id: "demo-event-utilities", accountId: "demo-card", accountName: "Demo Rewards Card", offset: -18, name: "City Power", amount: 142.88, cashFlowAmount: -142.88, eventType: "expense", category: "housing_utilities", subcategory: "utilities", spend: true, confidence: 0.91 }),
    buildDemoEvent({ id: "demo-event-review-payroll", accountId: "demo-checking", accountName: "Demo Checking", offset: -1, name: "Northstar Payroll Bonus", amount: -850, cashFlowAmount: 850, eventType: "unknown", category: "uncategorized", subcategory: "needs_review", income: false, review: true, confidence: 0.48, reason: "Demo low-confidence income candidate ready for review." }),
    buildDemoEvent({ id: "demo-event-review-transfer", accountId: "demo-checking", accountName: "Demo Checking", offset: -3, name: "Atlas Brokerage Recurring", amount: 250, cashFlowAmount: 250, eventType: "unknown", category: "uncategorized", subcategory: "needs_review", review: true, confidence: 0.52, reason: "Demo investment transfer candidate ready for review." }),
  ];
  const spendingByCategory = [
    buildDemoBreakdown("housing", "Housing", 1742.88, "2 events", 0.48),
    buildDemoBreakdown("groceries", "Groceries", 396.2, "4 events", 0.11),
    buildDemoBreakdown("food", "Food Dining", 334.92, "5 events", 0.09),
    buildDemoBreakdown("transport", "Transportation", 288.5, "3 events", 0.08),
    buildDemoBreakdown("shopping", "Shopping", 224.18, "3 events", 0.06),
    buildDemoBreakdown("health", "Healthcare", 184.75, "2 events", 0.05),
    buildDemoBreakdown("other", "Other", 471.57, "8 events", 0.13),
  ];
  const spendingTotal = spendingByCategory.reduce((total, item) => total + item.value, 0);
  spendingByCategory.forEach((item) => {
    item.percent = spendingTotal > 0 ? item.value / spendingTotal : item.percent;
  });
  const reviewQueue = events.filter((event) => event.needsReview);

  return {
    setup: {
      configured: true,
      environment: "demo",
      products: ["transactions", "investments"],
      countryCodes: ["US"],
      missing: [],
    },
    connections: [
      {
        id: connectionId,
        provider: "plaid",
        institutionName: "Demo Bank",
        products: ["transactions"],
        status: "active",
        lastSyncedAt: nowIso,
        createdAt: getDemoFinanceIso(now, -30),
      },
      {
        id: investmentConnectionId,
        provider: "plaid",
        institutionName: "Demo Investments",
        products: ["transactions", "investments"],
        status: "active",
        lastSyncedAt: nowIso,
        createdAt: getDemoFinanceIso(now, -30),
      },
    ],
    accounts,
    transactions: events.map((event) => ({
      id: `tx-${event.id}`,
      accountId: event.accountId,
      date: event.date,
      name: event.displayName,
      merchantName: event.normalizedMerchant,
      amount: event.amount,
      category: [event.primaryCategory, event.subcategory ?? "general"],
      pending: event.pending,
      isoCurrencyCode: "USD",
      pendingTransactionId: null,
      personalFinanceCategoryPrimary: event.primaryCategory.toUpperCase(),
      personalFinanceCategoryDetailed: event.subcategory?.toUpperCase() ?? null,
      personalFinanceCategoryConfidence: "HIGH",
    })),
    holdings,
    events,
    manualPositions: [
      {
        id: "demo-manual-home-equity",
        kind: "asset",
        type: "property",
        role: "property",
        name: "Demo Home Equity",
        value: 72000,
        isoCurrencyCode: "USD",
        valuationDate: getDemoFinanceDate(now, -14),
        valuationMethod: "demo",
        active: true,
      },
    ],
    analytics: {
      currency: "USD",
      rangeDays,
      generatedAt: nowIso,
      transactionCount: 28,
      pendingExcludedCount: 2,
      netWorth: {
        totalAssets: 281600,
        totalLiabilities: 1240,
        totalNetWorth: 280360,
        liquidNetWorth: 25660,
        cash: 26900,
        investableAssets: 64200,
        retirementAssets: 118500,
        manualAssets: 72000,
        propertyAssets: 72000,
        vehicleAssets: 0,
        creditLiabilities: 1240,
        loanLiabilities: 0,
        mortgageLiabilities: 0,
      },
      cashFlow: {
        income: 8500,
        spending: spendingTotal,
        netCashFlow: 8500 - spendingTotal,
        transfers: 1500,
        investmentContributions: 1500,
        investmentWithdrawals: 0,
        dividends: 84.2,
        interest: 42.18,
        refunds: 38.4,
        reimbursements: 0,
        fees: 0,
        debtPayments: 1240,
        cashFlowSeries: buildDemoCashFlowSeries(rangeDays),
      },
      savings: {
        grossIncome: 8500,
        consumptionSpending: spendingTotal,
        savedAmount: 8500 - spendingTotal,
        savingsRate: (8500 - spendingTotal) / 8500,
        brokerageContributions: 1500,
        retirementContributions: 0,
        savingsTransfers: 500,
      },
      spendingByCategory,
      spendingByMerchant: [
        buildDemoBreakdown("merchant-rent", "Harbor Lofts", 1600, "1 event", 0.44),
        buildDemoBreakdown("merchant-market", "Market Basket", 396.2, "4 events", 0.11),
        buildDemoBreakdown("merchant-cafe", "Bluebird Cafe", 214.2, "3 events", 0.06),
        buildDemoBreakdown("merchant-power", "City Power", 142.88, "1 event", 0.04),
      ],
      accountSpendBreakdown: [
        buildDemoBreakdown("acct-card", "Demo Rewards Card", 2042, "18 events", 0.56),
        buildDemoBreakdown("acct-checking", "Demo Checking", 1600, "1 event", 0.44),
      ],
      accountBreakdown: [
        buildDemoBreakdown("cash", "Cash", 26900, "Checking and savings", 0.1),
        buildDemoBreakdown("taxable", "Taxable brokerage", 64200, "Brokerage", 0.23),
        buildDemoBreakdown("retirement", "401(k)", 118500, "Retirement", 0.42),
        buildDemoBreakdown("property", "Property", 72000, "Manual equity", 0.25),
      ],
      investmentSummary: {
        totalValue: 182700,
        holdingsCount: holdings.length,
        holdingsBreakdown: holdings.map((holding) =>
          buildDemoBreakdown(
            holding.id,
            holding.tickerSymbol ?? holding.securityName ?? "Holding",
            holding.institutionValue ?? 0,
            holding.securityName ?? "Demo holding",
            (holding.institutionValue ?? 0) / 182700,
          ),
        ),
      },
      recentEvents: events,
      reviewQueue,
      reviewQueueCount: reviewQueue.length,
      manualPositions: [
        {
          id: "demo-manual-home-equity",
          kind: "asset",
          type: "property",
          role: "property",
          name: "Demo Home Equity",
          value: 72000,
          isoCurrencyCode: "USD",
          valuationDate: getDemoFinanceDate(now, -14),
          valuationMethod: "demo",
          active: true,
        },
      ],
    },
    updatedAt,
  };
}

function buildDemoAccount({
  id,
  connectionId,
  name,
  type,
  subtype,
  balance,
  available,
  role,
}: {
  id: string;
  connectionId: string;
  name: string;
  type: string;
  subtype: string;
  balance: number;
  available: number | null;
  role: string;
}): FinanceAccount {
  return {
    id,
    connectionId,
    name,
    officialName: name,
    type,
    subtype,
    mask: id.slice(-4).padStart(4, "0"),
    currentBalance: balance,
    availableBalance: available,
    isoCurrencyCode: "USD",
    unofficialCurrencyCode: null,
    canonicalRole: role,
    roleOverride: null,
    updatedAt: new Date().toISOString(),
  };
}

function buildDemoHolding(
  id: string,
  accountId: string,
  securityName: string,
  tickerSymbol: string,
  quantity: number,
  price: number,
  value: number,
  costBasis: number,
): InvestmentHolding {
  return {
    id,
    accountId,
    securityName,
    tickerSymbol,
    quantity,
    institutionPrice: price,
    institutionValue: value,
    costBasis,
    isoCurrencyCode: "USD",
    updatedAt: new Date().toISOString(),
  };
}

function buildDemoEvent({
  id,
  accountId,
  accountName,
  offset,
  name,
  amount,
  cashFlowAmount,
  eventType,
  category,
  subcategory,
  income = false,
  spend = false,
  transfer = false,
  savings = false,
  investing = false,
  review = false,
  confidence,
  reason,
}: {
  id: string;
  accountId: string;
  accountName: string;
  offset: number;
  name: string;
  amount: number;
  cashFlowAmount: number;
  eventType: string;
  category: string;
  subcategory: string;
  income?: boolean;
  spend?: boolean;
  transfer?: boolean;
  savings?: boolean;
  investing?: boolean;
  review?: boolean;
  confidence: number;
  reason?: string;
}): FinanceEvent {
  const now = new Date();
  return {
    id,
    accountId,
    accountName,
    date: getDemoFinanceDate(now, offset),
    displayName: name,
    normalizedMerchant: name,
    amount,
    cashFlowAmount,
    eventType,
    primaryCategory: category,
    subcategory,
    pending: false,
    countsAsIncome: income,
    countsAsSpend: spend,
    countsAsSavings: savings,
    countsAsInvestmentContribution: investing,
    countsAsTransfer: transfer || savings || investing,
    internalTransfer: transfer || savings,
    investmentIncome: eventType === "dividend" || eventType === "interest",
    needsReview: review,
    confidence,
    classificationSource: "demo",
    classificationReason: reason ?? null,
  };
}

function buildDemoBreakdown(
  id: string,
  label: string,
  value: number,
  detail: string,
  percent: number,
): FinanceAnalyticsBreakdownItem {
  return { id, label, value, detail, count: 1, percent };
}

function buildDemoCashFlowSeries(rangeDays: number): FlowPoint[] {
  const points = getCashflowBucketCount(rangeDays);
  return Array.from({ length: points }, (_, index) => {
    const isPayPeriod = index === 1 || index === Math.max(1, points - 2);
    const income = isPayPeriod ? 4250 : index === points - 1 ? 850 : 0;
    const spending = [420, 860, 510, 610, 430, 812, 525, 690, 480, 620][index] ?? 480;
    return {
      label: `${index + 1}`,
      income,
      spending,
      net: income - spending,
    };
  });
}

function getDemoFinanceDate(baseDate: Date, offset: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getDemoFinanceIso(baseDate: Date, offset: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offset);
  return date.toISOString();
}

function applyDemoFinanceReview(
  summary: FinanceSummary | null,
  eventId: string,
  payload: Record<string, string | boolean>,
): FinanceSummary | null {
  if (!summary) return summary;
  const events = summary.events.map((event) => {
    if (event.id !== eventId) return event;
    const eventType = typeof payload.eventType === "string" ? payload.eventType : event.eventType;
    const category = typeof payload.primaryCategory === "string" ? payload.primaryCategory : event.primaryCategory;
    const subcategory = typeof payload.subcategory === "string" ? payload.subcategory : event.subcategory;
    const merchant = typeof payload.normalizedMerchant === "string" ? payload.normalizedMerchant : event.normalizedMerchant;
    const displayName = typeof payload.displayName === "string" ? payload.displayName : event.displayName;
    const impact = getDemoEventImpactFlags(eventType);
    return {
      ...event,
      eventType,
      primaryCategory: category,
      subcategory,
      normalizedMerchant: merchant,
      displayName,
      needsReview: false,
      confidence: 1,
      countsAsIncome: impact.income,
      countsAsSpend: impact.spend,
      countsAsTransfer: impact.transfer,
      countsAsInvestmentContribution: impact.investing,
      countsAsSavings: eventType === "savings_transfer",
      internalTransfer: eventType === "transfer" || eventType === "savings_transfer",
      classificationSource: "demo-review",
      classificationReason: "Demo correction saved locally. Real finance data is unchanged.",
    };
  });
  const reviewQueue = events.filter((event) => event.needsReview);
  return {
    ...summary,
    events,
    analytics: summary.analytics
      ? {
          ...summary.analytics,
          recentEvents: events,
          reviewQueue,
          reviewQueueCount: reviewQueue.length,
        }
      : summary.analytics,
  };
}

function removeConnectionFromSummary(summary: FinanceSummary | null, connectionId: string): FinanceSummary | null {
  if (!summary) return summary;

  const removedAccountIds = new Set(
    summary.accounts
      .filter((account) => account.connectionId === connectionId)
      .map((account) => account.id),
  );
  const keepAccountLinkedItem = (accountId: string | null) => !accountId || !removedAccountIds.has(accountId);

  return {
    ...summary,
    connections: summary.connections.filter((connection) => connection.id !== connectionId),
    accounts: summary.accounts.filter((account) => account.connectionId !== connectionId),
    transactions: summary.transactions.filter((transaction) => keepAccountLinkedItem(transaction.accountId)),
    holdings: summary.holdings.filter((holding) => keepAccountLinkedItem(holding.accountId)),
    events: summary.events.filter((event) => keepAccountLinkedItem(event.accountId)),
    analytics: null,
    updatedAt: Date.now(),
  };
}

function getDemoEventImpactFlags(eventType: string) {
  return {
    income: ["income", "dividend", "interest"].includes(eventType),
    spend: ["expense", "fee", "debt_payment"].includes(eventType),
    transfer: ["transfer", "credit_card_payment", "savings_transfer", "investment_withdrawal"].includes(eventType),
    investing: ["investment_contribution", "investment_trade", "asset_purchase"].includes(eventType),
  };
}

function buildDemoFinanceAssistantAnswer(question: string, dashboard: FinanceDashboard, rangeDays: number) {
  const topCategory = dashboard.categoryBreakdown[0];
  const topMerchant = dashboard.topMerchants[0];
  const lines = [
    `Demo finance view for the last ${rangeDays} days: income is ${formatMoney(dashboard.periodIncome, dashboard.currency)}, spending is ${formatMoney(dashboard.periodSpend, dashboard.currency)}, and net flow is ${formatSignedMoney(dashboard.netFlow, dashboard.currency)}.`,
    `Demo net worth is ${formatMoney(dashboard.netWorth, dashboard.currency)}, with ${formatMoney(dashboard.cash, dashboard.currency)} cash and ${formatMoney(dashboard.investments, dashboard.currency)} invested.`,
  ];
  if (topCategory) {
    lines.push(`Largest demo spend category is ${topCategory.label} at ${formatMoney(topCategory.value, dashboard.currency)}.`);
  }
  if (topMerchant) {
    lines.push(`Top demo merchant is ${topMerchant.label} at ${formatMoney(topMerchant.value, dashboard.currency)}.`);
  }
  if (dashboard.reviewCount > 0) {
    lines.push(`${dashboard.reviewCount} demo event${dashboard.reviewCount === 1 ? "" : "s"} need classification review.`);
  }
  if (/transfer|investment|brokerage|portfolio/i.test(question)) {
    lines.push("Demo transfers and investment contributions are excluded from everyday spend so the pitch can show clean classification behavior.");
  }
  return lines.join(" ");
}

let plaidScriptPromise: Promise<void> | null = null;

export default function FinancePage() {
  const { demoMode } = useJarvisState();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [status, setStatus] = useState<ActionStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [activeChart, setActiveChart] = usePersistentOption<ChartId>(
    financePreferenceKeys.chart,
    "cashflow",
    CHART_VALUES,
  );
  const [rangeKey, setRangeKey] = usePersistentOption<RangeKey>(
    financePreferenceKeys.range,
    "60",
    RANGE_VALUES,
  );
  const [breakdownMode, setBreakdownMode] = usePersistentOption<BreakdownMode>(
    financePreferenceKeys.breakdown,
    "category",
    BREAKDOWN_VALUES,
  );
  const [hidePending, setHidePending] = usePersistentBoolean(financePreferenceKeys.hidePending, true);
  const [overviewOpen, setOverviewOpen] = usePersistentBoolean(financePreferenceKeys.overviewOpen, true);
  const [chartsOpen, setChartsOpen] = usePersistentBoolean(financePreferenceKeys.chartsOpen, true);
  const [reviewOpen, setReviewOpen] = usePersistentBoolean(financePreferenceKeys.reviewOpen, true);
  const [accountsOpen, setAccountsOpen] = usePersistentBoolean(financePreferenceKeys.accountsOpen, false);
  const [transactionsOpen, setTransactionsOpen] = usePersistentBoolean(financePreferenceKeys.transactionsOpen, true);
  const [investmentsOpen, setInvestmentsOpen] = usePersistentBoolean(financePreferenceKeys.investmentsOpen, false);
  const [assistantOpen, setAssistantOpen] = usePersistentBoolean(financePreferenceKeys.assistantOpen, true);
  const [reviewEvent, setReviewEvent] = useState<FinanceEvent | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [connectionToRemove, setConnectionToRemove] = useState<FinanceConnection | null>(null);
  const [removalSourceAccount, setRemovalSourceAccount] = useState<FinanceAccount | null>(null);
  const [removingConnectionId, setRemovingConnectionId] = useState<string | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState<string | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<FinanceAssistantStatus>("idle");
  const [mobileView, setMobileView] = useState<FinanceMobileView>("overview");

  const loadSummary = useCallback(async () => {
    if (demoMode) {
      setSummary(buildDemoFinanceSummary(Number(rangeKey)));
      setMessage(null);
      setStatus("idle");
      return;
    }
    setStatus((current) => (current === "idle" ? "loading" : current));
    try {
      const query = new URLSearchParams({
        rangeDays: rangeKey,
        includePending: String(!hidePending),
      });
      const data = await fetchJson<FinanceSummary>(`/api/finance/summary?${query.toString()}`, {
        cache: "no-store",
      });
      setSummary(data);
      setMessage(null);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  }, [demoMode, hidePending, rangeKey]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const rangeDays = Number(rangeKey);
  const dashboard = useMemo(
    () => buildFinanceDashboard(summary, { rangeDays, hidePending }),
    [summary, rangeDays, hidePending],
  );
  const accountNameById = useMemo(() => {
    return new Map((summary?.accounts ?? []).map((account) => [account.id, account.name]));
  }, [summary]);
  const institutionNameByConnectionId = useMemo(() => {
    return new Map(
      (summary?.connections ?? []).map((connection) => [
        connection.id,
        connection.institutionName ?? connection.provider,
      ]),
    );
  }, [summary]);
  const connectionById = useMemo(() => {
    return new Map((summary?.connections ?? []).map((connection) => [connection.id, connection]));
  }, [summary]);
  const accountsByConnectionId = useMemo(() => {
    const map = new Map<string, FinanceAccount[]>();
    for (const account of summary?.accounts ?? []) {
      const accounts = map.get(account.connectionId) ?? [];
      accounts.push(account);
      map.set(account.connectionId, accounts);
    }
    return map;
  }, [summary]);
  const openRemoveConnection = useCallback((connection: FinanceConnection, sourceAccount?: FinanceAccount) => {
    setConnectionToRemove(connection);
    setRemovalSourceAccount(sourceAccount ?? null);
  }, []);

  const connectPlaid = useCallback(async (connectionType: PlaidConnectionType) => {
    if (demoMode) {
      setMessage("Demo mode is showing generated Plaid data. Real accounts stay hidden.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      await loadPlaidScript();
      const data = await fetchJson<PlaidLinkTokenResponse>("/api/finance/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionType }),
      });
      if (!window.Plaid) {
        throw new Error("Plaid Link did not load in this browser.");
      }
      const handler = window.Plaid.create({
        token: data.linkToken,
        onSuccess: async (publicToken, metadata) => {
          setStatus("syncing");
          await fetchJson("/api/finance/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              publicToken,
              metadata,
              connectionType: data.connectionType,
              linkSession: data.linkSession,
            }),
          });
          await loadSummary();
          setMessage(`${getConnectionTypeLabel(data.connectionType)} synced.`);
        },
        onExit: () => {
          setStatus("idle");
        },
      });
      handler.open();
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  }, [demoMode, loadSummary]);

  const syncFinance = useCallback(async () => {
    if (demoMode) {
      setSummary(buildDemoFinanceSummary(Number(rangeKey)));
      setMessage("Demo finance data refreshed. Real Plaid data is unchanged.");
      setStatus("idle");
      return;
    }
    setStatus("syncing");
    setMessage(null);
    try {
      await fetchJson("/api/finance/sync", { method: "POST" });
      await loadSummary();
      setMessage("Finance data synced.");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  }, [demoMode, loadSummary, rangeKey]);

  const removeConnection = useCallback(async (connection: FinanceConnection) => {
    const connectionName = formatConnectionName(connection);
    setRemovingConnectionId(connection.id);
    setMessage(null);

    if (demoMode) {
      setSummary((current) => removeConnectionFromSummary(current, connection.id));
      setConnectionToRemove(null);
      setRemovalSourceAccount(null);
      setRemovingConnectionId(null);
      setStatus("idle");
      setMessage(connectionName + " removed from demo data. Real Plaid data is unchanged.");
      return;
    }

    setStatus("loading");
    try {
      const data = await fetchJson<FinanceConnectionDeleteResponse>("/api/finance/connections/" + encodeURIComponent(connection.id), {
        method: "DELETE",
      });
      await loadSummary();
      setConnectionToRemove(null);
      setRemovalSourceAccount(null);
      setMessage(data.plaid?.warning
        ? connectionName + " removed locally. Plaid unlink warning: " + data.plaid.warning
        : connectionName + " removed.");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    } finally {
      setRemovingConnectionId(null);
    }
  }, [demoMode, loadSummary]);

  const saveEventReview = useCallback(async (eventId: string, payload: Record<string, string | boolean>) => {
    setReviewSaving(true);
    setMessage(null);
    if (demoMode) {
      setSummary((current) => applyDemoFinanceReview(current, eventId, payload));
      setReviewEvent(null);
      setReviewSaving(false);
      setStatus("idle");
      setMessage("Demo event reviewed. Real finance data is unchanged.");
      return;
    }
    try {
      await fetchJson(`/api/finance/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setReviewEvent(null);
      await loadSummary();
      setMessage("Finance event reviewed.");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    } finally {
      setReviewSaving(false);
    }
  }, [demoMode, loadSummary]);

  const openReviewQueue = useCallback(() => {
    setReviewEvent(dashboard.reviewQueue[0] ?? dashboard.recentEvents.find((event) => event.needsReview) ?? null);
  }, [dashboard.recentEvents, dashboard.reviewQueue]);

  const askFinanceAssistant = useCallback(async (question?: string) => {
    const input = (question ?? assistantQuestion).trim();
    if (!input) return;
    setAssistantQuestion(input);
    setAssistantStatus("loading");
    setAssistantAnswer(null);
    if (demoMode) {
      setAssistantAnswer(buildDemoFinanceAssistantAnswer(input, dashboard, rangeDays));
      setAssistantStatus("idle");
      return;
    }
    try {
      const response = await fetch("/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          domain: "finance",
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Assistant request failed with ${response.status}`);
      }
      if (typeof data?.message !== "string") {
        throw new Error("Ask a finance question here, or use the full assistant for broader requests.");
      }
      setAssistantAnswer(data.message);
      setAssistantStatus("idle");
    } catch (error) {
      setAssistantAnswer(getErrorMessage(error));
      setAssistantStatus("error");
    }
  }, [assistantQuestion, dashboard, demoMode, rangeDays]);

  const isBusy = status === "loading" || status === "syncing";
  const setup = summary?.setup;
  const chartMeta = FINANCE_CHARTS.find((chart) => chart.id === activeChart) ?? FINANCE_CHARTS[0];
  const activeBreakdown =
    breakdownMode === "category" ? dashboard.categoryBreakdown : dashboard.accountSpendBreakdown;
  const maxAccountBalance = Math.max(
    1,
    ...dashboard.accounts.map((account) => Math.abs(getAccountBalance(account))),
  );
  const latestSyncLabel = formatRelativeSync(summary?.connections);
  const hasConnections = Boolean(summary?.connections.length);
  const monthlySpendPace = formatMonthlySpendPace(dashboard.periodSpend, rangeDays, dashboard.currency);

  function selectMobileView(nextView: FinanceMobileView) {
    setMobileView(nextView);
    if (nextView === "spending") {
      setActiveChart("categories");
      setChartsOpen(true);
    }
    if (nextView === "accounts") setAccountsOpen(true);
    if (nextView === "activity") setTransactionsOpen(true);
    if (nextView === "investments") setInvestmentsOpen(true);
  }

  return (
    <div data-guide="finance-overview" className="flex flex-col gap-4 sm:gap-5">
      <section className="mobile-compact-header lg:hidden" aria-busy={isBusy}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.38em] text-cyan-200/80">Jarvis finance</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Money at a glance</h1>
          </div>
          <StatusPill
            label={status === "loading" ? "Loading" : status === "syncing" ? "Syncing" : hasConnections ? latestSyncLabel : "Not linked"}
            tone={status === "error" ? "warn" : hasConnections ? "good" : "neutral"}
          />
        </div>
        {message ? (
          <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100" role="status">
            {message}
          </div>
        ) : null}
        {setup && !setup.configured ? (
          <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
            Account sync needs Plaid configuration. Manual finance data remains available.
          </div>
        ) : null}
      </section>

      <MobileSectionNav
        label="Finance sections"
        value={mobileView}
        onChange={selectMobileView}
        options={[
          { value: "overview", label: "Snapshot" },
          { value: "spending", label: "Spending" },
          { value: "accounts", label: "Accounts", badge: dashboard.accounts.length },
          { value: "activity", label: "Activity", badge: dashboard.reviewCount || undefined },
          { value: "investments", label: "Invest" },
        ]}
      />

      {mobileView === "overview" ? (
        <section className="theme-surface mobile-card-padding rounded-[28px] p-4 lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Net worth"
              value={formatMoney(dashboard.netWorth, dashboard.currency)}
              detail="Assets minus debt"
              tone={dashboard.netWorth >= 0 ? "good" : "bad"}
            />
            <MetricCard
              label="Available cash"
              value={formatMoney(dashboard.cash, dashboard.currency)}
              detail={formatRunwayValue(dashboard.cashBufferMonths) + " runway"}
              tone="good"
            />
            <MetricCard
              label={rangeKey + "D spend"}
              value={formatMoney(dashboard.periodSpend, dashboard.currency)}
              detail={monthlySpendPace + " pace"}
              tone="warn"
            />
            <MetricCard
              label="Net flow"
              value={formatSignedMoney(dashboard.netFlow, dashboard.currency)}
              detail={"Income " + formatMoney(dashboard.periodIncome, dashboard.currency)}
              tone={dashboard.netFlow >= 0 ? "good" : "bad"}
            />
          </div>

          <div className="theme-card mt-3 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="theme-kicker text-[10px] uppercase tracking-[0.28em]">Attention</p>
                <p className="theme-text mt-1 text-sm font-semibold">
                  {dashboard.reviewCount > 0
                    ? dashboard.reviewCount + " transaction" + (dashboard.reviewCount === 1 ? "" : "s") + " need review"
                    : dashboard.insights[0]?.label ?? "Everything is classified"}
                </p>
              </div>
              {dashboard.reviewCount > 0 ? (
                <button
                  type="button"
                  onClick={openReviewQueue}
                  className="theme-button-primary shrink-0 rounded-xl px-3 py-2 text-xs font-semibold"
                >
                  Review
                </button>
              ) : null}
            </div>
            {dashboard.insights.slice(0, 2).map((insight) => (
              <div key={insight.label} className="mt-3">
                <InsightRow insight={insight} />
              </div>
            ))}
          </div>

          <div className="mt-3">
            <ConnectAccountPanel
              disabled={demoMode || isBusy || setup?.configured === false}
              hasConnections={hasConnections}
              status={status}
              onConnect={(connectionType) => void connectPlaid(connectionType)}
              onSync={() => void syncFinance()}
            />
          </div>
        </section>
      ) : null}
      <section className="glass-panel hidden overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 lg:block">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.42em] text-cyan-200/80">Jarvis finance</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-white sm:text-3xl">Financial dashboard</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                  Plaid balances, cashflow, spend, investments, review items, and finance Q&A in one workspace.
                </p>
              </div>
              {dashboard.reviewCount > 0 ? (
                <button
                  type="button"
                  onClick={openReviewQueue}
                  className="w-full rounded-full border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20 sm:w-auto"
                >
                  Review {dashboard.reviewCount}
                </button>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <StatusPill label={setup?.configured ? "Plaid ready" : "Setup needed"} tone={setup?.configured ? "good" : "warn"} />
              {setup ? <StatusPill label={setup.environment} tone="neutral" /> : null}
              {setup?.products.map((product) => <StatusPill key={product} label={product} tone="neutral" />)}
              <StatusPill label={latestSyncLabel} tone={hasConnections ? "good" : "neutral"} />
              <StatusPill label={`${dashboard.connectedInstitutionCount} connected`} tone={hasConnections ? "good" : "neutral"} />
              {demoMode ? <StatusPill label="Demo data" tone="warn" /> : null}
              {dashboard.pendingCount > 0 ? <StatusPill label={`${dashboard.pendingCount} pending hidden`} tone="warn" /> : null}
            </div>
          </div>

          <ConnectAccountPanel
            disabled={demoMode || isBusy || setup?.configured === false}
            hasConnections={hasConnections}
            status={status}
            onConnect={(connectionType) => void connectPlaid(connectionType)}
            onSync={() => void syncFinance()}
          />
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
            {message}
          </div>
        ) : null}

        {setup && !setup.configured ? (
          <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Plaid credentials are missing.</p>
            <p className="mt-2 text-amber-100/80">
              Add{" "}
              {setup.missing.map((item) => (
                <code key={item} className="mx-1 rounded bg-black/30 px-1.5 py-0.5 text-amber-50">
                  {item}
                </code>
              ))}{" "}
              to enable account linking.
            </p>
          </div>
        ) : null}
      </section>

      <CollapsiblePanel
        eyebrow="Dashboard"
        title="Command overview"
        summary={`${formatSignedMoney(dashboard.netFlow, dashboard.currency)} net flow - ${formatRunwayValue(dashboard.cashBufferMonths)} runway`}
        open={overviewOpen}
        onToggle={() => setOverviewOpen(!overviewOpen)}
        className="hidden lg:block"
        actions={
          <>
            <StatusPill label={`${dashboard.accounts.length} accounts`} tone="neutral" />
            <StatusPill label={`${dashboard.reviewCount} review`} tone={dashboard.reviewCount > 0 ? "warn" : "good"} />
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Net worth"
            value={formatMoney(dashboard.netWorth, dashboard.currency)}
            detail={`Liquid ${formatMoney(dashboard.liquidNetWorth, dashboard.currency)}`}
            tone={dashboard.netWorth >= 0 ? "good" : "bad"}
          />
          <MetricCard
            label="Cash runway"
            value={formatRunwayValue(dashboard.cashBufferMonths)}
            detail={`${formatMoney(dashboard.cash, dashboard.currency)} cash on hand`}
            tone={dashboard.cashBufferMonths === null ? "neutral" : dashboard.cashBufferMonths >= 6 ? "good" : dashboard.cashBufferMonths >= 3 ? "warn" : "bad"}
          />
          <MetricCard
            label="Invested"
            value={formatMoney(dashboard.investments, dashboard.currency)}
            detail={`${dashboard.holdings.length} holdings`}
            tone="good"
          />
          <MetricCard
            label="Debt"
            value={formatMoney(dashboard.liabilities, dashboard.currency)}
            detail="Credit and loans"
            tone={dashboard.liabilities > 0 ? "warn" : "neutral"}
          />
          <MetricCard
            label={`${rangeKey}D spend`}
            value={formatMoney(dashboard.periodSpend, dashboard.currency)}
            detail={`${monthlySpendPace} monthly pace`}
            tone="warn"
          />
          <MetricCard
            label="Net flow"
            value={formatSignedMoney(dashboard.netFlow, dashboard.currency)}
            detail={`Income ${formatMoney(dashboard.periodIncome, dashboard.currency)}`}
            tone={dashboard.netFlow >= 0 ? "good" : "bad"}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Income</p>
              <p className="mt-2 text-xl font-semibold text-emerald-100 tabular-nums">{formatMoney(dashboard.periodIncome, dashboard.currency)}</p>
              <p className="mt-1 text-xs text-zinc-400">Selected range</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Spending</p>
              <p className="mt-2 text-xl font-semibold text-rose-100 tabular-nums">{formatMoney(dashboard.periodSpend, dashboard.currency)}</p>
              <p className="mt-1 text-xs text-zinc-400">{monthlySpendPace} per month</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Savings rate</p>
              <p className="mt-2 text-xl font-semibold text-white tabular-nums">
                {dashboard.savingsRate === null ? "n/a" : formatPercent(dashboard.savingsRate)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">Income minus spend</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/80">Signals</p>
                <h2 className="mt-1 text-base font-semibold text-white">Money signals</h2>
              </div>
              <StatusPill label={status === "syncing" ? "Syncing" : "Live"} tone={status === "syncing" ? "warn" : "good"} />
            </div>
            <div className="mt-4 space-y-3">
              {dashboard.insights.length ? (
                dashboard.insights.map((insight) => <InsightRow key={insight.label} insight={insight} />)
              ) : (
                <EmptyState text="Signals appear after finance data syncs." />
              )}
            </div>
          </div>
        </div>
      </CollapsiblePanel>

      <section data-guide="finance-spending" className={(mobileView === "spending" ? "grid " : "hidden lg:grid ") + "gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]"}>
        <CollapsiblePanel
          eyebrow="Live board"
          title={chartMeta.title}
          summary={chartMeta.description}
          open={chartsOpen}
          onToggle={() => setChartsOpen(!chartsOpen)}
          actions={
            <>
              <SegmentedControl label="Range" value={rangeKey} options={RANGE_OPTIONS} onChange={setRangeKey} />
              <ToggleSwitch label="Pending" checked={!hidePending} onChange={(checked) => setHidePending(!checked)} />
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:flex sm:overflow-x-auto sm:px-1 sm:pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FINANCE_CHARTS.map((chart) => (
              <button
                key={chart.id}
                type="button"
                onClick={() => setActiveChart(chart.id)}
                className={
                  "min-h-10 touch-manipulation rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition active:scale-[0.98] sm:shrink-0 sm:tracking-[0.22em] " +
                  (activeChart === chart.id
                    ? "border-cyan-300/70 bg-cyan-300/20 text-white shadow-[0_10px_30px_rgba(34,211,238,0.12)]"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:text-white")
                }
              >
                {chart.label}
              </button>
            ))}
          </div>

          {activeChart === "categories" ? (
            <div className="mt-4">
              <SegmentedControl label="Group" value={breakdownMode} options={BREAKDOWN_OPTIONS} onChange={setBreakdownMode} />
            </div>
          ) : null}

          <div className="mt-5">
            {renderFinanceChart({
              chartId: activeChart,
              dashboard,
              currency: dashboard.currency,
              breakdownItems: activeBreakdown,
            })}
          </div>
        </CollapsiblePanel>

        <div className="hidden space-y-5 lg:block xl:sticky xl:top-6 xl:self-start">
          <CollapsiblePanel
            eyebrow="Review"
            title="Classification queue"
            summary={dashboard.reviewCount > 0 ? `${dashboard.reviewCount} events need review` : "Everything classified"}
            open={reviewOpen}
            onToggle={() => setReviewOpen(!reviewOpen)}
            actions={
              <button
                type="button"
                onClick={openReviewQueue}
                disabled={dashboard.reviewCount === 0}
                className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Open queue
              </button>
            }
          >
            <ReviewQueuePanel
              queue={dashboard.reviewQueue}
              currency={dashboard.currency}
              onOpen={openReviewQueue}
              onSelectEvent={setReviewEvent}
            />
          </CollapsiblePanel>

          <CollapsiblePanel
            eyebrow="Assistant"
            title="Ask Jarvis"
            summary="Finance answers use the Plaid analytics layer"
            open={assistantOpen}
            onToggle={() => setAssistantOpen(!assistantOpen)}
          >
            <FinanceAssistantPanel
              question={assistantQuestion}
              answer={assistantAnswer}
              status={assistantStatus}
              disabled={isBusy && !demoMode}
              onQuestionChange={setAssistantQuestion}
              onAsk={(question) => void askFinanceAssistant(question)}
            />
          </CollapsiblePanel>
        </div>
      </section>

      <section data-guide="finance-accounts" className={(mobileView === "accounts" || mobileView === "activity" ? "grid " : "hidden lg:grid ") + "grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]"}>
        {mobileView === "accounts" ? (
          <div className="lg:hidden">
            <ConnectAccountPanel
              disabled={demoMode || isBusy || setup?.configured === false}
              hasConnections={hasConnections}
              status={status}
              onConnect={(connectionType) => void connectPlaid(connectionType)}
              onSync={() => void syncFinance()}
            />
          </div>
        ) : null}
        <CollapsiblePanel
          eyebrow="Accounts"
          title="Balance stack"
          summary={formatDateTime(summary?.updatedAt)}
          open={accountsOpen}
          onToggle={() => setAccountsOpen(!accountsOpen)}
          className={(mobileView === "accounts" ? "" : "hidden ") + "lg:block"}
          actions={<StatusPill label={`${dashboard.accounts.length} accounts`} tone="neutral" />}
        >
          <div className="space-y-3">
            {dashboard.accounts.length ? (
              dashboard.accounts.map((account) => {
                const connection = connectionById.get(account.connectionId);
                return (
                  <AccountRow
                    key={account.id}
                    account={account}
                    currency={dashboard.currency}
                    institutionName={institutionNameByConnectionId.get(account.connectionId)}
                    maxBalance={maxAccountBalance}
                    connection={connection}
                    removingConnection={removingConnectionId === account.connectionId}
                    onRemoveConnection={openRemoveConnection}
                  />
                );
              })
            ) : (
              <EmptyState text="Connected accounts will appear here." />
            )}
          </div>
          {(summary?.connections ?? []).length ? (
            <div className="mt-5 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Plaid</p>
                  <h3 className="mt-1 text-sm font-semibold text-white">Connections</h3>
                </div>
                <StatusPill label={`${dashboard.connectedInstitutionCount} active`} tone="good" />
              </div>
              <div className="mt-3 space-y-3">
                {summary?.connections.map((connection) => (
                  <ConnectionRow
                    key={connection.id}
                    connection={connection}
                    accounts={accountsByConnectionId.get(connection.id) ?? []}
                    removing={removingConnectionId === connection.id}
                    onRemove={openRemoveConnection}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {dashboard.manualPositions.length ? (
            <div className="mt-5 border-t border-white/10 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Manual</p>
                  <h3 className="mt-1 text-sm font-semibold text-white">Private positions</h3>
                </div>
                <StatusPill label={`${dashboard.manualPositions.length} tracked`} tone="neutral" />
              </div>
              <div className="mt-3 space-y-3">
                {dashboard.manualPositions.map((position) => (
                  <ManualPositionRow key={position.id} position={position} currency={dashboard.currency} />
                ))}
              </div>
            </div>
          ) : null}
        </CollapsiblePanel>

        <CollapsiblePanel
          eyebrow="Transactions"
          title="Recent flow"
          summary={`${dashboard.recentEvents.length || dashboard.filteredTransactions.length} visible`}
          open={transactionsOpen}
          onToggle={() => setTransactionsOpen(!transactionsOpen)}
          className={(mobileView === "activity" ? "flex " : "hidden ") + "min-h-0 flex-col lg:flex xl:h-full"}
          bodyClassName="min-h-0 xl:flex xl:flex-1 xl:flex-col"
          actions={
            <>
              {dashboard.reviewCount > 0 ? <StatusPill label={`${dashboard.reviewCount} review`} tone="warn" /> : null}
              {dashboard.pendingCount > 0 ? <StatusPill label={`${dashboard.pendingCount} pending`} tone="warn" /> : null}
            </>
          }
        >
          <div className="space-y-3 overflow-y-auto pr-1 sm:max-h-[70vh] xl:min-h-0 xl:flex-1 xl:max-h-none xl:overscroll-contain">
            {dashboard.recentEvents.length ? (
              dashboard.recentEvents.map((event) => (
                <FinancialEventRow key={event.id} event={event} currency={dashboard.currency} onReview={setReviewEvent} />
              ))
            ) : dashboard.filteredTransactions.length ? (
              dashboard.filteredTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  accountName={transaction.accountId ? accountNameById.get(transaction.accountId) : undefined}
                  currency={dashboard.currency}
                />
              ))
            ) : (
              <EmptyState text="Synced Plaid transactions will appear here." />
            )}
          </div>
        </CollapsiblePanel>
      </section>

      <CollapsiblePanel
        eyebrow="Investments"
        title="Holdings command"
        summary={`${formatMoney(dashboard.investments, dashboard.currency)} across ${dashboard.holdings.length} holdings`}
        open={investmentsOpen}
        onToggle={() => setInvestmentsOpen(!investmentsOpen)}
        className={(mobileView === "investments" ? "" : "hidden ") + "lg:block"}
        actions={
          <>
            <StatusPill label={formatMoney(dashboard.investments, dashboard.currency)} tone="good" />
            <StatusPill label={`${dashboard.holdings.length} holdings`} tone="neutral" />
          </>
        }
      >
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <AllocationChart
            items={dashboard.investmentBreakdown}
            totalLabel={formatMoney(sumBreakdown(dashboard.investmentBreakdown), dashboard.currency)}
            emptyText="Investment holdings will appear after a Plaid investment sync."
          />
          <div className="space-y-3">
            {dashboard.holdings.length ? (
              dashboard.holdings.map((holding) => (
                <HoldingRow key={holding.id} holding={holding} currency={dashboard.currency} />
              ))
            ) : (
              <EmptyState text="No investment holdings synced yet." />
            )}
          </div>
        </div>
      </CollapsiblePanel>

      {reviewEvent ? (
        <ReviewEventModal
          key={reviewEvent.id}
          event={reviewEvent}
          queue={dashboard.reviewQueue}
          currency={dashboard.currency}
          saving={reviewSaving}
          onClose={() => setReviewEvent(null)}
          onSelectEvent={setReviewEvent}
          onSave={(payload) => void saveEventReview(reviewEvent.id, payload)}
        />
      ) : null}

      {connectionToRemove ? (
        <RemoveConnectionModal
          connection={connectionToRemove}
          sourceAccount={removalSourceAccount}
          linkedAccounts={accountsByConnectionId.get(connectionToRemove.id) ?? []}
          removing={removingConnectionId === connectionToRemove.id}
          onCancel={() => {
            if (!removingConnectionId) {
              setConnectionToRemove(null);
              setRemovalSourceAccount(null);
            }
          }}
          onConfirm={() => void removeConnection(connectionToRemove)}
        />
      ) : null}
    </div>
  );
}

function ConnectAccountPanel({
  disabled,
  hasConnections,
  status,
  onConnect,
  onSync,
}: {
  disabled: boolean;
  hasConnections: boolean;
  status: ActionStatus;
  onConnect: (connectionType: PlaidConnectionType) => void;
  onSync: () => void;
}) {
  const syncing = status === "syncing";

  if (hasConnections) {
    return (
      <div className="w-full xl:w-auto">
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 sm:flex-row xl:justify-end">
          <button
            type="button"
            onClick={onSync}
            disabled={disabled}
            className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {syncing ? "Syncing" : "Sync"}
          </button>
          {PLAID_CONNECTION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onConnect(option.value)}
              disabled={disabled}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200 transition hover:border-emerald-200/50 hover:bg-emerald-300/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              Add {option.value === "bank" ? "bank" : "investment"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/25 p-4 xl:w-[520px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-zinc-500">Connect account</p>
          <p className="mt-1 text-sm font-semibold text-white">Choose a Plaid account type.</p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={disabled || !hasConnections}
          className="shrink-0 rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {syncing ? "Syncing" : "Sync"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PLAID_CONNECTION_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onConnect(option.value)}
            disabled={disabled}
            className="rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-emerald-200/45 hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-white">{option.label}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">{option.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {option.products.map((product) => (
                <span key={`${option.value}-${product}`} className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {product}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CollapsiblePanel({
  eyebrow,
  title,
  summary,
  open,
  onToggle,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  eyebrow: string;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`glass-panel rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onToggle} aria-expanded={open} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-sm font-semibold text-zinc-300 transition group-hover:border-cyan-300/40 group-hover:text-white">
            {open ? "-" : "+"}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.32em] text-zinc-500">{eyebrow}</span>
            <span className="mt-1 block truncate text-lg font-semibold text-white sm:text-xl">{title}</span>
            {summary ? <span className="mt-1 block text-sm leading-5 text-zinc-400">{summary}</span> : null}
          </span>
        </button>
        {actions ? <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
      </div>
      {open ? <div className={`mt-5 ${bodyClassName}`}>{children}</div> : null}
    </section>
  );
}

function ReviewQueuePanel({
  queue,
  currency,
  onOpen,
  onSelectEvent,
}: {
  queue: FinanceEvent[];
  currency: string;
  onOpen: () => void;
  onSelectEvent: (event: FinanceEvent) => void;
}) {
  const visibleQueue = queue.slice(0, 6);
  if (!visibleQueue.length) {
    return <EmptyState text="No events need review right now." />;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {visibleQueue.map((event) => {
          const amount = event.cashFlowAmount || event.amount;
          const isPositive = amount > 0 && !event.countsAsSpend;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event)}
              className="w-full rounded-2xl border border-white/10 bg-black/25 p-3 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{event.normalizedMerchant ?? event.displayName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(event.date)}{event.accountName ? ` - ${event.accountName}` : ""}
                  </p>
                </div>
                <p className={(isPositive ? "text-emerald-200" : "text-rose-200") + " shrink-0 text-sm font-semibold tabular-nums"}>
                  {formatMoney(Math.abs(amount), currency)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <EventBadge eventType={event.eventType} />
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {titleCase(event.primaryCategory)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {Math.round(event.confidence * 100)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {queue.length > visibleQueue.length ? (
        <button
          type="button"
          onClick={onOpen}
          className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200 transition hover:border-cyan-300/45 hover:text-white"
        >
          View all {queue.length}
        </button>
      ) : null}
    </div>
  );
}

function FinanceAssistantPanel({
  question,
  answer,
  status,
  disabled,
  onQuestionChange,
  onAsk,
}: {
  question: string;
  answer: string | null;
  status: FinanceAssistantStatus;
  disabled: boolean;
  onQuestionChange: (question: string) => void;
  onAsk: (question?: string) => void;
}) {
  const loading = status === "loading";
  const handleSubmit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    onAsk();
  };

  return (
    <div className="space-y-4">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
        <input
          value={question}
          onChange={(changeEvent) => onQuestionChange(changeEvent.target.value)}
          placeholder="Ask about spending, income, transfers, net worth..."
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/55"
        />
        <button
          type="submit"
          disabled={disabled || loading || !question.trim()}
          className="rounded-full bg-cyan-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Thinking" : "Ask"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {FINANCE_ASSISTANT_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onAsk(prompt)}
            disabled={disabled || loading}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-zinc-300 transition hover:border-cyan-300/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {prompt}
          </button>
        ))}
      </div>
      {answer ? (
        <div className={(status === "error" ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-white/10 bg-black/25 text-zinc-200") + " whitespace-pre-wrap rounded-2xl border p-4 text-sm leading-6"}>
          {answer}
        </div>
      ) : null}
      <a
        href="/v2/assistant"
        className="inline-flex rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 transition hover:border-white/30 hover:text-white"
      >
        Full assistant
      </a>
    </div>
  );
}

function renderFinanceChart({
  chartId,
  dashboard,
  currency,
  breakdownItems,
}: {
  chartId: ChartId;
  dashboard: FinanceDashboard;
  currency: string;
  breakdownItems: BreakdownItem[];
}) {
  switch (chartId) {
    case "categories":
      return <BreakdownBars items={breakdownItems} currency={currency} emptyText="No spend breakdown for this range." />;
    case "accounts":
      return (
        <AllocationChart
          items={dashboard.accountTypeBreakdown}
          totalLabel={formatMoney(sumBreakdown(dashboard.accountTypeBreakdown), currency)}
          emptyText="Linked account balances will render here."
        />
      );
    case "investments":
      return (
        <AllocationChart
          items={dashboard.investmentBreakdown}
          totalLabel={formatMoney(sumBreakdown(dashboard.investmentBreakdown), currency)}
          emptyText="Investment holdings will render here."
        />
      );
    case "merchants":
      return <BreakdownBars items={dashboard.topMerchants} currency={currency} emptyText="No merchant spend for this range." />;
    default:
      return <CashflowChart series={dashboard.flowSeries} currency={currency} />;
  }
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  const toneClass =
    tone === "good"
      ? "from-emerald-300/18 to-cyan-300/8 text-emerald-100"
      : tone === "warn"
        ? "from-amber-300/18 to-white/5 text-amber-100"
        : tone === "bad"
          ? "from-rose-300/18 to-white/5 text-rose-100"
          : "from-cyan-300/12 to-white/5 text-white";
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${toneClass} p-3 sm:p-4`}>
      <p className="text-[9px] uppercase tracking-[0.22em] text-zinc-500 sm:text-[10px] sm:tracking-[0.28em]">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 truncate text-[11px] text-zinc-400 sm:text-xs">{detail}</p>
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 rounded-[20px] border border-white/10 bg-black/20 p-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 sm:pt-0">{label}</span>
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 sm:flex sm:overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            className={
              "min-h-9 touch-manipulation rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition active:scale-[0.97] sm:shrink-0 sm:tracking-[0.16em] " +
              (option.value === value
                ? "bg-cyan-300 text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,0.18)]"
                : "text-zinc-400 hover:bg-white/10 hover:text-white")
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 w-full cursor-pointer select-none items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400 sm:w-auto">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        className={
          "relative h-5 w-9 shrink-0 rounded-full border transition " +
          (checked ? "border-cyan-300/50 bg-cyan-300/30" : "border-white/10 bg-white/5")
        }
      >
        <span
          className={
            "absolute left-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white transition " +
            (checked ? "translate-x-4" : "translate-x-0")
          }
        />
      </span>
    </label>
  );
}

function CashflowChart({ series, currency }: { series: FlowPoint[]; currency: string }) {
  const defaultIndex = Math.max(0, series.length - 1);
  const [requestedActiveIndex, setActiveIndex] = useState(defaultIndex);
  const activeIndex = Math.min(Math.max(0, requestedActiveIndex), defaultIndex);

  const width = 720;
  const height = 280;
  const padding = 28;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const maxFlow = Math.max(1, ...series.flatMap((point) => [point.income, point.spending]));
  const barSlot = series.length ? chartWidth / series.length : chartWidth;
  const barWidth = Math.max(10, Math.min(34, barSlot * 0.26));
  const cumulative = series.reduce<number[]>((points, point) => {
    const previous = points.at(-1) ?? 0;
    points.push(previous + point.net);
    return points;
  }, []);
  const minCumulative = Math.min(0, ...cumulative);
  const maxCumulative = Math.max(0, ...cumulative);
  const cumulativeRange = Math.max(1, maxCumulative - minCumulative);
  const cumulativePath = cumulative
    .map((value, index) => {
      const x = padding + barSlot * index + barSlot / 2;
      const y = padding + ((maxCumulative - value) / cumulativeRange) * chartHeight;
      return (index === 0 ? "M" : "L") + " " + x.toFixed(1) + " " + y.toFixed(1);
    })
    .join(" ");
  const activePoint = series[activeIndex] ?? series[defaultIndex];
  const activeCumulative = cumulative[activeIndex] ?? 0;
  const activeX = padding + barSlot * activeIndex + barSlot / 2;
  const activeY = padding + ((maxCumulative - activeCumulative) / cumulativeRange) * chartHeight;

  if (!series.some((point) => point.income || point.spending)) {
    return <EmptyState text="Plaid cashflow will render once transactions sync." />;
  }

  return (
    <div className="min-w-0">
      {activePoint ? (
        <div className="mb-3 grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
          <div className="border-r border-white/10 px-3 py-2">
            <p className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">{activePoint.label}</p>
            <p className={(activePoint.net >= 0 ? "text-emerald-100" : "text-rose-100") + " mt-1 truncate text-sm font-semibold tabular-nums sm:text-base"}>{formatSignedMoney(activePoint.net, currency)}</p>
          </div>
          <div className="border-r border-white/10 px-3 py-2">
            <p className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">Income</p>
            <p className="mt-1 truncate text-sm font-semibold text-emerald-100 tabular-nums sm:text-base">{formatMoney(activePoint.income, currency)}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">Spend</p>
            <p className="mt-1 truncate text-sm font-semibold text-amber-100 tabular-nums sm:text-base">{formatMoney(activePoint.spending, currency)}</p>
          </div>
        </div>
      ) : null}
      <div className="rounded-[24px] border border-white/10 bg-black/20 p-2 sm:p-3">
        <svg viewBox={"0 0 " + width + " " + height} className="h-[220px] w-full touch-pan-x select-none sm:h-[280px]">
          <defs>
            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={width} height={height} rx="26" fill="rgba(0,0,0,0.18)" />
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = padding + chartHeight * tick;
            return (
              <line
                key={"cashflow-grid-" + tick}
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}
          {series.map((point, index) => {
            const xCenter = padding + barSlot * index + barSlot / 2;
            const incomeHeight = (point.income / maxFlow) * chartHeight;
            const spendHeight = (point.spending / maxFlow) * chartHeight;
            const active = index === activeIndex;
            return (
              <g key={"cashflow-" + point.label + "-" + index} opacity={active ? 1 : 0.58}>
                <rect
                  x={xCenter - barWidth - 2}
                  y={height - padding - incomeHeight}
                  width={barWidth}
                  height={Math.max(point.income ? 3 : 0, incomeHeight)}
                  rx="7"
                  fill="url(#incomeGradient)"
                />
                <rect
                  x={xCenter + 2}
                  y={height - padding - spendHeight}
                  width={barWidth}
                  height={Math.max(point.spending ? 3 : 0, spendHeight)}
                  rx="7"
                  fill="url(#spendGradient)"
                />
              </g>
            );
          })}
          {cumulativePath ? (
            <path
              d={cumulativePath}
              fill="none"
              stroke="#f8fafc"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              opacity="0.86"
            />
          ) : null}
          {activePoint ? (
            <g pointerEvents="none">
              <line x1={activeX} y1={padding} x2={activeX} y2={height - padding} stroke="rgba(103,232,249,0.42)" strokeDasharray="5 7" />
              <circle cx={activeX} cy={activeY} r="6" fill="#f8fafc" stroke="#67e8f9" strokeWidth="3" />
            </g>
          ) : null}
          {series.map((point, index) => (
            <rect
              key={"cashflow-hit-" + point.label + "-" + index}
              x={padding + barSlot * index}
              y={padding}
              width={barSlot}
              height={chartHeight}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={"Show " + point.label + " cashflow"}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" || keyEvent.key === " ") setActiveIndex(index);
              }}
              onPointerEnter={() => setActiveIndex(index)}
              onPointerDown={() => setActiveIndex(index)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.24em] text-zinc-400">
          <LegendDot color="#34d399" label="Income" />
          <LegendDot color="#fb7185" label="Spend" />
          <LegendDot color="#f8fafc" label="Net path" />
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500 sm:mx-0 sm:flex sm:max-w-full sm:overflow-x-auto sm:px-1 sm:pb-1 sm:tracking-[0.2em] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {series.map((point, index) => (
            <button
              key={"cashflow-label-" + point.label + "-" + index}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-pressed={index === activeIndex}
              className={
                "min-h-9 touch-manipulation rounded-full border px-2.5 py-1 transition active:scale-[0.96] sm:shrink-0 " +
                (index === activeIndex ? "border-cyan-300/50 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/5 hover:border-white/25 hover:text-white")
              }
            >
              {point.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ChartStat label="Income" value={formatMoney(sumSeries(series, "income"), currency)} tone="good" />
        <ChartStat label="Spend" value={formatMoney(sumSeries(series, "spending"), currency)} tone="warn" />
        <ChartStat label="Net" value={formatSignedMoney(sumSeries(series, "net"), currency)} tone={sumSeries(series, "net") >= 0 ? "good" : "bad"} />
      </div>
    </div>
  );
}

function BreakdownBars({
  items,
  currency,
  emptyText,
}: {
  items: BreakdownItem[];
  currency: string;
  emptyText: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((item) => item.value));
  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];

  if (!items.length) return <EmptyState text={emptyText} />;
  return (
    <div className="space-y-3">
      {selectedItem ? (
        <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selectedItem.color }} />
                <p className="truncate text-sm font-semibold text-white">{selectedItem.label}</p>
              </div>
              <p className="mt-1 text-xs text-cyan-100/70">{selectedItem.detail}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-white tabular-nums">{formatMoney(selectedItem.value, currency)}</p>
              <p className="mt-1 text-[11px] text-cyan-100/70">{formatPercent(selectedItem.percent)}</p>
            </div>
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        {items.map((item) => {
          const active = item.id === selectedItem?.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              onPointerEnter={() => setSelectedId(item.id)}
              onFocus={() => setSelectedId(item.id)}
              aria-pressed={active}
              className={
                "w-full touch-manipulation rounded-2xl border p-4 text-left transition active:scale-[0.995] " +
                (active
                  ? "border-cyan-300/45 bg-cyan-300/12 shadow-[0_16px_40px_rgba(34,211,238,0.08)]"
                  : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/[0.07]")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white tabular-nums">{formatMoney(item.value, currency)}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{formatPercent(item.percent)}</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full transition-[width,opacity] duration-300"
                  style={{ width: Math.max(3, (item.value / max) * 100) + "%", backgroundColor: item.color, opacity: active ? 1 : 0.58 }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AllocationChart({
  items,
  totalLabel,
  emptyText,
}: {
  items: BreakdownItem[];
  totalLabel: string;
  emptyText: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const total = sumBreakdown(items);
  const circumference = 2 * Math.PI * 42;
  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];

  if (!items.length || total <= 0) return <EmptyState text={emptyText} />;

  const segments = items.reduce<Array<{ item: BreakdownItem; segment: number; dashOffset: number }>>(
    (accumulator, item) => {
      const previousOffset = accumulator.reduce((sum, entry) => sum + entry.segment, 0);
      const segment = (item.value / total) * circumference;
      return [...accumulator, { item, segment, dashOffset: -previousOffset }];
    },
    [],
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[210px_minmax(0,1fr)] md:items-center lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="relative mx-auto h-[210px] w-[210px] sm:h-[230px] sm:w-[230px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90 touch-manipulation select-none">
          <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" />
          {segments.map(({ item, segment, dashOffset }) => {
            const active = item.id === selectedItem?.id;
            return (
              <circle
                key={item.id}
                cx="60"
                cy="60"
                r="42"
                fill="none"
                stroke={item.color}
                strokeWidth={active ? "19" : "14"}
                strokeLinecap="round"
                strokeDasharray={segment + " " + (circumference - segment)}
                strokeDashoffset={dashOffset}
                opacity={active ? 1 : 0.52}
                onPointerEnter={() => setSelectedId(item.id)}
                onPointerDown={() => setSelectedId(item.id)}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="max-w-[150px] px-3">
            <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">{selectedItem ? "Selected" : "Total"}</p>
            <p className="mt-1 truncate text-lg font-semibold text-white tabular-nums sm:text-xl">
              {selectedItem ? selectedItem.label : totalLabel}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {selectedItem ? formatPercent(selectedItem.percent) : totalLabel}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const active = item.id === selectedItem?.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              onPointerEnter={() => setSelectedId(item.id)}
              onFocus={() => setSelectedId(item.id)}
              aria-pressed={active}
              className={
                "flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.995] " +
                (active
                  ? "border-cyan-300/45 bg-cyan-300/12 shadow-[0_16px_40px_rgba(34,211,238,0.08)]"
                  : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/[0.07]")
              }
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <p className="truncate text-sm font-semibold text-white">{item.label}</p>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500">{item.detail}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-white tabular-nums">{formatPercent(item.percent)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChartStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const color =
    tone === "good"
      ? "text-emerald-100"
      : tone === "warn"
        ? "text-amber-100"
        : tone === "bad"
          ? "text-rose-100"
          : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function InsightRow({ insight }: { insight: { label: string; value: string; tone: Tone } }) {
  const toneClass =
    insight.tone === "good"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : insight.tone === "warn"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
        : insight.tone === "bad"
          ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
          : "border-white/10 bg-black/25 text-white";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.28em] opacity-70">{insight.label}</p>
      <p className="mt-1 text-sm font-semibold">{insight.value}</p>
    </div>
  );
}

function ConnectionRow({
  connection,
  accounts,
  removing,
  onRemove,
}: {
  connection: FinanceConnection;
  accounts: FinanceAccount[];
  removing: boolean;
  onRemove: (connection: FinanceConnection) => void;
}) {
  const accountPreview = accounts.length
    ? accounts.slice(0, 4).map(formatAccountName).join(" / ")
    : "No synced accounts loaded";
  const remainingCount = Math.max(0, accounts.length - 4);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{formatConnectionName(connection)}</p>
          <p className="mt-1 text-xs text-zinc-500">{connection.products.join(" / ") || "accounts"}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
          <StatusPill label={accounts.length + " account" + (accounts.length === 1 ? "" : "s")} tone="neutral" />
          <StatusPill label={connection.status} tone={connection.status === "active" ? "good" : "warn"} />
          <button
            type="button"
            onClick={() => onRemove(connection)}
            disabled={removing}
            className="rounded-full border border-rose-300/25 bg-rose-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-200/60 hover:bg-rose-300/18 disabled:cursor-wait disabled:opacity-55"
          >
            {removing ? "Removing" : "Remove"}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-400">
        {accountPreview}{remainingCount > 0 ? " / +" + remainingCount + " more" : ""}
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        {connection.lastSyncedAt ? "Last sync " + formatDateTime(connection.lastSyncedAt) : "Not synced yet"}
      </p>
    </div>
  );
}

function AccountRow({
  account,
  institutionName,
  maxBalance,
  currency,
  connection,
  removingConnection,
  onRemoveConnection,
}: {
  account: FinanceAccount;
  institutionName?: string;
  maxBalance: number;
  currency: string;
  connection?: FinanceConnection;
  removingConnection: boolean;
  onRemoveConnection: (connection: FinanceConnection, sourceAccount: FinanceAccount) => void;
}) {
  const balance = getAccountBalance(account);
  const contribution = accountContribution(account);
  const meta = getAccountTypeMeta(getAccountRole(account));
  const percent = Math.min(100, (Math.abs(balance) / maxBalance) * 100);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{account.name}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {[institutionName, meta.label, account.subtype, account.mask ? "xx" + account.mask : undefined].filter(Boolean).join(" - ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-white tabular-nums">{formatMoney(contribution, currency)}</p>
          {account.availableBalance !== null && account.availableBalance !== account.currentBalance ? (
            <p className="mt-1 text-[11px] text-zinc-500">{formatMoney(account.availableBalance, currency)} avail</p>
          ) : null}
          {connection ? (
            <button
              type="button"
              onClick={() => onRemoveConnection(connection, account)}
              disabled={removingConnection}
              className="mt-2 rounded-full border border-rose-300/20 bg-rose-300/8 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:border-rose-200/55 hover:bg-rose-300/15 disabled:cursor-wait disabled:opacity-55"
            >
              {removingConnection ? "Removing" : "Remove link"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full" style={{ width: Math.max(4, percent) + "%", backgroundColor: meta.color }} />
      </div>
    </div>
  );
}

function TransactionRow({
  transaction,
  accountName,
  currency,
}: {
  transaction: FinanceTransaction;
  accountName?: string;
  currency: string;
}) {
  const isOutflow = transaction.amount > 0;
  const category = getTransactionCategory(transaction);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{transaction.merchantName ?? transaction.name}</p>
            {transaction.pending ? (
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                Pending
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDate(transaction.date)}
            {accountName ? ` - ${accountName}` : ""}
          </p>
          <p className="mt-2 truncate text-xs text-zinc-400">{category}</p>
        </div>
        <p className={(isOutflow ? "text-rose-200" : "text-emerald-200") + " shrink-0 text-sm font-semibold tabular-nums"}>
          {isOutflow ? "-" : "+"}
          {formatMoney(Math.abs(transaction.amount), currency)}
        </p>
      </div>
    </div>
  );
}

function FinancialEventRow({
  event,
  currency,
  onReview,
}: {
  event: FinanceEvent;
  currency: string;
  onReview: (event: FinanceEvent) => void;
}) {
  const amount = event.cashFlowAmount || event.amount;
  const isPositive = amount > 0 && !event.countsAsSpend;
  const isTransfer = event.countsAsTransfer || event.internalTransfer;
  const amountClass = isTransfer ? "text-cyan-200" : isPositive ? "text-emerald-200" : "text-rose-200";
  const prefix = isTransfer ? "" : isPositive ? "+" : "-";
  const category = [titleCase(event.primaryCategory), event.subcategory ? titleCase(event.subcategory) : undefined]
    .filter(Boolean)
    .join(" / ");
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{event.normalizedMerchant ?? event.displayName}</p>
            <EventBadge eventType={event.eventType} />
            {event.pending ? (
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                Pending
              </span>
            ) : null}
            {event.needsReview ? (
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                Review
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDate(event.date)}
            {event.accountName ? ` - ${event.accountName}` : ""}
          </p>
          <p className="mt-2 truncate text-xs text-zinc-400">{category}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`${amountClass} text-sm font-semibold tabular-nums`}>
            {isTransfer ? "" : prefix}
            {formatMoney(Math.abs(amount), currency)}
          </p>
          <button
            type="button"
            onClick={() => onReview(event)}
            className="mt-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition hover:border-cyan-300/50 hover:text-white"
          >
            {event.needsReview ? "Review" : "Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventBadge({ eventType }: { eventType: string }) {
  const label = titleCase(eventType);
  const tone = eventType.includes("transfer") || eventType.includes("payment") ? "cyan" : eventType === "income" ? "emerald" : eventType === "expense" || eventType === "fee" ? "rose" : "zinc";
  const classes =
    tone === "cyan"
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : tone === "emerald"
        ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
        : tone === "rose"
          ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
          : "border-white/10 bg-white/5 text-zinc-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] ${classes}`}>
      {label}
    </span>
  );
}

function RemoveConnectionModal({
  connection,
  sourceAccount,
  linkedAccounts,
  removing,
  onCancel,
  onConfirm,
}: {
  connection: FinanceConnection;
  sourceAccount?: FinanceAccount | null;
  linkedAccounts: FinanceAccount[];
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const connectionName = formatConnectionName(connection);
  const title = sourceAccount
    ? "Remove connection for " + formatAccountName(sourceAccount) + "?"
    : "Remove " + connectionName + "?";

  return (
    <div
      className="theme-overlay fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-md sm:items-center sm:px-4 sm:py-6"
      onClick={removing ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-remove-connection-title"
        className="theme-modal mobile-modal-safe-area w-full max-w-lg overflow-hidden rounded-t-3xl p-5 sm:rounded-3xl"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.32em] text-rose-200/80">Remove connection</p>
            <h3 id="finance-remove-connection-title" className="mt-2 text-xl font-semibold text-white">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              This removes the Plaid link for {connectionName} and deletes synced accounts, transactions, holdings, review events, and connection-specific rules from Jarvis.
            </p>
          </div>
          <StatusPill label="Confirm" tone="bad" />
        </div>

        {linkedAccounts.length ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Accounts on this link</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {linkedAccounts.slice(0, 8).map((account) => (
                <span key={account.id} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-zinc-200">
                  {formatAccountName(account)}
                </span>
              ))}
              {linkedAccounts.length > 8 ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-zinc-400">
                  +{linkedAccounts.length - 8} more
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm leading-6 text-rose-50/90">
          Manual positions stay in place. This cannot be undone from Jarvis after you confirm.
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={removing}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={removing}
            className="rounded-full border border-rose-300/35 bg-rose-300/14 px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-rose-50 transition hover:border-rose-200/70 hover:bg-rose-300/22 disabled:cursor-wait disabled:opacity-60"
          >
            {removing ? "Removing" : "Remove connection"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewEventModal({
  event,
  queue,
  currency,
  saving,
  onClose,
  onSelectEvent,
  onSave,
}: {
  event: FinanceEvent;
  queue: FinanceEvent[];
  currency: string;
  saving: boolean;
  onClose: () => void;
  onSelectEvent: (event: FinanceEvent) => void;
  onSave: (payload: Record<string, string | boolean>) => void;
}) {
  const [eventType, setEventType] = useState(event.eventType);
  const [primaryCategory, setPrimaryCategory] = useState(event.primaryCategory);
  const [subcategory, setSubcategory] = useState(event.subcategory ?? "");
  const [normalizedMerchant, setNormalizedMerchant] = useState(event.normalizedMerchant ?? event.displayName);
  const [displayName, setDisplayName] = useState(event.displayName);

  const queueItems = useMemo(() => {
    const items = queue.some((item) => item.id === event.id) ? queue : [event, ...queue];
    return items.slice(0, 80);
  }, [event, queue]);
  const categoryOptions = useMemo(() => {
    return Array.from(new Set([primaryCategory, event.primaryCategory, ...SUGGESTED_FINANCE_CATEGORIES].filter(Boolean)));
  }, [event.primaryCategory, primaryCategory]);
  const eventTypeOptions = useMemo(() => {
    return Array.from(new Set([eventType, event.eventType, ...FINANCIAL_EVENT_TYPE_OPTIONS].filter(Boolean)));
  }, [event.eventType, eventType]);
  const amount = event.cashFlowAmount || event.amount;
  const isPositive = amount > 0 && !event.countsAsSpend;
  const selectedImpact = getEventTypeImpact(eventType);

  const handlePreset = (preset: (typeof REVIEW_PRESETS)[number]) => {
    setEventType(preset.eventType);
    setPrimaryCategory(preset.primaryCategory);
    setSubcategory(preset.subcategory);
  };

  const handleSubmit = (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    onSave({
      eventType,
      primaryCategory,
      subcategory,
      normalizedMerchant,
      displayName,
      needsReview: false,
    });
  };

  return (
    <div className="theme-overlay fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-md sm:items-center sm:px-4 sm:py-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-review-title"
        className="theme-modal mobile-modal-safe-area grid max-h-[94dvh] w-full max-w-6xl overflow-hidden rounded-t-3xl sm:rounded-3xl lg:grid-cols-[minmax(270px,0.34fr)_minmax(0,0.66fr)]"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <aside className="min-h-0 border-b border-white/10 bg-white/[0.03] p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-200/80">Review queue</p>
              <h3 id="finance-review-title" className="mt-1 text-lg font-semibold">Classify events</h3>
              <p className="mt-1 text-xs text-zinc-500">{queueItems.length} loaded</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-white/70 transition hover:border-white/30 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="mt-4 max-h-[30vh] space-y-2 overflow-y-auto pr-1 lg:max-h-[70vh]">
            {queueItems.length ? (
              queueItems.map((item) => {
                const itemAmount = item.cashFlowAmount || item.amount;
                const active = item.id === event.id;
                const itemPositive = itemAmount > 0 && !item.countsAsSpend;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectEvent(item)}
                    className={
                      "w-full rounded-2xl border p-3 text-left transition " +
                      (active
                        ? "border-cyan-300/55 bg-cyan-300/12 shadow-[0_14px_35px_rgba(34,211,238,0.10)]"
                        : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/[0.07]")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{item.normalizedMerchant ?? item.displayName}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDate(item.date)}{item.accountName ? ` - ${item.accountName}` : ""}
                        </p>
                      </div>
                      <p className={(itemPositive ? "text-emerald-200" : "text-rose-200") + " shrink-0 text-xs font-semibold tabular-nums"}>
                        {formatMoney(Math.abs(itemAmount), currency)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <EventBadge eventType={item.eventType} />
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        {titleCase(item.primaryCategory)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <EmptyState text="No review items." />
            )}
          </div>
        </aside>

        <form className="min-h-0 overflow-y-auto p-4 sm:p-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold text-white">{event.normalizedMerchant ?? event.displayName}</p>
              <p className="mt-1 text-sm text-zinc-400">
                {formatDate(event.date)}{event.accountName ? ` - ${event.accountName}` : ""}
              </p>
              {event.classificationReason ? <p className="mt-2 text-xs leading-5 text-zinc-500">{event.classificationReason}</p> : null}
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className={(isPositive ? "text-emerald-200" : "text-rose-200") + " text-lg font-semibold tabular-nums"}>
                {formatMoney(Math.abs(amount), currency)}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.22em] text-zinc-500">{Math.round(event.confidence * 100)}% confidence</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Quick correction</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {REVIEW_PRESETS.map((preset) => {
                const active = eventType === preset.eventType && primaryCategory === preset.primaryCategory;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePreset(preset)}
                    className={
                      "rounded-2xl border p-3 text-left transition " +
                      (active
                        ? "border-cyan-300/60 bg-cyan-300/14 text-white"
                        : "border-white/10 bg-white/5 text-zinc-300 hover:border-cyan-300/40 hover:text-white")
                    }
                  >
                    <span className="block text-sm font-semibold">{preset.label}</span>
                    <span className="mt-1 block text-xs text-zinc-500">{titleCase(preset.eventType)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Selected impact</p>
                <p className="mt-1 text-sm font-semibold text-white">{selectedImpact.headline}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{selectedImpact.detail}</p>
              </div>
              <EventBadge eventType={eventType} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedImpact.flags.map((flag) => (
                <StatusPill key={flag.label} label={flag.label} tone={flag.tone} />
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
              Event type
              <select
                value={eventType}
                onChange={(changeEvent) => setEventType(changeEvent.target.value)}
                className="appearance-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-cyan-300/60"
              >
                {eventTypeOptions.map((option) => (
                  <option key={option} value={option} className="theme-option">
                    {titleCase(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
              Primary category
              <select
                value={primaryCategory}
                onChange={(changeEvent) => setPrimaryCategory(changeEvent.target.value)}
                className="appearance-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-cyan-300/60"
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category} className="theme-option">
                    {titleCase(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
              Subcategory
              <input
                value={subcategory}
                onChange={(changeEvent) => setSubcategory(changeEvent.target.value)}
                className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-cyan-300/60"
              />
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
              Merchant
              <input
                value={normalizedMerchant}
                onChange={(changeEvent) => setNormalizedMerchant(changeEvent.target.value)}
                className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-cyan-300/60"
              />
            </label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400 sm:col-span-2">
              Display name
              <input
                value={displayName}
                onChange={(changeEvent) => setDisplayName(changeEvent.target.value)}
                className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-cyan-300/60"
              />
            </label>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="grid gap-3 text-xs text-zinc-400 sm:grid-cols-4">
              <div>
                <p className="uppercase tracking-[0.22em] text-zinc-500">Original</p>
                <p className="mt-1 text-white">{titleCase(event.eventType)}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.22em] text-zinc-500">Category</p>
                <p className="mt-1 text-white">{titleCase(event.primaryCategory)}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.22em] text-zinc-500">Spend</p>
                <p className="mt-1 text-white">{event.countsAsSpend ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.22em] text-zinc-500">Income</p>
                <p className="mt-1 text-white">{event.countsAsIncome ? "Yes" : "No"}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/70 transition hover:border-white/30 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !eventType.trim() || !primaryCategory.trim() || !displayName.trim()}
              className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving" : "Save correction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getEventTypeImpact(eventType: string): {
  headline: string;
  detail: string;
  flags: Array<{ label: string; tone: Tone }>;
} {
  if (["income", "dividend", "interest"].includes(eventType)) {
    return {
      headline: "Counts as income",
      detail: "Adds to income and improves savings-rate calculations.",
      flags: [
        { label: "Income", tone: "good" },
        { label: "Not spend", tone: "neutral" },
      ],
    };
  }
  if (["investment_contribution", "investment_trade", "asset_purchase"].includes(eventType)) {
    return {
      headline: "Counts as investing activity",
      detail: "Excluded from spend while still showing movement into the portfolio.",
      flags: [
        { label: "Investing", tone: "good" },
        { label: "Not spend", tone: "neutral" },
      ],
    };
  }
  if (["transfer", "credit_card_payment", "savings_transfer", "investment_withdrawal"].includes(eventType)) {
    return {
      headline: "Counts as a transfer",
      detail: "Excluded from everyday spend and income totals.",
      flags: [
        { label: "Transfer", tone: "neutral" },
        { label: "Not spend", tone: "neutral" },
      ],
    };
  }
  if (["refund", "reimbursement", "asset_sale"].includes(eventType)) {
    return {
      headline: "Offsets outflows",
      detail: "Keeps the transaction visible without treating it as new spending.",
      flags: [
        { label: "Offset", tone: "good" },
        { label: "Not spend", tone: "neutral" },
      ],
    };
  }
  if (["ignored", "unknown", "asset_adjustment", "liability_adjustment"].includes(eventType)) {
    return {
      headline: "Excluded from core flow",
      detail: "Kept in history but not counted as normal income or spend.",
      flags: [
        { label: "Review", tone: eventType === "unknown" ? "warn" : "neutral" },
        { label: "Excluded", tone: "neutral" },
      ],
    };
  }
  return {
    headline: "Counts as spend",
    detail: "Adds to everyday spending and category breakdowns.",
    flags: [
      { label: "Spend", tone: "bad" },
      { label: "Budget", tone: "warn" },
    ],
  };
}

function ManualPositionRow({ position, currency }: { position: ManualFinancialPosition; currency: string }) {
  const signedValue = position.kind === "liability" ? -Math.abs(position.value) : Math.abs(position.value);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{position.name}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {[titleCase(position.role), titleCase(position.type), formatDate(position.valuationDate)].filter(Boolean).join(" - ")}
          </p>
        </div>
        <p className={(signedValue >= 0 ? "text-emerald-200" : "text-rose-200") + " shrink-0 text-sm font-semibold tabular-nums"}>
          {formatSignedMoney(signedValue, position.isoCurrencyCode ?? currency)}
        </p>
      </div>
    </div>
  );
}

function HoldingRow({ holding, currency }: { holding: InvestmentHolding; currency: string }) {
  const value = holding.institutionValue ?? 0;
  const costBasis = holding.costBasis ?? null;
  const gain = costBasis === null ? null : value - costBasis;
  const gainPercent = costBasis && costBasis > 0 && gain !== null ? gain / costBasis : null;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {holding.tickerSymbol ?? holding.securityName ?? "Holding"}
          </p>
          {holding.securityName && holding.tickerSymbol ? (
            <p className="mt-1 truncate text-xs text-zinc-500">{holding.securityName}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-white tabular-nums">{formatMoney(value, currency)}</p>
          {gain !== null ? (
            <p className={(gain >= 0 ? "text-emerald-200" : "text-rose-200") + " mt-1 text-[11px] tabular-nums"}>
              {formatSignedMoney(gain, currency)}
              {gainPercent !== null ? ` (${formatPercent(gainPercent)})` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-400">
        <div>
          <p className="uppercase tracking-[0.25em] text-zinc-500">Qty</p>
          <p className="mt-1 text-white tabular-nums">{formatNumber(holding.quantity)}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.25em] text-zinc-500">Price</p>
          <p className="mt-1 text-white tabular-nums">{formatMoney(holding.institutionPrice ?? 0, currency)}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-sm text-zinc-400">
      {text}
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const classes =
    tone === "good"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : tone === "bad"
          ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
          : "border-white/10 bg-white/5 text-white/70";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.23em] ${classes}`}>
      {label}
    </span>
  );
}

function getConnectionTypeLabel(connectionType: PlaidConnectionType) {
  return PLAID_CONNECTION_OPTIONS.find((option) => option.value === connectionType)?.label ?? "Plaid connection";
}

function formatConnectionName(connection: FinanceConnection) {
  return connection.institutionName ?? titleCase(connection.provider || "Financial connection");
}

function formatAccountName(account: FinanceAccount) {
  return account.mask ? account.name + " xx" + account.mask : account.name;
}

function usePersistentOption<T extends string>(key: string, defaultValue: T, validValues: readonly T[]) {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    setValue(readStoredOption(key, defaultValue, validValues));
  }, [defaultValue, key, validValues]);

  const updateValue = useCallback((next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Browser storage is optional; the page should keep working without it.
    }
  }, [key]);

  return [value, updateValue] as const;
}

function usePersistentBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(readStoredBoolean(key, defaultValue));
  }, [defaultValue, key]);

  const updateValue = useCallback((next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Browser storage is optional; the page should keep working without it.
    }
  }, [key]);

  return [value, updateValue] as const;
}

function readStoredOption<T extends string>(key: string, defaultValue: T, validValues: readonly T[]) {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = window.localStorage.getItem(key) as T | null;
    return stored && validValues.includes(stored) ? stored : defaultValue;
  } catch {
    return defaultValue;
  }
}

function readStoredBoolean(key: string, defaultValue: boolean) {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === "true" ? true : stored === "false" ? false : defaultValue;
  } catch {
    return defaultValue;
  }
}

function buildFinanceDashboard(
  summary: FinanceSummary | null,
  options: { rangeDays: number; hidePending: boolean },
): FinanceDashboard {
  const accounts = sortAccounts(summary?.accounts ?? []);
  const transactions = summary?.transactions ?? [];
  const holdings = sortHoldings(summary?.holdings ?? []);
  const currency = getPrimaryCurrency(summary);
  const cutoff = getRangeCutoff(options.rangeDays);
  const rangeTransactions = transactions.filter((transaction) => {
    const timestamp = new Date(transaction.date).getTime();
    if (Number.isNaN(timestamp) || timestamp < cutoff.getTime()) return false;
    return options.hidePending ? !transaction.pending : true;
  });
  const outflows = rangeTransactions.filter((transaction) => transaction.amount > 0);
  const inflows = rangeTransactions.filter((transaction) => transaction.amount < 0);
  const fallbackSpend = sumTransactions(outflows, (transaction) => transaction.amount);
  const fallbackIncome = sumTransactions(inflows, (transaction) => Math.abs(transaction.amount));
  const fallbackNetFlow = fallbackIncome - fallbackSpend;
  const fallbackCash = accounts
    .filter((account) => account.type === "depository")
    .reduce((total, account) => total + getAccountBalance(account), 0);
  const investmentAccounts = accounts
    .filter((account) => account.type === "investment")
    .reduce((total, account) => total + getAccountBalance(account), 0);
  const holdingValue = holdings.reduce((total, holding) => total + (holding.institutionValue ?? 0), 0);
  const fallbackInvestments = Math.max(investmentAccounts, holdingValue);
  const fallbackLiabilities = accounts
    .filter((account) => account.type === "credit" || account.type === "loan")
    .reduce((total, account) => total + Math.abs(getAccountBalance(account)), 0);
  const fallbackNetWorth = accounts.reduce((total, account) => total + accountContribution(account), 0);
  const pendingCount = transactions.filter((transaction) => {
    const timestamp = new Date(transaction.date).getTime();
    return !Number.isNaN(timestamp) && timestamp >= cutoff.getTime() && transaction.pending;
  }).length;
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
  const analytics = summary?.analytics && (summary.analytics.transactionCount > 0 || summary.analytics.recentEvents.length > 0 || transactions.length === 0)
    ? summary.analytics
    : null;

  if (analytics) {
    const periodIncome = analytics.cashFlow.income;
    const periodSpend = analytics.cashFlow.spending;
    const netFlow = analytics.cashFlow.netCashFlow;
    const cash = analytics.netWorth.cash;
    const dailySpend = periodSpend / Math.max(1, analytics.rangeDays || options.rangeDays);
    const cashBufferMonths = dailySpend > 0 ? cash / dailySpend / 30 : null;
    const investments = analytics.netWorth.investableAssets + analytics.netWorth.retirementAssets;
    const categoryBreakdown = toBreakdownItems(analytics.spendingByCategory);
    const accountSpendBreakdown = toBreakdownItems(analytics.accountSpendBreakdown, 2);
    const topMerchants = toBreakdownItems(analytics.spendingByMerchant, 5);
    const accountTypeBreakdown = toBreakdownItems(analytics.accountBreakdown, 1);
    const investmentBreakdown = analytics.investmentSummary.holdingsBreakdown.length
      ? toBreakdownItems(analytics.investmentSummary.holdingsBreakdown, 3)
      : buildHoldingBreakdown(holdings);

    return {
      currency: analytics.currency || currency,
      netWorth: analytics.netWorth.totalNetWorth,
      liquidNetWorth: analytics.netWorth.liquidNetWorth,
      cash,
      investments,
      liabilities: analytics.netWorth.totalLiabilities,
      periodIncome,
      periodSpend,
      netFlow,
      savingsRate: analytics.savings.savingsRate,
      cashBufferMonths,
      transactionCount: analytics.transactionCount,
      pendingCount: analytics.pendingExcludedCount,
      connectedInstitutionCount: summary?.connections.length ?? 0,
      filteredTransactions: rangeTransactions,
      recentEvents: analytics.recentEvents,
      reviewQueue: analytics.reviewQueue,
      accounts,
      holdings,
      manualPositions: analytics.manualPositions,
      reviewCount: analytics.reviewQueueCount ?? analytics.reviewQueue.length,
      flowSeries: analytics.cashFlow.cashFlowSeries,
      categoryBreakdown,
      accountSpendBreakdown,
      accountTypeBreakdown,
      investmentBreakdown,
      topMerchants,
      insights: buildFinanceInsights({
        cashBufferMonths,
        savingsRate: analytics.savings.savingsRate,
        netFlow,
        periodSpend,
        liabilities: analytics.netWorth.totalLiabilities,
        netWorth: analytics.netWorth.totalNetWorth,
        liquidNetWorth: analytics.netWorth.liquidNetWorth,
        transfers: analytics.cashFlow.transfers,
        investmentContributions: analytics.cashFlow.investmentContributions,
        reviewCount: analytics.reviewQueueCount ?? analytics.reviewQueue.length,
        topCategory: categoryBreakdown[0],
        topMerchant: topMerchants[0],
        currency: analytics.currency || currency,
      }),
    };
  }

  const dailySpend = fallbackSpend / Math.max(1, options.rangeDays);
  const cashBufferMonths = dailySpend > 0 ? fallbackCash / dailySpend / 30 : null;
  const savingsRate = fallbackIncome > 0 ? fallbackNetFlow / fallbackIncome : null;
  const categoryBreakdown = buildTransactionBreakdown(
    outflows,
    (transaction) => getTransactionCategory(transaction),
    "transactions",
  );
  const accountSpendBreakdown = buildTransactionBreakdown(
    outflows,
    (transaction) => (transaction.accountId ? accountNameById.get(transaction.accountId) ?? "Unknown account" : "Unknown account"),
    "transactions",
  );
  const topMerchants = buildTransactionBreakdown(
    outflows,
    (transaction) => transaction.merchantName ?? transaction.name,
    "transactions",
  );

  return {
    currency,
    netWorth: fallbackNetWorth,
    liquidNetWorth: fallbackCash + fallbackInvestments - fallbackLiabilities,
    cash: fallbackCash,
    investments: fallbackInvestments,
    liabilities: fallbackLiabilities,
    periodIncome: fallbackIncome,
    periodSpend: fallbackSpend,
    netFlow: fallbackNetFlow,
    savingsRate,
    cashBufferMonths,
    transactionCount: rangeTransactions.length,
    pendingCount: options.hidePending ? pendingCount : 0,
    connectedInstitutionCount: summary?.connections.length ?? 0,
    filteredTransactions: rangeTransactions,
    recentEvents: summary?.events ?? [],
    reviewQueue: [],
    accounts,
    holdings,
    manualPositions: summary?.manualPositions ?? [],
    reviewCount: 0,
    flowSeries: buildCashflowSeries(rangeTransactions, options.rangeDays),
    categoryBreakdown,
    accountSpendBreakdown,
    accountTypeBreakdown: buildAccountTypeBreakdown(accounts),
    investmentBreakdown: buildHoldingBreakdown(holdings),
    topMerchants,
    insights: buildFinanceInsights({
      cashBufferMonths,
      savingsRate,
      netFlow: fallbackNetFlow,
      periodSpend: fallbackSpend,
      liabilities: fallbackLiabilities,
      netWorth: fallbackNetWorth,
      liquidNetWorth: fallbackCash + fallbackInvestments - fallbackLiabilities,
      transfers: 0,
      investmentContributions: 0,
      reviewCount: 0,
      topCategory: categoryBreakdown[0],
      topMerchant: topMerchants[0],
      currency,
    }),
  };
}

function buildFinanceInsights({
  cashBufferMonths,
  savingsRate,
  netFlow,
  periodSpend,
  liabilities,
  netWorth,
  liquidNetWorth,
  transfers,
  investmentContributions,
  reviewCount,
  topCategory,
  topMerchant,
  currency,
}: {
  cashBufferMonths: number | null;
  savingsRate: number | null;
  netFlow: number;
  periodSpend: number;
  liabilities: number;
  netWorth: number;
  liquidNetWorth: number;
  transfers: number;
  investmentContributions: number;
  reviewCount: number;
  topCategory?: BreakdownItem;
  topMerchant?: BreakdownItem;
  currency: string;
}) {
  const insights: Array<{ label: string; value: string; tone: Tone }> = [
    {
      label: "Net flow",
      value: formatSignedMoney(netFlow, currency),
      tone: netFlow >= 0 ? "good" : "bad",
    },
    {
      label: "Cash runway",
      value: formatBuffer(cashBufferMonths),
      tone: cashBufferMonths === null ? "neutral" : cashBufferMonths >= 6 ? "good" : cashBufferMonths >= 3 ? "warn" : "bad",
    },
    {
      label: "Savings rate",
      value: savingsRate === null ? "No income in range" : formatPercent(savingsRate),
      tone: savingsRate === null ? "neutral" : savingsRate >= 0.2 ? "good" : savingsRate >= 0 ? "warn" : "bad",
    },
  ];

  if (topCategory) {
    insights.push({
      label: "Top category",
      value: `${topCategory.label} - ${formatMoney(topCategory.value, currency)}`,
      tone: topCategory.percent > 0.45 ? "warn" : "neutral",
    });
  }
  if (topMerchant) {
    insights.push({
      label: "Top merchant",
      value: `${topMerchant.label} - ${formatMoney(topMerchant.value, currency)}`,
      tone: topMerchant.percent > 0.3 ? "warn" : "neutral",
    });
  }
  if (investmentContributions > 0) {
    insights.push({
      label: "Investing",
      value: `${formatMoney(investmentContributions, currency)} contributed`,
      tone: "good",
    });
  }
  if (transfers > 0) {
    insights.push({
      label: "Transfers",
      value: `${formatMoney(transfers, currency)} excluded from spend`,
      tone: "neutral",
    });
  }
  if (reviewCount > 0) {
    insights.push({
      label: "Review queue",
      value: `${reviewCount} low-confidence events`,
      tone: "warn",
    });
  }
  insights.push({
    label: "Debt load",
    value: liabilities > 0 ? `${formatMoney(liabilities, currency)} vs ${formatMoney(liquidNetWorth, currency)} liquid` : "No credit or loan balances",
    tone: liabilities > Math.max(1, Math.abs(netWorth)) ? "bad" : liabilities > 0 ? "warn" : "good",
  });
  if (periodSpend === 0) {
    insights.push({ label: "Spend data", value: "No outflows in this window", tone: "neutral" });
  }
  return insights.slice(0, 6);
}

function buildCashflowSeries(transactions: FinanceTransaction[], rangeDays: number): FlowPoint[] {
  const bucketCount = getCashflowBucketCount(rangeDays);
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

  transactions.forEach((transaction) => {
    const timestamp = new Date(transaction.date).getTime();
    if (Number.isNaN(timestamp)) return;
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((timestamp - start.getTime()) / bucketMs)));
    if (transaction.amount > 0) {
      buckets[index].spending += transaction.amount;
      buckets[index].net -= transaction.amount;
    } else {
      const income = Math.abs(transaction.amount);
      buckets[index].income += income;
      buckets[index].net += income;
    }
  });

  return buckets;
}

function buildTransactionBreakdown(
  transactions: FinanceTransaction[],
  getKey: (transaction: FinanceTransaction) => string,
  detailLabel: string,
): BreakdownItem[] {
  const totals = new Map<string, { total: number; count: number }>();
  transactions.forEach((transaction) => {
    const key = cleanLabel(getKey(transaction));
    const current = totals.get(key) ?? { total: 0, count: 0 };
    current.total += transaction.amount;
    current.count += 1;
    totals.set(key, current);
  });
  const total = Array.from(totals.values()).reduce((sum, item) => sum + item.total, 0);
  const sorted = Array.from(totals.entries())
    .sort((left, right) => right[1].total - left[1].total);
  const visible = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  const items = visible.map(([label, item], index) => ({
    id: `${label}-${index}`,
    label,
    value: item.total,
    detail: `${item.count} ${detailLabel}`,
    color: CHART_COLORS[index % CHART_COLORS.length],
    percent: total > 0 ? item.total / total : 0,
  }));
  if (rest.length) {
    const otherTotal = rest.reduce((sum, [, item]) => sum + item.total, 0);
    const otherCount = rest.reduce((sum, [, item]) => sum + item.count, 0);
    items.push({
      id: "other",
      label: "Other",
      value: otherTotal,
      detail: `${otherCount} ${detailLabel}`,
      color: "#94a3b8",
      percent: total > 0 ? otherTotal / total : 0,
    });
  }
  return items;
}

function toBreakdownItems(items: FinanceAnalyticsBreakdownItem[], colorOffset = 0): BreakdownItem[] {
  return items.map((item, index) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    detail: item.detail,
    color: CHART_COLORS[(index + colorOffset) % CHART_COLORS.length],
    percent: item.percent,
  }));
}

function buildAccountTypeBreakdown(accounts: FinanceAccount[]): BreakdownItem[] {
  const totals = new Map<string, number>();
  accounts.forEach((account) => {
    const meta = getAccountTypeMeta(getAccountRole(account));
    const value = Math.abs(getAccountBalance(account));
    totals.set(meta.label, (totals.get(meta.label) ?? 0) + value);
  });
  const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(totals.entries())
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([label, value], index) => ({
      id: label,
      label,
      value,
      detail: `${formatNumber(value)} balance exposure`,
      color: Object.values(ACCOUNT_TYPE_META).find((meta) => meta.label === label)?.color ?? CHART_COLORS[index % CHART_COLORS.length],
      percent: total > 0 ? value / total : 0,
    }));
}

function buildHoldingBreakdown(holdings: InvestmentHolding[]): BreakdownItem[] {
  const total = holdings.reduce((sum, holding) => sum + (holding.institutionValue ?? 0), 0);
  return holdings
    .filter((holding) => (holding.institutionValue ?? 0) > 0)
    .slice(0, 8)
    .map((holding, index) => {
      const value = holding.institutionValue ?? 0;
      return {
        id: holding.id,
        label: holding.tickerSymbol ?? holding.securityName ?? "Holding",
        value,
        detail: holding.securityName ?? `${formatNumber(holding.quantity)} shares`,
        color: CHART_COLORS[index % CHART_COLORS.length],
        percent: total > 0 ? value / total : 0,
      };
    });
}

function sortAccounts(accounts: FinanceAccount[]) {
  return [...accounts].sort((left, right) => {
    const leftMeta = getAccountTypeMeta(getAccountRole(left));
    const rightMeta = getAccountTypeMeta(getAccountRole(right));
    if (leftMeta.order !== rightMeta.order) return leftMeta.order - rightMeta.order;
    return Math.abs(getAccountBalance(right)) - Math.abs(getAccountBalance(left));
  });
}

function sortHoldings(holdings: InvestmentHolding[]) {
  return [...holdings].sort((left, right) => (right.institutionValue ?? 0) - (left.institutionValue ?? 0));
}

function getAccountTypeMeta(type: string) {
  return ACCOUNT_TYPE_META[type] ?? { label: titleCase(type || "Other"), color: "#94a3b8", order: 99 };
}

function getAccountRole(account: FinanceAccount) {
  return account.roleOverride ?? account.canonicalRole ?? account.type;
}

function getAccountBalance(account: FinanceAccount) {
  return account.currentBalance ?? account.availableBalance ?? 0;
}

function accountContribution(account: FinanceAccount) {
  const balance = getAccountBalance(account);
  if (account.type === "credit" || account.type === "loan") {
    return -Math.abs(balance);
  }
  return balance;
}

function getTransactionCategory(transaction: FinanceTransaction) {
  return transaction.category[0] ?? "Uncategorized";
}

function getPrimaryCurrency(summary: FinanceSummary | null) {
  const currencies = [
    summary?.analytics?.currency,
    ...(summary?.accounts ?? []).map((item) => item.isoCurrencyCode),
    ...(summary?.transactions ?? []).map((item) => item.isoCurrencyCode),
    ...(summary?.holdings ?? []).map((item) => item.isoCurrencyCode),
    ...(summary?.manualPositions ?? []).map((item) => item.isoCurrencyCode),
  ].filter((value): value is string => Boolean(value));
  return mostCommon(currencies) ?? "USD";
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function getRangeCutoff(rangeDays: number) {
  const date = new Date();
  date.setDate(date.getDate() - rangeDays + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getCashflowBucketCount(rangeDays: number) {
  if (rangeDays <= 1) return 1;
  if (rangeDays <= 7) return 7;
  if (rangeDays <= 14) return 7;
  if (rangeDays <= 30) return 6;
  if (rangeDays <= 90) return 8;
  return 10;
}

function sumTransactions(
  transactions: FinanceTransaction[],
  selector: (transaction: FinanceTransaction) => number,
) {
  return transactions.reduce((total, transaction) => total + selector(transaction), 0);
}

function sumSeries(series: FlowPoint[], key: keyof Pick<FlowPoint, "income" | "spending" | "net">) {
  return series.reduce((total, point) => total + point[key], 0);
}

function sumBreakdown(items: BreakdownItem[]) {
  return items.reduce((total, item) => total + item.value, 0);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed with ${response.status}`);
  }
  return data as T;
}

function loadPlaidScript() {
  if (window.Plaid) return Promise.resolve();
  if (plaidScriptPromise) return plaidScriptPromise;
  plaidScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid Link failed to load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link failed to load."));
    document.head.appendChild(script);
  });
  return plaidScriptPromise;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
}

function formatSignedMoney(value: number, currency = "USD") {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${formatMoney(Math.abs(value), currency)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 4 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: "percent",
    maximumFractionDigits: Math.abs(value) >= 1 ? 0 : 1,
  }).format(value);
}

function formatRunwayValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "No baseline";
  if (value >= 24) return "24+ mo";
  return `${value.toFixed(value >= 10 ? 0 : 1)} mo`;
}

function formatBuffer(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "No spend baseline";
  if (value >= 24) return "24+ months at current spend";
  return `${value.toFixed(value >= 10 ? 0 : 1)} months at current spend`;
}

function formatMonthlySpendPace(periodSpend: number, rangeDays: number, currency = "USD") {
  if (!Number.isFinite(periodSpend) || !Number.isFinite(rangeDays) || rangeDays <= 0) return formatMoney(0, currency);
  return formatMoney((periodSpend / rangeDays) * 30, currency);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | number | null | undefined) {
  if (!value) return "Not loaded";
  return new Date(value).toLocaleString(DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBucketLabel(value: Date) {
  return value.toLocaleDateString(DISPLAY_LOCALE, {
    month: "numeric",
    day: "numeric",
  });
}

function formatRelativeSync(connections: FinanceConnection[] | undefined) {
  const timestamps = (connections ?? [])
    .map((connection) => connection.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  if (!timestamps.length) return "Not synced";
  const latest = Math.max(...timestamps);
  return `Synced ${formatDateTime(latest)}`;
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
