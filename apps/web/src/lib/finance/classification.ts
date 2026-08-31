export const FINANCIAL_EVENT_TYPES = [
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
] as const;

export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[number];

export const ACCOUNT_ROLES = [
  "cash",
  "checking",
  "savings",
  "credit_card",
  "taxable_brokerage",
  "retirement_401k",
  "retirement_403b",
  "retirement_ira",
  "retirement_roth_ira",
  "hsa",
  "loan",
  "student_loan",
  "mortgage",
  "vehicle_loan",
  "property",
  "vehicle",
  "other_asset",
  "other_liability",
] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_ROLE_LABELS: Record<string, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit cards",
  taxable_brokerage: "Taxable brokerage",
  retirement_401k: "401(k)",
  retirement_403b: "403(b)",
  retirement_ira: "IRA",
  retirement_roth_ira: "Roth IRA",
  hsa: "HSA",
  loan: "Loans",
  student_loan: "Student loans",
  mortgage: "Mortgage",
  vehicle_loan: "Vehicle loans",
  property: "Property",
  vehicle: "Vehicles",
  other_asset: "Other assets",
  other_liability: "Other liabilities",
};

export const FINANCE_CATEGORY_TAXONOMY = {
  income: ["payroll", "business_income", "investment_income", "interest", "dividend"],
  essentials: ["housing", "utilities", "groceries", "insurance", "healthcare", "transportation"],
  lifestyle: ["food_dining", "shopping", "entertainment", "travel", "personal_care", "services"],
  financial: ["transfers", "savings", "investments", "debt", "fees", "taxes"],
  adjustments: ["refunds", "reimbursements", "manual_adjustments", "uncategorized"],
} as const;

export type AccountDescriptor = {
  id?: string | null;
  name?: string | null;
  officialName?: string | null;
  type?: string | null;
  subtype?: string | null;
  canonicalRole?: string | null;
  roleOverride?: string | null;
};

export type ConnectionDescriptor = {
  id?: string | null;
  institutionId?: string | null;
  institutionName?: string | null;
};

export type TransactionDescriptor = {
  id?: string | null;
  providerTransactionId?: string | null;
  providerAccountId?: string | null;
  date?: Date | string | null;
  authorizedDate?: Date | string | null;
  name?: string | null;
  merchantName?: string | null;
  amount: number;
  category?: string[] | null;
  pending?: boolean | null;
  paymentChannel?: string | null;
  pendingTransactionId?: string | null;
  personalFinanceCategoryPrimary?: string | null;
  personalFinanceCategoryDetailed?: string | null;
  personalFinanceCategoryConfidence?: string | null;
};

export type ClassificationRuleDescriptor = {
  id: string;
  enabled?: boolean | null;
  priority?: number | null;
  matchType: string;
  matchValue: string;
  matchValueNormalized?: string | null;
  institutionId?: string | null;
  connectionId?: string | null;
  accountId?: string | null;
  amount?: number | null;
  eventType: string;
  primaryCategory: string;
  subcategory?: string | null;
  normalizedMerchant?: string | null;
  confidence?: number | null;
  source?: string | null;
};

export type ClassificationContext = {
  account?: AccountDescriptor | null;
  connection?: ConnectionDescriptor | null;
  rules?: ClassificationRuleDescriptor[] | null;
};

export type FinancialEventFlags = {
  cashFlowAmount: number;
  countsAsIncome: boolean;
  countsAsSpend: boolean;
  countsAsSavings: boolean;
  countsAsInvestmentContribution: boolean;
  countsAsTransfer: boolean;
  internalTransfer: boolean;
  investmentIncome: boolean;
  affectsNetWorth: boolean;
};

export type ClassificationResult = FinancialEventFlags & {
  eventType: FinancialEventType;
  primaryCategory: string;
  subcategory?: string;
  normalizedMerchant?: string;
  displayName: string;
  amount: number;
  needsReview: boolean;
  confidence: number;
  classificationSource: string;
  classificationReason: string;
  reviewedByRuleId?: string;
  metadata?: Record<string, unknown>;
};

