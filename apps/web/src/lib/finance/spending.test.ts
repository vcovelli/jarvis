import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpendingBreakdown,
  filterSpendingEvents,
  matchesSpendingScope,
  readSpendingScope,
  spendingAmount,
  spendingHref,
  spendingKey,
  type SpendingEvent,
  type SpendingScope,
} from "./spending.ts";

function event(id: string, overrides: Partial<SpendingEvent> = {}): SpendingEvent {
  return {
    id,
    accountId: "checking-1",
    accountName: "Checking",
    date: "2026-09-01",
    displayName: "Neighborhood Market",
    normalizedMerchant: "Neighborhood Market",
    primaryCategory: "groceries",
    subcategory: "supermarkets",
    amount: 25,
    cashFlowAmount: -25,
    countsAsSpend: true,
    pending: false,
    ...overrides,
  };
}

const allActivity: SpendingScope = { group: "all", keys: [], label: "All transactions", spendOnly: false };
const allSpending: SpendingScope = { ...allActivity, spendOnly: true };
const ids = (events: SpendingEvent[]) => events.map((item) => item.id);

function linkParams(scope: SpendingScope): URLSearchParams {
  return new URL(spendingHref(scope, "90d", true), "https://jarvis.test").searchParams;
}

test("category breakdown retains original keys even when display labels match", () => {
  const rows = buildSpendingBreakdown([
    event("underscore", { primaryCategory: "food_dining", amount: 40, cashFlowAmount: -40 }),
    event("hyphen", { primaryCategory: "food-dining", amount: 20, cashFlowAmount: -20 }),
    event("uncategorized", { primaryCategory: "" }),
  ], "category");

  assert.deepEqual(rows.map(({ label, keys }) => ({ label, keys })), [
    { label: "Food Dining", keys: ["food_dining"] },
    { label: "Uncategorized", keys: ["uncategorized"] },
    { label: "Food Dining", keys: ["food-dining"] },
  ]);
  assert.equal(new Set(rows.map(({ id }) => id)).size, 3);
  assert.equal(rows[0].id, buildSpendingBreakdown([
    event("same-category", { primaryCategory: "food_dining" }),
  ], "category")[0].id);
});

test("same-named accounts drill into their own IDs and unknown accounts keep a null key", () => {
  const events = [
    event("first-bank", { accountId: "bank-a", amount: 40, cashFlowAmount: -40 }),
    event("second-bank", { accountId: "bank-b", amount: 30, cashFlowAmount: -30 }),
    event("unknown", { accountId: null, accountName: null }),
  ];
  const rows = buildSpendingBreakdown(events, "account");

  assert.deepEqual(rows.map(({ label, keys }) => ({ label, keys })), [
    { label: "Checking", keys: ["bank-a"] },
    { label: "Checking", keys: ["bank-b"] },
    { label: "Unknown account", keys: [null] },
  ]);
  assert.equal(new Set(rows.map(({ id }) => id)).size, 3);
  for (const [index, row] of rows.entries()) {
    assert.deepEqual(ids(filterSpendingEvents(events, {
      group: "account", keys: row.keys, label: row.label, spendOnly: true,
    })), [events[index].id]);
  }
});

test("merchant grouping uses normalized names with a display-name fallback", () => {
  const events = [
    event("normalized", { displayName: "MARKET #001", normalizedMerchant: "Market" }),
    event("fallback", { displayName: "  Market  ", normalizedMerchant: null }),
    event("unknown", { displayName: " ", normalizedMerchant: null }),
  ];
  const rows = buildSpendingBreakdown(events, "merchant");

  assert.equal(spendingKey(events[1], "merchant"), "Market");
  assert.deepEqual(rows.map(({ keys, count }) => ({ keys, count })), [
    { keys: ["Market"], count: 2 },
    { keys: ["Unknown merchant"], count: 1 },
  ]);
  assert.deepEqual(ids(filterSpendingEvents(events, {
    group: "merchant", keys: ["Market"], label: "Market", spendOnly: true,
  })), ["fallback", "normalized"]);
});

