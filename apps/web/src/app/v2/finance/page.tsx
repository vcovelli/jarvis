"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type FinanceSummary = {
  setup: FinanceSetup;
  connections: FinanceConnection[];
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  holdings: InvestmentHolding[];
  updatedAt: number;
};

type ActionStatus = "idle" | "loading" | "syncing" | "error";

let plaidScriptPromise: Promise<void> | null = null;

export default function FinancePage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [status, setStatus] = useState<ActionStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setStatus((current) => (current === "idle" ? "loading" : current));
    try {
      const data = await fetchJson<FinanceSummary>("/api/finance/summary", {
        cache: "no-store",
      });
      setSummary(data);
      setMessage(null);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const metrics = useMemo(() => buildFinanceMetrics(summary), [summary]);
  const accountNameById = useMemo(() => {
    return new Map((summary?.accounts ?? []).map((account) => [account.id, account.name]));
  }, [summary?.accounts]);

  const connectPlaid = useCallback(async () => {
    setStatus("loading");
    setMessage(null);
    try {
      await loadPlaidScript();
      const data = await fetchJson<{ linkToken: string }>("/api/finance/plaid/link-token", {
        method: "POST",
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
            body: JSON.stringify({ publicToken, metadata }),
          });
          await loadSummary();
          setMessage("Connection synced.");
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
  }, [loadSummary]);

  const syncFinance = useCallback(async () => {
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
  }, [loadSummary]);

  const isBusy = status === "loading" || status === "syncing";
  const setup = summary?.setup;

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Finance</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Personal Tracker</h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-300">
              Read-only Plaid connections, account balances, spending, and investment holdings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void connectPlaid()}
              disabled={isBusy || setup?.configured === false}
              className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:opacity-55"
            >
              Connect Plaid
            </button>
            <button
              type="button"
              onClick={() => void syncFinance()}
              disabled={isBusy || !summary?.connections.length}
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/75 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              Sync
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <StatusPill label={setup?.configured ? "Plaid ready" : "Setup needed"} tone={setup?.configured ? "good" : "warn"} />
          {setup && <StatusPill label={setup.environment} tone="neutral" />}
          {setup?.products.map((product) => <StatusPill key={product} label={product} tone="neutral" />)}
          {summary?.connections.map((connection) => (
            <StatusPill
              key={connection.id}
              label={connection.institutionName ?? connection.provider}
              tone={connection.status === "active" ? "good" : "warn"}
            />
          ))}
        </div>

        {message && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
            {message}
          </div>
        )}

        {setup && !setup.configured && (
          <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Plaid credentials are missing.</p>
            <p className="mt-2 text-amber-100/80">
              Add {setup.missing.map((item) => <code key={item} className="mx-1 rounded bg-black/30 px-1.5 py-0.5 text-amber-50">{item}</code>)} to enable account linking.
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Net worth" value={formatMoney(metrics.netWorth)} detail={`${summary?.accounts.length ?? 0} accounts`} />
          <MetricCard label="Cash" value={formatMoney(metrics.cash)} detail="Depository balances" />
          <MetricCard label="Investments" value={formatMoney(metrics.investments)} detail={`${summary?.holdings.length ?? 0} holdings`} />
          <MetricCard label="30-day spend" value={formatMoney(metrics.spend30)} detail={`${metrics.transactionCount30} transactions`} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr,1.1fr]">
        <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Accounts</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Balances</h3>
            </div>
            <p className="text-xs text-zinc-500">{formatRelativeSync(summary?.connections)}</p>
          </div>
          <div className="mt-5 space-y-3">
            {(summary?.accounts ?? []).length ? (
              summary?.accounts.map((account) => <AccountRow key={account.id} account={account} />)
            ) : (
              <EmptyState text="Connected accounts will appear here." />
            )}
          </div>
        </section>

        <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Transactions</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Recent Flow</h3>
            </div>
            <StatusPill label={status === "syncing" ? "syncing" : "read-only"} tone={status === "syncing" ? "warn" : "neutral"} />
          </div>
          <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {(summary?.transactions ?? []).length ? (
              summary?.transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  accountName={transaction.accountId ? accountNameById.get(transaction.accountId) : undefined}
                />
              ))
            ) : (
              <EmptyState text="Synced transactions will appear here." />
            )}
          </div>
        </section>
      </div>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Investments</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Holdings</h3>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.holdings ?? []).length ? (
            summary?.holdings.map((holding) => <HoldingCard key={holding.id} holding={holding} />)
          ) : (
            <EmptyState text="Investment holdings will appear here after a Plaid investment sync." />
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function AccountRow({ account }: { account: FinanceAccount }) {
  const balance = account.currentBalance ?? account.availableBalance ?? 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{account.name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-zinc-500">
            {[account.type, account.subtype, account.mask ? `xx${account.mask}` : undefined].filter(Boolean).join(" - ")}
          </p>
        </div>
        <p className="whitespace-nowrap text-sm font-semibold text-white tabular-nums">{formatMoney(balance)}</p>
      </div>
    </div>
  );
}

function TransactionRow({
  transaction,
  accountName,
}: {
  transaction: FinanceTransaction;
  accountName?: string;
}) {
  const isOutflow = transaction.amount > 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {transaction.merchantName ?? transaction.name}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDate(transaction.date)}{accountName ? ` - ${accountName}` : ""}
          </p>
          {transaction.category.length > 0 && (
            <p className="mt-2 truncate text-xs text-zinc-400">{transaction.category.join(" / ")}</p>
          )}
        </div>
        <p className={(isOutflow ? "text-rose-200" : "text-emerald-200") + " whitespace-nowrap text-sm font-semibold tabular-nums"}>
          {isOutflow ? "-" : "+"}{formatMoney(Math.abs(transaction.amount))}
        </p>
      </div>
    </div>
  );
}

