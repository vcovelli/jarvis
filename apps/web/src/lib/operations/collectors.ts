import os from "node:os";
import { readFile, stat, statfs } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import {
  effectivePreferences,
  fingerprint,
  type Domain,
  type Preferences,
} from "./policy.ts";

export type Signal = {
  code: string;
  title: string;
  severity: "info" | "warning" | "critical";
  detail: string;
};
export type Collection = {
  reasoning?: import("./reasoning.ts").ReasoningResult;
  source: string;
  observedAt: string;
  sourceUpdatedAt: string | null;
  metrics: Record<string, unknown>;
  signals: Signal[];
  limitations: string[];
};
export type CollectorContext = {
  db: PrismaClient;
  userId: string;
  preferences: Preferences;
  signal: AbortSignal;
};
async function limitedText(file: string, signal: AbortSignal) {
  const info = await stat(file);
  if (info.size > 512_000) throw new Error("source_too_large");
  const text = await readFile(file, { encoding: "utf8", signal });
  if (text.length > 512_000) throw new Error("source_too_large");
  return text;
}
export async function collectInfrastructure(
  signal: AbortSignal,
): Promise<Collection> {
  signal.throwIfAborted();
  const disk = await statfs("/");
  const memory = await limitedText("/proc/meminfo", signal);
  const total = Number(memory.match(/^MemTotal:\s+(\d+)/m)?.[1]);
  const available = Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]);
  const memoryUsedPct =
    total > 0 && Number.isFinite(available)
      ? (1 - available / total) * 100
      : null;
  const diskUsedPct =
    disk.blocks > 0 ? (1 - disk.bavail / disk.blocks) * 100 : null;
  const loadPerCore = os.loadavg()[0] / Math.max(1, os.cpus().length);
  const metrics: Record<string, unknown> = {
    hostname: os.hostname(),
    platform: os.platform(),
    cpuCount: os.cpus().length,
    loadPerCore,
    memoryUsedPct,
    diskUsedPct,
    uptimeSeconds: os.uptime(),
  };
  const signals: Signal[] = [];
  const limitations = [
    "Metrics describe the worker's host/container; host scope must be verified at deployment.",
    "CPU uses one-minute load per logical core, not measured CPU utilization.",
  ];
  if (diskUsedPct !== null && diskUsedPct >= 85)
    signals.push({
      code: "disk",
      title: "Root disk capacity needs review",
      severity: diskUsedPct >= 95 ? "critical" : "warning",
      detail: `${diskUsedPct.toFixed(1)}% unavailable on root filesystem.`,
    });
  if (memoryUsedPct !== null && memoryUsedPct >= 90)
    signals.push({
      code: "memory",
      title: "Memory pressure",
      severity: "warning",
      detail: `${memoryUsedPct.toFixed(1)}% of memory is unavailable.`,
    });
  if (loadPerCore > 1.5)
    signals.push({
      code: "load",
      title: "Sustained host load",
      severity: "warning",
      detail: `One-minute load per core is ${loadPerCore.toFixed(2)}.`,
    });
  if (process.env.OPERATIONS_BACKUP_MARKER) {
    try {
      const backup = await stat(process.env.OPERATIONS_BACKUP_MARKER);
      const ageHours = (Date.now() - backup.mtimeMs) / 3600_000;
      metrics.backupAgeHours = ageHours;
      if (ageHours > 36)
        signals.push({
          code: "backup",
          title: "Backup marker is stale",
          severity: "warning",
          detail: `Last marker update was ${Math.floor(ageHours)} hours ago. Verify the backup and restoration procedure.`,
        });
      limitations.push(
        "Backup marker freshness does not prove restore integrity.",
      );
    } catch {
      metrics.backupAgeHours = null;
      signals.push({
        code: "backup",
        title: "Backup freshness unavailable",
        severity: "warning",
        detail: "The configured backup marker cannot be inspected.",
      });
    }
  } else {
    metrics.backupAgeHours = null;
    limitations.push("Backup marker not configured; backup health is unknown.");
  }
  const prometheusUrl =
    process.env.OPERATIONS_PROMETHEUS_URL || process.env.PROMETHEUS_BASE_URL;
  if (prometheusUrl) {
    try {
      const url = new URL("/api/v1/query", prometheusUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("invalid_metrics_url");
      url.searchParams.set("query", "up");
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
        redirect: "error",
      });
      if (!response.ok) throw new Error("metrics_unavailable");
      // Bound the response before JSON parsing; never ingest metric labels into a model.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("missing_body");
      let body = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          body += new TextDecoder().decode(value);
          if (body.length > 256_000) throw new Error("metrics_too_large");
        }
      } finally {
        await reader.cancel();
      }
      const json = JSON.parse(body);
      if (json.status !== "success" || !Array.isArray(json.data?.result))
        throw new Error("invalid_metrics");
      const targets = json.data.result as { value?: unknown[] }[];
      if (
        targets.some(
          (t) =>
            !Array.isArray(t.value) ||
            ![0, 1].includes(Number(t.value[1])) ||
            !Number.isFinite(Number(t.value[0])) ||
            Math.abs(Date.now() / 1000 - Number(t.value[0])) > 300,
        )
      )
        throw new Error("stale_metrics");
      metrics.prometheusTargets = targets.length;
      metrics.prometheusDown = targets.filter(
        (t) => Number(t.value?.[1]) === 0,
      ).length;
      if (Number(metrics.prometheusDown) > 0)
        signals.push({
          code: "services",
          title: "Prometheus targets are down",
          severity: "warning",
          detail: `${metrics.prometheusDown} of ${targets.length} targets report up=0.`,
        });
    } catch {
      metrics.prometheusTargets = null;
      limitations.push(
        "Prometheus unavailable or invalid; service health is unknown.",
      );
    }
  } else
    limitations.push(
      "Prometheus is not configured; individual service health is unknown.",
    );
  return {
    source:
      "Node OS APIs, /proc/meminfo, statfs; optional configured Prometheus and backup marker",
    observedAt: new Date().toISOString(),
    sourceUpdatedAt: new Date().toISOString(),
    metrics,
    signals,
    limitations,
  };
}
async function finance({
  db,
  userId,
  preferences,
}: CollectorContext): Promise<Collection> {
  const now = new Date();
  const since = new Date(+now - 60 * 86400_000);
  const [connections, events, accounts, holdings] = await Promise.all([
    db.financialConnection.findMany({
      where: { userId, provider: "plaid" },
      select: { status: true, lastSyncedAt: true },
    }),
    db.financialEvent.findMany({
      where: {
        userId,
        date: { gte: since, lte: now },
        pending: false,
        internalTransfer: false,
        transaction: { isoCurrencyCode: "USD" },
      },
      select: {
        date: true,
        amount: true,
        cashFlowAmount: true,
        countsAsIncome: true,
        countsAsSpend: true,
        primaryCategory: true,
      },
      take: 10001,
      orderBy: { date: "desc" },
    }),
    db.financialAccount.findMany({
      where: {
        userId,
        type: "depository",
        isoCurrencyCode: "USD",
        connection: { status: "active" },
      },
      select: { availableBalance: true, currentBalance: true },
    }),
    db.investmentHolding.findMany({
      where: { userId, isoCurrencyCode: "USD" },
      select: {
        institutionValue: true,
        providerSecurityId: true,
        updatedAt: true,
      },
      take: 10001,
    }),
  ]);
  const limitations = [
    "USD only; other currencies and unclassified transactions are excluded.",
    "This analysis does not execute trades or transfers.",
    "Portfolio performance requires comparable historical valuations and is unavailable in this V1 summary.",
  ];
  const signals: Signal[] = [];
  const dates = connections
    .map((c) => c.lastSyncedAt)
    .filter((d): d is Date => d !== null);
  const oldest = dates.length ? new Date(Math.min(...dates.map(Number))) : null;
  const stale =
    !oldest ||
    connections.some((c) => !c.lastSyncedAt || c.status !== "active") ||
    +now - +oldest > 36 * 3600_000;
  if (stale)
    signals.push({
      code: "freshness",
      title: "Financial data needs refresh",
      severity: "warning",
      detail:
        "At least one source is missing, inactive, or older than 36 hours. Treat calculations as provisional.",
    });
  if (events.length > 10000 || holdings.length > 10000)
    throw new Error("finance_volume_limit");
  const split = +now - 30 * 86400_000;
  const current = events.filter((e) => +e.date >= split);
  const previous = events.filter((e) => +e.date < split);
  const spend = (items: typeof events) =>
    items
      .filter((e) => e.countsAsSpend)
      .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const spending = spend(current),
    previousSpending = spend(previous);
  const income = current
    .filter((e) => e.countsAsIncome)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const liquid = accounts.reduce(
    (sum, a) => sum + (a.availableBalance ?? a.currentBalance ?? 0),
    0,
  );
  if (
    previousSpending > 0 &&
    spending > previousSpending * 1.3 &&
    spending - previousSpending > 100
  )
    signals.push({
      code: "spending",
      title: "Spending increased over the prior period",
      severity: "warning",
      detail: `Classified USD spending increased ${((spending / previousSpending - 1) * 100).toFixed(0)}% over the previous 30 days. Verify categorization before acting.`,
    });
  if (
    preferences.liquidityUsd > 0 &&
    accounts.length &&
    liquid < preferences.liquidityUsd
  )
    signals.push({
      code: "liquidity",
      title: "Liquidity is below your stated floor",
      severity: "warning",
      detail:
        "Available USD depository balances are below your saved liquidity requirement.",
    });
  if (
    preferences.monthlySpendingUsd > 0 &&
    spending > preferences.monthlySpendingUsd
  )
    signals.push({
      code: "spend-limit",
      title: "Rolling spending exceeds your preference",
      severity: "warning",
      detail:
        "Thirty-day classified USD spending is above your monthly spending preference.",
    });
  const positions = new Map<string, number>();
  for (const h of holdings)
    if (h.providerSecurityId && h.institutionValue && h.institutionValue > 0)
      positions.set(
        h.providerSecurityId,
        (positions.get(h.providerSecurityId) ?? 0) + h.institutionValue,
      );
  const total = [...positions.values()].reduce((a, b) => a + b, 0);
  const concentration = total ? Math.max(...positions.values()) / total : null;
  if (concentration !== null && concentration > 0.4)
    signals.push({
      code: "concentration",
      title: "Review portfolio concentration",
      severity: "info",
      detail:
        "One security exceeds 40% of available USD holdings; fund look-through and other assets are unavailable.",
    });
  if (!events.length)
    limitations.push(
      "No qualifying classified transactions; zero totals do not prove zero financial activity.",
    );
  return {
    source:
      "Existing Plaid-synced records and Jarvis FinancialEvent classifications",
    observedAt: now.toISOString(),
    sourceUpdatedAt: oldest?.toISOString() ?? null,
    metrics: {
      stale,
      connections: connections.length,
      classifiedTransactions: events.length,
      income30dUsd: income,
      spending30dUsd: spending,
      previousSpending30dUsd: previousSpending,
      netCashFlow30dUsd: current.reduce(
        (sum, event) => sum + event.cashFlowAmount,
        0,
      ),
      liquidUsd: accounts.length ? liquid : null,
      largestSecurityShare: concentration,
      verifiedRevenueUsd: null,
    },
    signals,
    limitations,
  };
}
async function business({ db, userId }: CollectorContext): Promise<Collection> {
  const stored = await db.userState.findUnique({
    where: { userId },
    select: { state: true, updatedAt: true },
  });
  const state = stored?.state as
    | {
        todos?: Record<
          string,
          { id?: string; done?: boolean; day?: string; priority?: number }[]
        >;
        deletedTodoIds?: string[];
      }
    | undefined;
  const deleted = new Set(
    Array.isArray(state?.deletedTodoIds) ? state.deletedTodoIds : [],
  );
  const tasks = new Map<
    string,
    { done?: boolean; day?: string; priority?: number }
  >();
  for (const list of Object.values(state?.todos ?? {}))
    if (Array.isArray(list))
      for (const t of list)
        if (t && typeof t.id === "string" && !deleted.has(t.id))
          tasks.set(t.id, t);
  const today = new Date().toISOString().slice(0, 10);
  const open = [...tasks.values()].filter((t) => t.done === false);
  const overdue = open.filter(
    (t) => typeof t.day === "string" && t.day < today,
  ).length;
  return {
    source: "Jarvis saved personal task state",
    observedAt: new Date().toISOString(),
    sourceUpdatedAt: stored?.updatedAt.toISOString() ?? null,
    metrics: {
      openTasks: open.length,
      overdueTasks: overdue,
      revenueUsd: null,
      expensesUsd: null,
    },
    signals: overdue
      ? [
          {
            code: "backlog",
            title: "Review overdue work",
            severity: "info",
            detail: `${overdue} saved tasks are incomplete and dated before today (UTC date boundary).`,
          },
        ]
      : [],
    limitations: [
      "Personal tasks are a proxy for workload, not verified business activity.",
      "No business revenue, expense, customer, or market-demand source is connected.",
    ],
  };
}
async function security({
  db,
  userId,
  signal,
}: CollectorContext): Promise<Collection> {
  const failures = await db.auditLog.count({
    where: {
      userId,
      outcome: "failure",
      createdAt: { gte: new Date(Date.now() - 86400_000) },
      NOT: { action: { startsWith: "operations." } },
    },
  });
  const metrics: Record<string, unknown> = { applicationFailures24h: failures };
  const limitations = [
    "Application audit failures are signals, not proof of intrusion.",
    "No vulnerability scanner or privileged authentication log access is configured.",
    "Listening ports do not prove internet reachability; firewall and routing are not inspected or changed.",
  ];
  const ports = new Set<number>();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      const lines = (await limitedText(file, signal))
        .trim()
        .split("\n")
        .slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[3] === "0A") {
          const [addr, port] = parts[1].split(":");
          if (/^0+$/.test(addr)) ports.add(parseInt(port, 16));
        }
      }
    } catch {
      limitations.push(`Listener telemetry unavailable for ${file}.`);
    }
  }
  metrics.wildcardTcpPorts = [...ports].sort((a, b) => a - b);
  // Hash public service configuration only; no SSH keys, credentials, or log contents.
  try {
    metrics.sshConfigFingerprint = fingerprint(
      await limitedText("/etc/ssh/sshd_config", signal),
    );
  } catch {
    metrics.sshConfigFingerprint = null;
    limitations.push("SSH configuration fingerprint unavailable.");
  }
  return {
    source:
      "Tenant-scoped application AuditLog, proc TCP listeners, SSH configuration fingerprint",
    observedAt: new Date().toISOString(),
    sourceUpdatedAt: new Date().toISOString(),
    metrics,
    signals:
      failures >= 10
        ? [
            {
              code: "failures",
              title: "Elevated application failures",
              severity: "warning",
              detail: `${failures} application failures in the past 24 hours need review.`,
            },
          ]
        : [],
    limitations,
  };
}
export async function collect(
  domain: Domain,
  context: CollectorContext,
): Promise<Collection> {
  context.signal.throwIfAborted();
  if (domain === "infrastructure") return collectInfrastructure(context.signal);
  if (domain === "finance") return finance(context);
  if (domain === "business") return business(context);
  if (domain === "security") return security(context);
  const observations = await context.db.operationsObservation.findMany({
    where: {
      userId: context.userId,
      domain: { in: ["infrastructure", "finance", "business", "security"] },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["domain"],
    take: 4,
  });
  const prefs = effectivePreferences(context.preferences);
  return {
    source: "Latest persisted Jarvis domain observations",
    observedAt: new Date().toISOString(),
    sourceUpdatedAt: observations.length
      ? new Date(
          Math.min(...observations.map((o) => +o.createdAt)),
        ).toISOString()
      : null,
    metrics: {
      observedDomainCount: observations.length,
      warningDomainCount: observations.filter((o) => o.severity !== "info")
        .length,
      domains: observations.map((o) => ({
        domain: o.domain,
        severity: o.severity,
        observedAt: o.createdAt.toISOString(),
        observationId: o.id,
        stale:
          Date.now() - +o.createdAt >
          (o.domain === "infrastructure" || o.domain === "security"
            ? 3600_000
            : 36 * 3600_000),
      })),
      priorities: prefs.businessPriorities,
      temporaryPriority: prefs.temporary || null,
    },
    signals: [],
    limitations: [
      "Summary reflects available observations; missing or stale domains remain unknown.",
      ...(domain === "strategy"
        ? [
            "Weekly evidence review cannot verify predictions or future business value.",
          ]
        : []),
    ],
  };
}
function assertFiniteMetrics(value: unknown, depth = 0): void {
  if (depth > 8) throw new Error("collector_data_too_deep");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("invalid_numeric_observation");
  if (value && typeof value === "object")
    for (const child of Object.values(value))
      assertFiniteMetrics(child, depth + 1);
}
export function validateCollection(value: Collection): Collection {
  assertFiniteMetrics(value?.metrics);
  if (
    !value ||
    !Number.isFinite(Date.parse(value.observedAt)) ||
    (value.sourceUpdatedAt !== null &&
      !Number.isFinite(Date.parse(value.sourceUpdatedAt))) ||
    typeof value.source !== "string" ||
    value.source.length > 1000 ||
    !Array.isArray(value.limitations) ||
    value.limitations.some((v) => typeof v !== "string" || v.length > 2000) ||
    !value.metrics ||
    !Array.isArray(value.signals) ||
    value.signals.length > 20 ||
    JSON.stringify(value).length > 64000
  )
    throw new Error("invalid_collector_output");
  for (const s of value.signals)
    if (
      !["info", "warning", "critical"].includes(s.severity) ||
      typeof s.code !== "string" ||
      typeof s.title !== "string" ||
      typeof s.detail !== "string"
    )
      throw new Error("invalid_signal");
  return value;
}