test("Other contains every remaining category and its drilldown reconciles to the chart", () => {
  const events = [
    event("a", { primaryCategory: "housing", amount: 100, cashFlowAmount: -100 }),
    event("b", { primaryCategory: "groceries", amount: 50, cashFlowAmount: -50 }),
    event("c", { primaryCategory: "transportation", amount: 20, cashFlowAmount: -20 }),
    event("d", { primaryCategory: "transportation", amount: 10, cashFlowAmount: -10 }),
    event("e", { primaryCategory: "entertainment", amount: 10, cashFlowAmount: -10 }),
    event("f", { primaryCategory: "healthcare", amount: 10, cashFlowAmount: -10 }),
    event("refund", { primaryCategory: "healthcare", amount: -10, cashFlowAmount: 10, countsAsSpend: false }),
  ];
  const rows = buildSpendingBreakdown(events, "category", 2);
  const other = rows[2];
  assert.equal(other.label, "Other");
  assert.deepEqual(other.keys, ["transportation", "entertainment", "healthcare"]);
  const matches = filterSpendingEvents(events, { group: "category", keys: other.keys, label: other.label, spendOnly: true });

  assert.deepEqual(ids(matches), ["c", "d", "e", "f"]);
  assert.equal(other.value, matches.reduce((sum, item) => sum + spendingAmount(item), 0));
  assert.equal(other.count, matches.length);
  assert.equal(other.detail, "4 transactions");
  assert.equal(other.percent, 0.25);
  assert.equal(rows.reduce((sum, item) => sum + item.value, 0), 200);
  assert.equal(rows.reduce((sum, item) => sum + item.percent, 0), 1);
});

test("breakdowns ignore non-spending, round currency, and handle empty results", () => {
  const events = [
    event("first", { amount: 0.1, cashFlowAmount: -0.1 }),
    event("second", { amount: 0.2, cashFlowAmount: -0.2 }),
    event("payroll", { amount: -1000, cashFlowAmount: 1000, countsAsSpend: false }),
  ];
  const rows = buildSpendingBreakdown(events, "category");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 0.3);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].percent, 1);
  assert.deepEqual(buildSpendingBreakdown([], "category"), []);
  assert.deepEqual(buildSpendingBreakdown([events[2]], "category"), []);
});

test("spending scope excludes income, transfers, and refunds while all activity includes them", () => {
  const events = [
    event("expense"),
    event("income", { amount: -1200, cashFlowAmount: 1200, countsAsSpend: false, primaryCategory: "income" }),
    event("transfer", { amount: 300, cashFlowAmount: 0, countsAsSpend: false, primaryCategory: "transfer" }),
    event("refund", { amount: -25, cashFlowAmount: 25, countsAsSpend: false }),
    event("other-account", { accountId: "checking-2" }),
  ];
  const accountScope: SpendingScope = { group: "account", keys: ["checking-1"], label: "Checking", spendOnly: true };

  assert.deepEqual(ids(filterSpendingEvents(events, accountScope)), ["expense"]);
  assert.deepEqual(ids(filterSpendingEvents(events, { ...accountScope, spendOnly: false })), ["expense", "income", "refund", "transfer"]);
  assert.deepEqual(ids(filterSpendingEvents(events, allSpending)), ["expense", "other-account"]);
  assert.deepEqual(ids(filterSpendingEvents(events, allActivity)), ["expense", "income", "other-account", "refund", "transfer"]);
  assert.equal(matchesSpendingScope(events[3], { group: "category", keys: ["groceries"], label: "Groceries", spendOnly: false }), true);
});

test("search, account, category, and drilldown scope narrow the same transaction list", () => {
  const events = [
    event("match", { normalizedMerchant: "Harbor Market" }),
    event("wrong-account", { normalizedMerchant: "Harbor Market", accountId: "checking-2" }),
    event("wrong-category", { normalizedMerchant: "Harbor Market", primaryCategory: "shopping" }),
    event("wrong-search", { normalizedMerchant: "Corner Store" }),
    event("refund", { normalizedMerchant: "Harbor Market", countsAsSpend: false }),
  ];
  const scope: SpendingScope = { group: "category", keys: ["groceries", "shopping"], label: "Other", spendOnly: true };

  assert.deepEqual(ids(filterSpendingEvents(events, scope, {
    query: "  HARBOR  ", accountId: "checking-1", category: "groceries",
  })), ["match"]);
  assert.deepEqual(filterSpendingEvents(events, { ...scope, keys: ["healthcare"] }, { query: "harbor" }), []);
});

test("search finds display names, merchant names, accounts, readable categories, and subcategories", () => {
  const item = event("match", {
    displayName: "Card purchase #001", normalizedMerchant: "Harbor Cafe", accountName: "Travel card",
    primaryCategory: "food_dining", subcategory: "restaurants",
  });
  for (const query of ["purchase", "harbor", "travel", "food dining", "restaurants", "   "]) {
    assert.deepEqual(ids(filterSpendingEvents([item], allActivity, { query })), ["match"], query);
  }
  assert.deepEqual(filterSpendingEvents([item], allActivity, { query: "not present" }), []);
});