const FINANCIAL_EVENT_TYPE_SET = new Set<string>(FINANCIAL_EVENT_TYPES);
const ACCOUNT_ROLE_SET = new Set<string>(ACCOUNT_ROLES);

const PLAID_PRIMARY_CATEGORY_MAP: Record<string, { primaryCategory: string; eventType?: FinancialEventType }> = {
  BANK_FEES: { primaryCategory: "fees", eventType: "fee" },
  ENTERTAINMENT: { primaryCategory: "entertainment" },
  FOOD_AND_DRINK: { primaryCategory: "food_dining" },
  GENERAL_MERCHANDISE: { primaryCategory: "shopping" },
  GENERAL_SERVICES: { primaryCategory: "services" },
  GOVERNMENT_AND_NON_PROFIT: { primaryCategory: "government_nonprofit" },
  HOME_IMPROVEMENT: { primaryCategory: "home" },
  INCOME: { primaryCategory: "income", eventType: "income" },
  LOAN_PAYMENTS: { primaryCategory: "debt", eventType: "debt_payment" },
  MEDICAL: { primaryCategory: "healthcare" },
  PERSONAL_CARE: { primaryCategory: "personal_care" },
  RECREATION: { primaryCategory: "entertainment" },
  RENT_AND_UTILITIES: { primaryCategory: "housing_utilities" },
  SERVICE: { primaryCategory: "services" },
  SHOPS: { primaryCategory: "shopping" },
  TRANSPORTATION: { primaryCategory: "transportation" },
  TRAVEL: { primaryCategory: "travel" },
};

const PLAID_DETAILED_CATEGORY_MAP: Record<string, { primaryCategory: string; eventType?: FinancialEventType }> = {
  ARTS_AND_ENTERTAINMENT: { primaryCategory: "entertainment" },
  COMPUTERS_AND_ELECTRONICS: { primaryCategory: "shopping" },
  DIGITAL_PURCHASE: { primaryCategory: "shopping" },
  FOOD_AND_BEVERAGE_STORE: { primaryCategory: "groceries" },
  GOLF: { primaryCategory: "entertainment" },
  SPORTING_GOODS: { primaryCategory: "shopping" },
  SUBSCRIPTION: { primaryCategory: "services" },
  SUPERMARKETS_AND_GROCERIES: { primaryCategory: "groceries" },
  TOBACCO: { primaryCategory: "shopping" },
};

