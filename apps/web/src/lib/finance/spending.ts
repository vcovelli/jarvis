export type SpendingGroup = "category" | "account" | "merchant";
export type SpendingScope = { group: SpendingGroup | "all"; keys: Array<string | null>; label: string; spendOnly: boolean };
export type SpendingEvent = {
  id: string;
  accountId: string | null;
  accountName: string | null;
  date: string | Date;
  displayName: string;
  normalizedMerchant: string | null;
  primaryCategory: string;
  subcategory: string | null;
  amount: number;
  cashFlowAmount: number;
  countsAsSpend: boolean;
  pending: boolean;
};
export type SpendingBreakdown = {
  id: string; label: string; value: number; count: number; detail: string; percent: number; keys: Array<string | null>;
};

export function spendingAmount(event: Pick<SpendingEvent, "cashFlowAmount" | "amount">): number {
  return Math.abs(event.cashFlowAmount || event.amount);
}

export function spendingKey(event: SpendingEvent, group: SpendingGroup): string | null {
  if (group === "account") return event.accountId;
  if (group === "merchant") return (event.normalizedMerchant || event.displayName).trim() || "Unknown merchant";
  return event.primaryCategory || "uncategorized";
}

export function spendingLabel(value: string): string {
  return value.split(/[\s_-]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

/** Stable keys keep same-named accounts separate and make Other fully drillable. */
export function buildSpendingBreakdown(events: SpendingEvent[], group: SpendingGroup, limit = 7): SpendingBreakdown[] {
  const totals = new Map<string | null, { label: string; value: number; count: number }>();
  for (const event of events) {
    if (!event.countsAsSpend) continue;
    const key = spendingKey(event, group);
    const label = group === "account" ? event.accountName || "Unknown account" : group === "category" ? spendingLabel(key ?? "uncategorized") : key!;
    const current = totals.get(key) ?? { label, value: 0, count: 0 };
    current.value += spendingAmount(event);
    current.count++;
    totals.set(key, current);
  }
  const total = [...totals.values()].reduce((sum, item) => sum + item.value, 0);
  const sorted = [...totals].sort((a, b) => b[1].value - a[1].value || String(a[0]).localeCompare(String(b[0])));
  const make = (id: string, label: string, keys: Array<string | null>, value: number, count: number): SpendingBreakdown => ({
    id, label, keys, value: Math.round((value + Number.EPSILON) * 100) / 100, count,
    detail: count + (count === 1 ? " transaction" : " transactions"), percent: total ? value / total : 0,
  });
  const items = sorted.slice(0, limit).map(([key, item]) => make(group + ":" + JSON.stringify(key), item.label, [key], item.value, item.count));
  const rest = sorted.slice(limit);
  if (rest.length) items.push(make("other", "Other", rest.map(([key]) => key), rest.reduce((sum, [, item]) => sum + item.value, 0), rest.reduce((sum, [, item]) => sum + item.count, 0)));
  return items;
}

export function matchesSpendingScope(event: SpendingEvent, scope: SpendingScope): boolean {
  if (scope.spendOnly && !event.countsAsSpend) return false;
  return scope.group === "all" || scope.keys.includes(spendingKey(event, scope.group));
}

export function filterSpendingEvents<T extends SpendingEvent>(events: T[], scope: SpendingScope, options: {
  query?: string; accountId?: string; category?: string; sort?: "newest" | "oldest" | "largest";
} = {}): T[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  return events.filter((event) => {
    if (!matchesSpendingScope(event, scope)) return false;
    if (options.accountId && (event.accountId ?? "__unknown__") !== options.accountId) return false;
    if (options.category && event.primaryCategory !== options.category) return false;
    return !query || [event.displayName, event.normalizedMerchant, event.accountName, spendingLabel(event.primaryCategory), event.subcategory].join(" ").toLowerCase().includes(query);
  }).sort((a, b) => {
    if (options.sort === "largest") return spendingAmount(b) - spendingAmount(a) || a.id.localeCompare(b.id);
    const delta = new Date(b.date).getTime() - new Date(a.date).getTime();
    return (options.sort === "oldest" ? -delta : delta) || a.id.localeCompare(b.id);
  });
}

export function spendingHref(scope: SpendingScope, range: string, includePending: boolean, from = "spending"): string {
  const params = new URLSearchParams({ view: "transactions", group: scope.group, keys: JSON.stringify(scope.keys), label: scope.label, activity: scope.spendOnly ? "spend" : "all", range, pending: String(includePending), from });
  return "/v2/finance?" + params.toString();
}

export function readSpendingScope(params: Pick<URLSearchParams, "get">): SpendingScope | null {
  if (params.get("view") !== "transactions") return null;
  const group = params.get("group");
  let keys: Array<string | null> = [];
  try {
    const raw: unknown = JSON.parse(params.get("keys") ?? "[]");
    if (Array.isArray(raw) && raw.length <= 1000 && raw.every((value) => value === null || typeof value === "string")) keys = raw;
  } catch { /* Invalid links show the full list instead of failing the page. */ }
  const validGroup = (group === "category" || group === "account" || group === "merchant") && keys.length > 0 ? group : "all";
  return { group: validGroup, keys, label: validGroup === "all" ? "All transactions" : (params.get("label")?.slice(0, 200) || "Transactions"), spendOnly: params.get("activity") !== "all" };
}