test("unknown-account filter selects missing accounts without selecting named accounts", () => {
  const events = [event("known"), event("unknown", { accountId: null, accountName: null })];
  assert.deepEqual(ids(filterSpendingEvents(events, allActivity, { accountId: "__unknown__" })), ["unknown"]);
});

test("sorts dates and transaction amounts consistently without changing the source array", () => {
  const events = [
    event("new", { date: new Date("2026-09-03T00:00:00Z"), amount: 10, cashFlowAmount: -10 }),
    event("old-b", { date: "2026-09-01", amount: 20, cashFlowAmount: -20 }),
    event("transfer", { date: "2026-09-02", amount: 500, cashFlowAmount: 0, countsAsSpend: false }),
    event("old-a", { date: "2026-09-01", amount: 20, cashFlowAmount: -20 }),
    event("refund", { date: "2026-09-04", amount: -50, cashFlowAmount: 50, countsAsSpend: false }),
  ];
  const originalOrder = ids(events);

  assert.deepEqual(ids(filterSpendingEvents(events, allActivity)), ["refund", "new", "transfer", "old-a", "old-b"]);
  assert.deepEqual(ids(filterSpendingEvents(events, allActivity, { sort: "oldest" })), ["old-a", "old-b", "transfer", "new", "refund"]);
  assert.deepEqual(ids(filterSpendingEvents(events, allActivity, { sort: "largest" })), ["transfer", "refund", "old-a", "old-b", "new"]);
  assert.deepEqual(ids(events), originalOrder);
});

test("deep links preserve group keys, activity, date range, pending state, and return view", () => {
  const scope: SpendingScope = { group: "account", keys: ['bank/1?name="A&B"', null], label: "Checking & savings / 家", spendOnly: false };
  const url = new URL(spendingHref(scope, "all", false, "accounts"), "https://jarvis.test");

  assert.equal(url.pathname, "/v2/finance");
  assert.deepEqual(readSpendingScope(url.searchParams), scope);
  assert.equal(url.searchParams.get("range"), "all");
  assert.equal(url.searchParams.get("pending"), "false");
  assert.equal(url.searchParams.get("from"), "accounts");
  const categoryScope: SpendingScope = { group: "category", keys: ["food_dining", "groceries"], label: "Other", spendOnly: true };
  assert.deepEqual(readSpendingScope(linkParams(categoryScope)), categoryScope);
  assert.equal(linkParams(categoryScope).get("from"), "spending");
});

test("scope parsing activates only on the transaction view and handles missing parameters", () => {
  assert.equal(readSpendingScope(new URLSearchParams()), null);
  assert.equal(readSpendingScope(new URLSearchParams({ view: "spending", group: "category", keys: '["groceries"]' })), null);
  assert.deepEqual(readSpendingScope(new URLSearchParams({ view: "transactions" })), {
    group: "all", keys: [], label: "All transactions", spendOnly: true,
  });
  assert.deepEqual(readSpendingScope(linkParams(allActivity)), allActivity);
});

test("malformed and oversized scope keys safely fall back to all transactions", () => {
  for (const keys of ["{", "null", '"groceries"', '{"category":"groceries"}', '["groceries", 1]', '[{}]', '[]', JSON.stringify(Array(1001).fill("groceries"))]) {
    const scope = readSpendingScope(new URLSearchParams({ view: "transactions", group: "category", keys, label: "Invalid category", activity: "all" }));
    assert.deepEqual(scope, { group: "all", keys: [], label: "All transactions", spendOnly: false }, keys.slice(0, 60));
  }
  const unknownGroup = readSpendingScope(new URLSearchParams({ view: "transactions", group: "unsupported", keys: '["groceries"]' }));
  assert.equal(unknownGroup?.group, "all");
  assert.equal(unknownGroup?.label, "All transactions");
});

test("scope parsing limits labels and uses safe defaults for missing labels and activity", () => {
  const params = new URLSearchParams({ view: "transactions", group: "merchant", keys: '["Market"]', label: "x".repeat(250), activity: "invalid" });
  assert.equal(readSpendingScope(params)?.label.length, 200);
  assert.equal(readSpendingScope(params)?.spendOnly, true);
  params.delete("label");
  assert.equal(readSpendingScope(params)?.label, "Transactions");
});