const MERCHANT_ALIASES: Array<[RegExp, string]> = [
  [/\braising\s+cane'?s\b/i, "Raising Cane's"],
  [/\bcanes\b/i, "Raising Cane's"],
  [/\bamerican\s+express\b|\bamex\b/i, "American Express"],
  [/\bcharles\s+schwab\b|\bschwab\b/i, "Charles Schwab"],
  [/\bfidelity\b/i, "Fidelity"],
  [/\bvanguard\b/i, "Vanguard"],
  [/\brobinhood\b/i, "Robinhood"],
  [/\bdiscover\b/i, "Discover"],
  [/\bcapital\s+one\b/i, "Capital One"],
  [/\bchase\b/i, "Chase"],
  [/\blincoln\s+electric\b/i, "Lincoln Electric"],
  [/\bapple\s+card\b/i, "Apple Card"],
  [/\bvenmo\b/i, "Venmo"],
  [/\bzelle\b/i, "Zelle"],
  [/\bcash\s+app\b|\bcashapp\b/i, "Cash App"],
  [/\bpaypal\b/i, "PayPal"],
];

const PAYROLL_KEYWORDS = ["payroll", "salary", "direct dep", "direct deposit", "paychex", "adp", "gusto", "workday", "paystub"];
const CARD_PAYMENT_KEYWORDS = ["autopay", "auto pay", "payment thank", "payment received", "card payment", "credit card payment"];
const CREDIT_BRANDS = [
  "american express",
  "amex",
  "discover",
  "capital one",
  "chase card",
  "citi card",
  "citibank card",
  "bank of america card",
  "barclays",
  "synchrony",
  "apple card",
  "wells fargo card",
  "credit card",
];
const INVESTMENT_BRANDS = [
  "schwab",
  "charles schwab",
  "fidelity",
  "vanguard",
  "robinhood",
  "etrade",
  "e trade",
  "e*trade",
  "betterment",
  "wealthfront",
  "interactive brokers",
  "ibkr",
  "merrill",
];
const TRANSFER_KEYWORDS = ["transfer", "xfer", "ach", "online banking", "external transfer", "wire", "book transfer", "moneylink", "money link"];
const REFUND_KEYWORDS = ["refund", "return", "reversal", "cashback", "cash back", "credit adjustment"];
const REIMBURSEMENT_KEYWORDS = ["reimbursement", "expense reimb", "venmo", "zelle", "cash app"];
const FEE_KEYWORDS = ["fee", "overdraft", "maintenance charge", "atm surcharge", "interest charge"];
const DIVIDEND_KEYWORDS = ["dividend", "qualified div", "ordinary div"];
const INTEREST_KEYWORDS = ["interest", "int paid", "interest paid"];
const TRADE_KEYWORDS = ["buy", "sell", "sold", "purchase", "trade", "reinvest", "exchange"];

export function classifyTransaction(
  transaction: TransactionDescriptor,
  context: ClassificationContext = {},
): ClassificationResult {
  const accountRole = inferAccountRole(context.account);
  const displayName = normalizeDisplayName(transaction.merchantName ?? transaction.name ?? "Transaction");
  const normalizedMerchant = normalizeMerchantName(transaction.merchantName ?? transaction.name ?? displayName);
  const transactionText = normalizeSearchText([
    transaction.name,
    transaction.merchantName,
    ...(transaction.category ?? []),
    transaction.personalFinanceCategoryPrimary,
    transaction.personalFinanceCategoryDetailed,
  ]);
  const contextText = normalizeSearchText([
    context.account?.name,
    context.account?.officialName,
    context.connection?.institutionName,
  ]);
  const text = [transactionText, contextText].filter(Boolean).join(" ");

  const matchingRule = findMatchingRule(transaction, context, normalizedMerchant, text);
  if (matchingRule) {
    return resultFromRule(matchingRule, transaction, displayName, normalizedMerchant);
  }

  const base = classifyByHeuristic(transaction, accountRole, displayName, normalizedMerchant, text, transactionText);
  return {
    ...base,
    metadata: {
      accountRole,
      plaidCategory: transaction.category ?? [],
      plaidPrimary: transaction.personalFinanceCategoryPrimary ?? null,
      plaidDetailed: transaction.personalFinanceCategoryDetailed ?? null,
    },
  };
}

export function inferAccountRole(account?: AccountDescriptor | null): AccountRole {
  const explicitRole = account?.roleOverride ?? account?.canonicalRole;
  if (explicitRole && ACCOUNT_ROLE_SET.has(explicitRole)) return explicitRole as AccountRole;

  const type = normalizeToken(account?.type);
  const subtype = normalizeToken(account?.subtype);
  const name = normalizeSearchText([account?.name, account?.officialName]);
  const combined = `${type} ${subtype} ${name}`;

  if (type === "credit" || combined.includes("credit card") || combined.includes("card")) return "credit_card";
  if (subtype.includes("mortgage") || combined.includes("mortgage")) return "mortgage";
  if (subtype.includes("student") || combined.includes("student loan")) return "student_loan";
  if (subtype.includes("auto") || subtype.includes("vehicle") || combined.includes("auto loan") || combined.includes("car loan")) {
    return "vehicle_loan";
  }
  if (type === "loan") return "loan";
  if (type === "investment") {
    if (combined.includes("401k") || combined.includes("401 k")) return "retirement_401k";
    if (combined.includes("403b") || combined.includes("403 b")) return "retirement_403b";
    if (combined.includes("roth")) return "retirement_roth_ira";
    if (combined.includes("ira")) return "retirement_ira";
    if (combined.includes("hsa") || combined.includes("health savings")) return "hsa";
    return "taxable_brokerage";
  }
  if (type === "depository") {
    if (subtype.includes("savings") || subtype.includes("money market") || combined.includes("savings")) return "savings";
    if (subtype.includes("checking") || combined.includes("checking")) return "checking";
    return "cash";
  }
  if (combined.includes("property") || combined.includes("home value")) return "property";
  if (combined.includes("vehicle") || combined.includes("car value")) return "vehicle";
  return type === "liability" ? "other_liability" : "other_asset";
}

export function normalizeMerchantName(value: string | null | undefined) {
  const raw = normalizeDisplayName(value ?? "Unknown merchant");
  for (const [pattern, alias] of MERCHANT_ALIASES) {
    if (pattern.test(raw)) return alias;
  }

  const cleaned = raw
    .replace(/\b(pos|debit|credit|card|purchase|auth|pending|sq|tst|inc|llc|co)\b/gi, " ")
    .replace(/#\d+/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\b[a-z]{2}\s+\d{5}\b/gi, " ")
    .replace(/[^a-z0-9'& ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(cleaned || raw);
}

export function normalizeRuleMatchValue(matchType: string, matchValue: string) {
  return matchType === "regex" ? matchValue : normalizeSearchText([matchValue]);
}

export function buildEventFlags(eventType: string, rawAmount: number): FinancialEventFlags {
  const amount = Math.abs(roundMoney(rawAmount));
  const signBasedCashFlow = rawAmount > 0 ? -amount : amount;

  switch (eventType) {
    case "income":
      return flagSet({ cashFlowAmount: amount, countsAsIncome: true });
    case "expense":
    case "fee":
      return flagSet({ cashFlowAmount: -amount, countsAsSpend: true });
    case "refund":
    case "reimbursement":
      return flagSet({ cashFlowAmount: amount });
    case "dividend":
    case "interest":
      return flagSet({ cashFlowAmount: amount, countsAsIncome: true, investmentIncome: true });
    case "credit_card_payment":
    case "debt_payment":
    case "transfer":
      return flagSet({
        cashFlowAmount: 0,
        countsAsTransfer: true,
        internalTransfer: true,
        affectsNetWorth: false,
      });
    case "savings_transfer":
      return flagSet({
        cashFlowAmount: 0,
        countsAsSavings: true,
        countsAsTransfer: true,
        internalTransfer: true,
        affectsNetWorth: false,
      });
    case "investment_contribution":
      return flagSet({
        cashFlowAmount: 0,
        countsAsSavings: true,
        countsAsInvestmentContribution: true,
        countsAsTransfer: true,
        internalTransfer: true,
        affectsNetWorth: false,
      });
    case "investment_withdrawal":
      return flagSet({
        cashFlowAmount: 0,
        countsAsTransfer: true,
        internalTransfer: true,
        affectsNetWorth: false,
      });
    case "investment_trade":
      return flagSet({ cashFlowAmount: 0, affectsNetWorth: false });
    case "asset_purchase":
    case "asset_sale":
    case "asset_adjustment":
    case "liability_adjustment":
    case "ignored":
      return flagSet({ cashFlowAmount: 0, affectsNetWorth: false });
    default:
      return flagSet({
        cashFlowAmount: signBasedCashFlow,
        countsAsIncome: rawAmount < 0,
        countsAsSpend: rawAmount > 0,
      });
  }
}

export function getDefaultCategoryForEventType(eventType: string, fallback = "uncategorized") {
  switch (eventType) {
    case "income":
      return { primaryCategory: "income", subcategory: "other_income" };
    case "expense":
      return { primaryCategory: fallback, subcategory: undefined };
    case "credit_card_payment":
    case "debt_payment":
      return { primaryCategory: "debt", subcategory: eventType };
    case "savings_transfer":
      return { primaryCategory: "savings", subcategory: "account_transfer" };
    case "investment_contribution":
    case "investment_withdrawal":
    case "investment_trade":
      return { primaryCategory: "investments", subcategory: eventType };
    case "dividend":
    case "interest":
      return { primaryCategory: "investment_income", subcategory: eventType };
    case "refund":
      return { primaryCategory: "refunds", subcategory: undefined };
    case "reimbursement":
      return { primaryCategory: "reimbursements", subcategory: undefined };
    case "fee":
      return { primaryCategory: "fees", subcategory: undefined };
    case "transfer":
      return { primaryCategory: "transfers", subcategory: undefined };
    default:
      return { primaryCategory: fallback, subcategory: undefined };
  }
}

export function isRetirementRole(role: string | null | undefined) {
  return role === "retirement_401k" || role === "retirement_403b" || role === "retirement_ira" || role === "retirement_roth_ira";
}

export function isInvestmentRole(role: string | null | undefined) {
  return isRetirementRole(role) || role === "taxable_brokerage" || role === "hsa";
}

export function isLiabilityRole(role: string | null | undefined) {
  return role === "credit_card" || role === "loan" || role === "student_loan" || role === "mortgage" || role === "vehicle_loan" || role === "other_liability";
}

function classifyByHeuristic(
  transaction: TransactionDescriptor,
  accountRole: AccountRole,
  displayName: string,
  normalizedMerchant: string,
  text: string,
  transactionText: string,
): ClassificationResult {
  const rawAmount = roundMoney(transaction.amount);
  const isOutflow = rawAmount > 0;
  const plaidPrimary = normalizePlaidCategory(transaction.personalFinanceCategoryPrimary ?? transaction.category?.[0]);
  const plaidDetailed = normalizePlaidCategory(transaction.personalFinanceCategoryDetailed ?? transaction.category?.[1]);

  const keywordText = transactionText || text;

  if (isPayrollIncome(keywordText, plaidPrimary, plaidDetailed, rawAmount)) {
    return makeResult("income", rawAmount, "income", "payroll", displayName, normalizedMerchant, 0.94, "heuristic", "Payroll or direct deposit income matched before transfer rules.");
  }
  if (matchesAny(keywordText, REFUND_KEYWORDS)) {
    return makeResult("refund", rawAmount, "refunds", plaidDetailed, displayName, normalizedMerchant, 0.88, "heuristic", "Refund or reversal keywords matched.");
  }
  if (matchesAny(keywordText, FEE_KEYWORDS) || plaidPrimary === "BANK_FEES") {
    return makeResult("fee", rawAmount, "fees", plaidDetailed, displayName, normalizedMerchant, 0.86, "heuristic", "Bank fee keywords or Plaid fee category matched.");
  }
  if (matchesAny(keywordText, DIVIDEND_KEYWORDS)) {
    return makeResult("dividend", rawAmount, "investment_income", "dividend", displayName, normalizedMerchant, 0.9, "heuristic", "Dividend keywords matched.");
  }
  if (matchesAny(keywordText, INTEREST_KEYWORDS) && !keywordText.includes("interest charge")) {
    return makeResult("interest", rawAmount, "investment_income", "interest", displayName, normalizedMerchant, 0.86, "heuristic", "Interest income keywords matched.");
  }
  if (isCreditCardPayment(keywordText, accountRole)) {
    return makeResult("credit_card_payment", rawAmount, "debt", "credit_card_payment", displayName, normalizedMerchant, 0.9, "heuristic", "Credit card payment pattern matched.");
  }
  if (isInvestmentRole(accountRole) && matchesAny(keywordText, TRADE_KEYWORDS) && !matchesAny(keywordText, TRANSFER_KEYWORDS)) {
    return makeResult("investment_trade", rawAmount, "investments", "trade", displayName, normalizedMerchant, 0.78, "heuristic", "Investment account trade keywords matched.");
  }
  if (isInvestmentTransfer(keywordText, accountRole)) {
    const eventType = getInvestmentTransferEventType(rawAmount, accountRole);
    return makeResult(eventType, rawAmount, "investments", eventType, displayName, normalizedMerchant, 0.88, "heuristic", "Investment funding or withdrawal pattern matched.");
  }
  if (isSavingsTransfer(keywordText, accountRole)) {
    return makeResult("savings_transfer", rawAmount, "savings", "account_transfer", displayName, normalizedMerchant, 0.78, "heuristic", "Savings transfer pattern matched.");
  }
  if (isTransferText(keywordText) || isPlaidTransferCategory(plaidPrimary)) {
    return makeResult("transfer", rawAmount, "transfers", plaidDetailed, displayName, normalizedMerchant, 0.72, "heuristic", "Transfer wording or Plaid transfer category matched.");
  }
  if (matchesAny(keywordText, REIMBURSEMENT_KEYWORDS) && !isOutflow) {
    return makeResult("reimbursement", rawAmount, "reimbursements", undefined, displayName, normalizedMerchant, 0.72, "heuristic", "Reimbursement-style inbound transfer matched.");
  }

  const plaidResult = classifyPlaidCategory(rawAmount, plaidPrimary, plaidDetailed, displayName, normalizedMerchant, accountRole);
  if (plaidResult) return plaidResult;

  const category = isOutflow ? inferSpendCategory(keywordText, transaction.category) : "income";
  return makeResult(
    isOutflow ? "expense" : "income",
    rawAmount,
    category,
    isOutflow ? plaidDetailed : "other_income",
    displayName,
    normalizedMerchant,
    isOutflow ? 0.58 : 0.62,
    "heuristic",
    "Fallback sign-based classification.",
  );
}

function classifyPlaidCategory(
  rawAmount: number,
  plaidPrimary: string,
  plaidDetailed: string | undefined,
  displayName: string,
  normalizedMerchant: string,
  accountRole: AccountRole,
) {
  if (!plaidPrimary) return null;
  if (isPlaidTransferCategory(plaidPrimary)) {
    const eventType = isInvestmentRole(accountRole) ? getInvestmentTransferEventType(rawAmount, accountRole) : "transfer";
    const defaults = getDefaultCategoryForEventType(eventType, "transfers");
    return makeResult(eventType, rawAmount, defaults.primaryCategory, defaults.subcategory ?? plaidDetailed, displayName, normalizedMerchant, 0.78, "plaid", "Plaid personal finance transfer category matched.");
  }

  const mapped = (plaidDetailed ? PLAID_DETAILED_CATEGORY_MAP[plaidDetailed] : undefined) ?? PLAID_PRIMARY_CATEGORY_MAP[plaidPrimary];
  if (!mapped) return null;
  const eventType = mapped.eventType ?? (rawAmount > 0 ? "expense" : "income");
  return makeResult(eventType, rawAmount, mapped.primaryCategory, plaidDetailed, displayName, normalizedMerchant, 0.76, "plaid", "Plaid personal finance category mapped to taxonomy.");
}

function findMatchingRule(
  transaction: TransactionDescriptor,
  context: ClassificationContext,
  normalizedMerchant: string,
  normalizedText: string,
) {
  const rules = [...(context.rules ?? [])]
    .filter((rule) => rule.enabled !== false)
    .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100));

  return rules.find((rule) => ruleMatchesTransaction(rule, transaction, context, normalizedMerchant, normalizedText));
}

function ruleMatchesTransaction(
  rule: ClassificationRuleDescriptor,
  transaction: TransactionDescriptor,
  context: ClassificationContext,
  normalizedMerchant: string,
  normalizedText: string,
) {
  if (rule.institutionId && rule.institutionId !== context.connection?.institutionId) return false;
  if (rule.connectionId && rule.connectionId !== context.connection?.id) return false;
  if (rule.accountId && rule.accountId !== context.account?.id) return false;
  if (typeof rule.amount === "number" && Math.abs(Math.abs(rule.amount) - Math.abs(transaction.amount)) > 0.01) return false;

  const matchType = normalizeToken(rule.matchType);
  const rawNeedle = rule.matchValue ?? "";
  const normalizedNeedle = rule.matchValueNormalized ?? normalizeRuleMatchValue(matchType, rawNeedle);
  const categoryText = normalizeSearchText(transaction.category ?? []);

  switch (matchType) {
    case "exact":
    case "exact_name":
    case "name_exact":
      return normalizedText === normalizedNeedle || normalizeSearchText([transaction.name]) === normalizedNeedle;
    case "merchant":
    case "merchant_exact":
      return normalizeSearchText([normalizedMerchant]) === normalizedNeedle;
    case "merchant_contains":
      return normalizeSearchText([normalizedMerchant]).includes(normalizedNeedle);
    case "category":
    case "plaid_category":
      return categoryText.includes(normalizedNeedle);
    case "regex":
      try {
        return new RegExp(rawNeedle, "i").test([transaction.name, transaction.merchantName, ...(transaction.category ?? [])].filter(Boolean).join(" "));
      } catch {
        return false;
      }
    case "contains":
    case "name_contains":
    default:
      return normalizedText.includes(normalizedNeedle);
  }
}

function resultFromRule(
  rule: ClassificationRuleDescriptor,
  transaction: TransactionDescriptor,
  displayName: string,
  normalizedMerchant: string,
): ClassificationResult {
  const eventType = toFinancialEventType(rule.eventType);
  const defaultCategory = getDefaultCategoryForEventType(eventType, rule.primaryCategory);
  return {
    ...buildEventFlags(eventType, transaction.amount),
    eventType,
    primaryCategory: rule.primaryCategory || defaultCategory.primaryCategory,
    subcategory: rule.subcategory ?? defaultCategory.subcategory,
    normalizedMerchant: rule.normalizedMerchant ?? normalizedMerchant,
    displayName,
    amount: roundMoney(transaction.amount),
    needsReview: false,
    confidence: clampConfidence(rule.confidence ?? 0.98),
    classificationSource: rule.source ?? "user_rule",
    classificationReason: `Matched user rule ${rule.id}.`,
    reviewedByRuleId: rule.id,
    metadata: { matchedRuleId: rule.id },
  };
}

function makeResult(
  eventType: FinancialEventType,
  rawAmount: number,
  primaryCategory: string,
  subcategory: string | undefined,
  displayName: string,
  normalizedMerchant: string,
  confidence: number,
  classificationSource: string,
  classificationReason: string,
): ClassificationResult {
  return {
    ...buildEventFlags(eventType, rawAmount),
    eventType,
    primaryCategory,
    subcategory: subcategory ? normalizeCategoryLabel(subcategory) : undefined,
    normalizedMerchant,
    displayName,
    amount: roundMoney(rawAmount),
    needsReview: confidence < 0.65 || eventType === "unknown",
    confidence: clampConfidence(confidence),
    classificationSource,
    classificationReason,
  };
}

function flagSet(partial: Partial<FinancialEventFlags>): FinancialEventFlags {
  return {
    cashFlowAmount: partial.cashFlowAmount ?? 0,
    countsAsIncome: partial.countsAsIncome ?? false,
    countsAsSpend: partial.countsAsSpend ?? false,
    countsAsSavings: partial.countsAsSavings ?? false,
    countsAsInvestmentContribution: partial.countsAsInvestmentContribution ?? false,
    countsAsTransfer: partial.countsAsTransfer ?? false,
    internalTransfer: partial.internalTransfer ?? false,
    investmentIncome: partial.investmentIncome ?? false,
    affectsNetWorth: partial.affectsNetWorth ?? true,
  };
}

function isPayrollIncome(text: string, plaidPrimary: string, plaidDetailed: string | undefined, rawAmount: number) {
  if (rawAmount >= 0) return false;
  return matchesAny(text, PAYROLL_KEYWORDS) || plaidPrimary === "INCOME" || plaidDetailed === "PAYROLL";
}

function isCreditCardPayment(text: string, accountRole: AccountRole) {
  if (accountRole === "credit_card" && (text.includes("payment") || text.includes("autopay"))) return true;
  return text.includes("payment") && (matchesAny(text, CARD_PAYMENT_KEYWORDS) || matchesAny(text, CREDIT_BRANDS));
}

function isInvestmentTransfer(text: string, accountRole: AccountRole) {
  return (matchesAny(text, INVESTMENT_BRANDS) || isInvestmentRole(accountRole)) && isTransferText(text);
}

function getInvestmentTransferEventType(rawAmount: number, accountRole: AccountRole): "investment_contribution" | "investment_withdrawal" {
  const isOutflow = rawAmount > 0;
  if (isInvestmentRole(accountRole)) return isOutflow ? "investment_withdrawal" : "investment_contribution";
  return isOutflow ? "investment_contribution" : "investment_withdrawal";
}

function isPlaidTransferCategory(plaidPrimary: string) {
  return plaidPrimary === "TRANSFER" || plaidPrimary === "TRANSFER_IN" || plaidPrimary === "TRANSFER_OUT";
}

function isSavingsTransfer(text: string, accountRole: AccountRole) {
  return (accountRole === "checking" || accountRole === "savings" || accountRole === "cash") && isTransferText(text) && text.includes("saving");
}

function isTransferText(text: string) {
  return matchesAny(text, TRANSFER_KEYWORDS);
}

function inferSpendCategory(text: string, categories: string[] | null | undefined) {
  const existing = normalizeCategoryLabel(categories?.[0]);
  if (existing && existing !== "uncategorized") return existing;
  if (text.includes("grocery") || text.includes("market") || text.includes("whole foods") || text.includes("trader joe")) return "groceries";
  if (text.includes("restaurant") || text.includes("coffee") || text.includes("doordash") || text.includes("uber eats")) return "food_dining";
  if (text.includes("gas") || text.includes("fuel") || text.includes("shell") || text.includes("chevron")) return "transportation";
  if (text.includes("rent") || text.includes("utility") || text.includes("electric") || text.includes("water")) return "housing_utilities";
  if (text.includes("doctor") || text.includes("pharmacy")) return "healthcare";
  return "uncategorized";
}

function normalizeDisplayName(value: string) {
  return value.replace(/\s+/g, " ").trim() || "Transaction";
}

function normalizePlaidCategory(value: string | null | undefined) {
  return normalizeToken(value).toUpperCase();
}

function normalizeCategoryLabel(value: string | null | undefined) {
  const normalized = normalizeToken(value).replace(/_+AND_+/gi, "_");
  if (!normalized) return "uncategorized";
  return normalized.toLowerCase();
}

function normalizeSearchText(values: Array<string | null | undefined> | readonly string[]) {
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

function normalizeToken(value: string | null | undefined) {
  return (value ?? "")
    .toString()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function matchesAny(text: string, needles: readonly string[]) {
  return needles.some((needle) => {
    if (needle.length <= 3) return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(text);
    return text.includes(needle);
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toFinancialEventType(value: string): FinancialEventType {
  return FINANCIAL_EVENT_TYPE_SET.has(value) ? (value as FinancialEventType) : "unknown";
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