function HoldingCard({ holding }: { holding: InvestmentHolding }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {holding.tickerSymbol ?? holding.securityName ?? "Holding"}
          </p>
          {holding.securityName && holding.tickerSymbol && (
            <p className="mt-1 truncate text-xs text-zinc-500">{holding.securityName}</p>
          )}
        </div>
        <p className="whitespace-nowrap text-sm font-semibold text-white tabular-nums">
          {formatMoney(holding.institutionValue ?? 0)}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-400">
        <div>
          <p className="uppercase tracking-[0.25em] text-zinc-500">Qty</p>
          <p className="mt-1 text-white tabular-nums">{formatNumber(holding.quantity)}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.25em] text-zinc-500">Price</p>
          <p className="mt-1 text-white tabular-nums">{formatMoney(holding.institutionPrice ?? 0)}</p>
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

function StatusPill({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  const classes =
    tone === "good"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-white/10 bg-white/5 text-white/70";
  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${classes}`}>
      {label}
    </span>
  );
}

function buildFinanceMetrics(summary: FinanceSummary | null) {
  const accounts = summary?.accounts ?? [];
  const transactions = summary?.transactions ?? [];
  const netWorth = accounts.reduce((total, account) => total + accountContribution(account), 0);
  const cash = accounts
    .filter((account) => account.type === "depository")
    .reduce((total, account) => total + (account.currentBalance ?? account.availableBalance ?? 0), 0);
  const investments = accounts
    .filter((account) => account.type === "investment")
    .reduce((total, account) => total + (account.currentBalance ?? 0), 0);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentOutflows = transactions.filter(
    (transaction) => transaction.amount > 0 && new Date(transaction.date).getTime() >= cutoff,
  );
  const spend30 = recentOutflows.reduce((total, transaction) => total + transaction.amount, 0);
  return { netWorth, cash, investments, spend30, transactionCount30: recentOutflows.length };
}

function accountContribution(account: FinanceAccount) {
  const balance = account.currentBalance ?? account.availableBalance ?? 0;
  if (account.type === "credit" || account.type === "loan") {
    return -Math.abs(balance);
  }
  return balance;
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

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
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
  return `Synced ${new Date(latest).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
