import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type OperationsProfile,
} from "@prisma/client";
import {
  collect,
  validateCollection,
  type Collection,
  type CollectorContext,
  type Signal,
} from "./collectors.ts";
import {
  actionDigest,
  budgetAllows,
  cadence,
  defaultPreferences,
  domains,
  effectivePreferences,
  energyCost,
  fingerprint,
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_RUNTIME_MS,
  notificationTime,
  object,
  OperationsError,
  parsePreferences,
  verifyApproval,
  type Domain,
} from "./policy.ts";
import { modelPlan, reason, type ReasoningResult } from "./reasoning.ts";
import { entitlementAllows } from "../entitlementPolicy.ts";
import { agentChatDomain } from "./supervision.ts";

type Tx = Prisma.TransactionClient;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const txOptions = { maxWait: 5000, timeout: 10000 };
export async function eligible(db: PrismaClient | Tx, userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, entitlement: true },
  });
  if (!u) return false;
  const configured = (process.env.JARVIS_ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map((v) => v.trim())
    .includes(u.email?.toLowerCase() ?? "__none__");
  return entitlementAllows(
    u.entitlement?.tier === "OWNER"
      ? u.entitlement
      : configured
        ? { tier: "ADMIN", status: "active" }
        : (u.entitlement ?? { tier: "INVITED" }),
    "ADMIN",
  );
}
async function lock(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT "userId" FROM "OperationsProfile" WHERE "userId" = ${userId} FOR UPDATE`;
  const profile = await tx.operationsProfile.findUnique({ where: { userId } });
  if (!profile) throw new OperationsError("Initialize Operations first.", 409);
  return profile;
}
async function audit(
  tx: Tx,
  userId: string,
  action: string,
  metadata: unknown = {},
  outcome = "success",
) {
  await tx.auditLog.create({
    data: {
      userId,
      action: `operations.${action}`,
      outcome,
      metadata: json(metadata),
    },
  });
}
async function notify(
  tx: Tx,
  p: OperationsProfile,
  key: string,
  title: string,
  severity: string,
  source: string,
  decisionId?: string,
) {
  await tx.operationsNotification.upsert({
    where: { dedupeKey: `${p.userId}:${key}` },
    update: {},
    create: {
      userId: p.userId,
      dedupeKey: `${p.userId}:${key}`,
      title,
      severity,
      source,
      decisionId,
      availableAt: notificationTime(
        new Date(),
        effectivePreferences(p.preferences),
      ),
    },
  });
}
export async function initialize(db: PrismaClient, userId: string) {
  if (!(await eligible(db, userId)))
    throw new OperationsError("Admin access required.", 403);
  return db.$transaction(async (tx) => {
    await tx.operationsProfile.upsert({
      where: { userId },
      update: {},
      create: { userId, preferences: json(defaultPreferences) },
    });
    await lock(tx, userId);
    for (const domain of domains)
      await tx.operationsSchedule.upsert({
        where: { userId_domain: { userId, domain } },
        update: {},
        create: { userId, domain, nextRunAt: new Date() },
      });
    await audit(tx, userId, "initialized");
  }, txOptions);
}
export async function changeSettings(
  db: PrismaClient,
  userId: string,
  input: unknown,
) {
  const body = object(input);
  if (
    Object.keys(body).some(
      (k) =>
        ![
          "enabled",
          "paused",
          "preferences",
          "perJobUsd",
          "dailyUsd",
          "monthlyUsd",
          "assumedWatts",
          "electricityRate",
        ].includes(k),
    )
  )
    throw new OperationsError("Unknown settings field.");
  const data: Prisma.OperationsProfileUpdateInput = {};
  for (const key of ["enabled", "paused"] as const)
    if (key in body) {
      if (typeof body[key] !== "boolean")
        throw new OperationsError("Invalid switch.");
      data[key] = body[key];
    }
  for (const [key, max] of [
    ["perJobUsd", 10],
    ["dailyUsd", 100],
    ["monthlyUsd", 1000],
    ["assumedWatts", 2000],
    ["electricityRate", 10],
  ] as const)
    if (key in body) {
      if (
        typeof body[key] !== "number" ||
        !Number.isFinite(body[key]) ||
        body[key] < 0 ||
        body[key] > max
      )
        throw new OperationsError(`Invalid ${key}.`);
      data[key] = body[key];
    }
  if (body.preferences !== undefined)
    data.preferences = json(parsePreferences(body.preferences));
  return db.$transaction(async (tx) => {
    const old = await lock(tx, userId);
    const profile = await tx.operationsProfile.update({
      where: { userId },
      data,
    });
    if (
      profile.perJobUsd > profile.dailyUsd ||
      profile.dailyUsd > profile.monthlyUsd
    )
      throw new OperationsError(
        "Budgets must satisfy per-job ≤ daily ≤ monthly.",
      );
    if (profile.paused || !profile.enabled) {
      await tx.operationsRun.updateMany({
        where: { userId, status: { in: ["queued", "running", "retry"] } },
        data: {
          status: "cancelled",
          errorCode: "emergency_pause",
          finishedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }
    await audit(tx, userId, "settings_changed", {
      previous: {
        paused: old.paused,
        enabled: old.enabled,
        preferences: old.preferences,
        perJobUsd: old.perJobUsd,
        dailyUsd: old.dailyUsd,
        monthlyUsd: old.monthlyUsd,
      },
      next: body,
    });
    return profile;
  }, txOptions);
}
export async function enqueue(
  db: PrismaClient,
  userId: string,
  domain: Domain,
  key?: string,
) {
  if (!domains.includes(domain)) throw new OperationsError("Unknown agent.");
  return db.$transaction(async (tx) => {
    const p = await lock(tx, userId);
    if (p.paused || !p.enabled)
      throw new OperationsError("Operations is paused.", 409);
    const dedupeKey = `${userId}:${key ?? `manual:${domain}:${Math.floor(Date.now() / 60000)}`}`;
    const run = await tx.operationsRun.upsert({
      where: { dedupeKey },
      update: {},
      create: { userId, domain, dedupeKey },
    });
    await audit(tx, userId, "run_requested", { runId: run.id, domain });
    return run;
  }, txOptions);
}
export async function scheduleDue(
  db: PrismaClient,
  userId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const p = await lock(tx, userId);
    await tx.operationsProfile.update({
      where: { userId },
      data: { workerSeenAt: now },
    });
    if (p.paused || !p.enabled || !(await eligible(tx, userId))) return 0;
    const due = await tx.operationsSchedule.findMany({
      where: { userId, nextRunAt: { lte: now } },
    });
    for (const s of due) {
      if (!domains.includes(s.domain as Domain)) continue;
      const dedupeKey = `${userId}:schedule:${s.domain}:${s.nextRunAt.toISOString()}`;
      // Coalesce missed periods after downtime; preserve the original due slot.
      await tx.operationsRun.upsert({
        where: { dedupeKey },
        update: {},
        create: { userId, domain: s.domain, dedupeKey },
      });
      await tx.operationsSchedule.update({
        where: { id: s.id },
        data: { nextRunAt: new Date(+now + cadence[s.domain as Domain]) },
      });
    }
    // Existing Plaid sync timestamps act as durable events, without another scheduler.
    const synced = await tx.financialConnection.aggregate({
      where: { userId, provider: "plaid", status: "active" },
      _max: { lastSyncedAt: true },
    });
    if (synced._max.lastSyncedAt) {
      const dedupeKey = `${userId}:finance-sync:${synced._max.lastSyncedAt.toISOString()}`;
      await tx.operationsRun.upsert({
        where: { dedupeKey },
        update: {},
        create: { userId, domain: "finance", dedupeKey },
      });
    }
    return due.length;
  }, txOptions);
}
async function claim(db: PrismaClient, userId: string) {
  return db.$transaction(async (tx) => {
    const p = await lock(tx, userId),
      now = new Date();
    if (p.paused || !p.enabled || !(await eligible(tx, userId))) return null;
    const abandoned = await tx.operationsRun.findMany({
      where: { userId, status: "running", leaseUntil: { lte: now } },
    });
    for (const run of abandoned) {
      const terminal = run.attempts >= MAX_ATTEMPTS;
      await tx.operationsRun.update({
        where: { id: run.id },
        data: {
          status: terminal ? "failed" : "retry",
          availableAt: new Date(+now + 2 ** run.attempts * 1000),
          leaseToken: null,
          leaseUntil: null,
          errorCode: "lease_expired",
          ...(terminal ? { finishedAt: now } : {}),
        },
      });
      await audit(
        tx,
        userId,
        "lease_recovered",
        { runId: run.id, terminal },
        "failure",
      );
      if (terminal)
        await notify(
          tx,
          p,
          `failed:${run.id}`,
          `${run.domain} analysis failed after restart recovery`,
          "warning",
          run.domain,
        );
    }
    // At most one collector per user; finite leases recover process crashes.
    if (await tx.operationsRun.count({ where: { userId, status: "running" } }))
      return null;
    const run = await tx.operationsRun.findFirst({
      where: {
        userId,
        status: { in: ["queued", "retry"] },
        attempts: { lt: MAX_ATTEMPTS },
        availableAt: { lte: now },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!run) return null;
    if (run.approvalId) {
      const approval = await tx.operationsApproval.findFirst({
        where: { id: run.approvalId, userId },
      });
      try {
        if (!approval) throw new Error("missing");
        const action = verifyApproval(
          approval.action,
          approval.actionHash,
          approval.expiresAt,
          now,
        );
        if (action.domain !== run.domain) throw new Error("domain");
      } catch {
        await tx.operationsRun.update({
          where: { id: run.id },
          data: {
            status: "cancelled",
            errorCode: "invalid_approval",
            finishedAt: now,
          },
        });
        await audit(
          tx,
          userId,
          "approval_execution_denied",
          { runId: run.id },
          "failure",
        );
        return null;
      }
    }
    const startDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [day, month] = await Promise.all(
      [startDay, startMonth].map((start) =>
        tx.operationsCostReservation.aggregate({
          where: { userId, createdAt: { gte: start } },
          _sum: { reservedUsd: true },
        }),
      ),
    );
    // Charge maximum possible local energy for every attempt up front, including failures.
    const reserve = energyCost(
      MAX_RUNTIME_MS,
      p.assumedWatts,
      p.electricityRate,
    );
    const dayUsed = day._sum.reservedUsd ?? 0,
      monthUsed = month._sum.reservedUsd ?? 0;
    if (
      run.reservedUsd + reserve > p.perJobUsd ||
      !budgetAllows(
        reserve,
        p.perJobUsd,
        dayUsed,
        p.dailyUsd,
        monthUsed,
        p.monthlyUsd,
      )
    ) {
      await tx.operationsRun.update({
        where: { id: run.id },
        data: {
          status: "blocked",
          errorCode: "budget_exceeded",
          finishedAt: now,
        },
      });
      await audit(tx, userId, "budget_blocked", { runId: run.id }, "failure");
      await notify(
        tx,
        p,
        `budget:${now.toISOString().slice(0, 10)}`,
        "Operations stopped a job at its budget limit",
        "warning",
        "budget",
      );
      return null;
    }
    const claimed = await tx.operationsRun.update({
      where: { id: run.id },
      data: {
        status: "running",
        attempts: { increment: 1 },
        startedAt: now,
        leaseUntil: new Date(+now + LEASE_MS),
        leaseToken: randomUUID(),
        reservedUsd: { increment: reserve },
        assumedWatts: p.assumedWatts,
        electricityRate: p.electricityRate,
        errorCode: null,
      },
    });
    await tx.operationsCostReservation.create({
      data: {
        userId,
        runId: run.id,
        attempt: claimed.attempts,
        reservedUsd: reserve,
      },
    });
    if (
      (p.dailyUsd > 0 && dayUsed + reserve >= p.dailyUsd * 0.8) ||
      (p.monthlyUsd > 0 && monthUsed + reserve >= p.monthlyUsd * 0.8)
    )
      await notify(
        tx,
        p,
        `budget80:${now.toISOString().slice(0, 10)}`,
        "AI operating budget has reached 80%",
        "warning",
        "budget",
      );
    await audit(tx, userId, "run_started", {
      runId: run.id,
      attempt: claimed.attempts,
    });
    return { run: claimed, profile: p };
  }, txOptions);
}
function brief(c: Collection, s: Signal, domain: Domain, preferences: unknown) {
  return {
    whyItMatters: s.detail,
    evidence: c.metrics,
    source: c.source,
    sourceUpdatedAt: c.sourceUpdatedAt,
    observedAt: c.observedAt,
    confidence: c.sourceUpdatedAt
      ? "Deterministic threshold; interpretation needs review"
      : "Limited: source freshness unavailable",
    uncertainty: c.limitations,
    expectedUpside:
      "Earlier detection and an informed review; no quantified financial benefit claimed.",
    downside: [
      "Signals can be transient or incomplete.",
      "A recheck consumes a small amount of local compute.",
    ],
    costOfDoingNothing: "The condition may persist without investigation.",
    cost: "Read-only recheck; bounded by saved operating budget. No purchase or transfer.",
    recommendation: `Review ${domain} evidence, then approve one read-only recheck if useful.`,
    alternatives: [
      "Request additional analysis",
      "Snooze for 24 hours",
      "Reject this recommendation",
    ],
    authorization:
      "Approval permits one observe.recheck with the exact displayed domain and decision ID, before expiry. No remediation.",
    forecast:
      "A recheck will establish whether the observed condition persists; resolution is not predicted.",
    assumptions: [
      "Source records are accurate within their stated scope.",
      ...c.limitations,
    ],
    preferencesAtRecommendation: effectivePreferences(preferences),
    advisoryReasoning: c.reasoning ?? null,
  };
}
async function addReasoning(
  db: PrismaClient,
  userId: string,
  runId: string,
  token: string | null,
  domain: Domain,
  c: Collection,
  signal: AbortSignal,
): Promise<Collection> {
  const previous = await db.operationsObservation.findFirst({
    where: { userId, domain },
    orderBy: { createdAt: "desc" },
  });
  const old = previous?.data as Collection | undefined;
  const materialSignal =
    c.signals.length > 0 &&
    fingerprint(c.signals) !== fingerprint(old?.signals ?? []);
  if (!materialSignal && domain !== "executive" && domain !== "strategy")
    return c;
  let plan;
  try {
    plan = modelPlan(domain);
  } catch {
    c.limitations.push(
      "Optional reasoning configuration is invalid; deterministic evidence retained.",
    );
    return c;
  }
  if (!plan) return c;
  signal.throwIfAborted();
  const reserved = await db.$transaction(async (tx) => {
    const p = await lock(tx, userId),
      now = new Date();
    const run = await tx.operationsRun.findUniqueOrThrow({
      where: { id: runId },
    });
    if (
      p.paused ||
      !p.enabled ||
      run.status !== "running" ||
      run.leaseToken !== token ||
      !(await eligible(tx, userId))
    )
      return null;
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const totals = await Promise.all(
      [dayStart, monthStart].map((start) =>
        tx.operationsCostReservation.aggregate({
          where: { userId, createdAt: { gte: start } },
          _sum: { reservedUsd: true },
        }),
      ),
    );
    if (
      run.reservedUsd + plan.reserveUsd > p.perJobUsd ||
      !budgetAllows(
        plan.reserveUsd,
        p.perJobUsd,
        totals[0]._sum.reservedUsd ?? 0,
        p.dailyUsd,
        totals[1]._sum.reservedUsd ?? 0,
        p.monthlyUsd,
      )
    ) {
      await notify(
        tx,
        p,
        `reasoning-budget:${now.toISOString().slice(0, 10)}`,
        "Optional AI analysis stopped at its budget limit",
        "warning",
        "budget",
      );
      await audit(tx, userId, "reasoning_budget_blocked", { runId }, "failure");
      return null;
    }
    await tx.operationsCostReservation.update({
      where: { runId_attempt: { runId, attempt: run.attempts } },
      data: {
        reservedUsd: { increment: plan.reserveUsd },
        apiCostUsd: plan.reserveUsd,
      },
    });
    await tx.operationsRun.update({
      where: { id: runId },
      data: {
        reservedUsd: { increment: plan.reserveUsd },
        apiCostUsd: { increment: plan.reserveUsd },
        provider: plan.provider,
        model: plan.model,
      },
    });
    await audit(tx, userId, "reasoning_reserved", {
      runId,
      provider: plan.provider,
      model: plan.model,
      upperEstimateUsd: plan.reserveUsd,
    });
    return run.attempts;
  }, txOptions);
  if (!reserved) {
    c.limitations.push(
      "Optional reasoning was skipped by the pause, access, or budget policy.",
    );
    return c;
  }
  signal.throwIfAborted();
  const abort = new AbortController();
  let polling = false;
  const monitor = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const state = await db.operationsRun.findUnique({
        where: { id: runId },
        select: { status: true, leaseToken: true },
      });
      if (state?.status !== "running" || state.leaseToken !== token)
        abort.abort();
    } catch {
      abort.abort();
    } finally {
      polling = false;
    }
  }, 500);
  let result: ReasoningResult;
  try {
    result = await reason(
      plan,
      domain,
      c,
      AbortSignal.any([signal, abort.signal]),
    );
  } catch {
    c.limitations.push(
      "Optional reasoning failed or was cancelled. Reserved API cost remains a conservative estimate; no immediate retry was sent.",
    );
    return c;
  } finally {
    clearInterval(monitor);
  }
  await db.$transaction(async (tx) => {
    const p = await lock(tx, userId);
    const extra = Math.max(0, result.apiEstimateUsd - plan.reserveUsd);
    await tx.operationsCostReservation.update({
      where: { runId_attempt: { runId, attempt: reserved } },
      data: {
        apiCostUsd: result.apiEstimateUsd,
        reservedUsd: { increment: extra },
      },
    });
    await tx.operationsRun.update({
      where: { id: runId },
      data: {
        apiCostUsd: { increment: result.apiEstimateUsd - plan.reserveUsd },
        reservedUsd: { increment: extra },
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        localInferenceMs: result.localInferenceMs,
      },
    });
    if (
      extra > 0 ||
      (result.inputTokens ?? 0) > plan.maxInputTokens ||
      (result.outputTokens ?? 0) > plan.maxOutputTokens
    ) {
      await tx.operationsProfile.update({
        where: { userId },
        data: { paused: true },
      });
      await tx.operationsRun.updateMany({
        where: { userId, status: { in: ["queued", "running", "retry"] } },
        data: {
          status: "cancelled",
          errorCode: "provider_exceeded_budget_assumption",
          leaseToken: null,
          leaseUntil: null,
          finishedAt: new Date(),
        },
      });
      await notify(
        tx,
        p,
        `provider-overrun:${runId}`,
        "Operations paused: model usage exceeded its reserved bound",
        "critical",
        "budget",
      );
      await audit(tx, userId, "provider_overrun", { runId }, "failure");
    }
  }, txOptions);
  return { ...c, reasoning: result };
}
export async function runNext(
  db: PrismaClient,
  userId: string,
  collector: (
    domain: Domain,
    ctx: CollectorContext,
  ) => Promise<Collection> = collect,
) {
  const claimed = await claim(db, userId);
  if (!claimed) return false;
  const { run, profile } = claimed;
  const start = Date.now(),
    controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      collector(run.domain as Domain, {
        db,
        userId,
        preferences: effectivePreferences(profile.preferences),
        signal: controller.signal,
      })
        .then(validateCollection)
        .then((c) =>
          addReasoning(
            db,
            userId,
            run.id,
            run.leaseToken,
            run.domain as Domain,
            c,
            controller.signal,
          ),
        ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("collector_timeout"));
        }, MAX_RUNTIME_MS);
      }),
    ]);
    clearTimeout(timer);
    const c = validateCollection(value);
    await db.$transaction(async (tx) => {
      const p = await lock(tx, userId);
      const current = await tx.operationsRun.findUnique({
        where: { id: run.id },
      });
      if (
        p.paused ||
        !p.enabled ||
        !(await eligible(tx, userId)) ||
        current?.status !== "running" ||
        current.leaseToken !== run.leaseToken ||
        !current.leaseUntil ||
        current.leaseUntil <= new Date()
      )
        return;
      if (run.approvalId) {
        const approval = await tx.operationsApproval.findFirst({
          where: { id: run.approvalId, userId },
        });
        if (!approval) throw new Error("invalid_approval");
        verifyApproval(
          approval.action,
          approval.actionHash,
          approval.expiresAt,
        );
      }
      const previous = await tx.operationsObservation.findFirst({
        where: { userId, domain: run.domain },
        orderBy: { createdAt: "desc" },
      });
      const old = previous?.data as Collection | undefined;
      if (
        run.domain === "security" &&
        old &&
        fingerprint({
          ports: old.metrics.wildcardTcpPorts,
          ssh: old.metrics.sshConfigFingerprint,
        }) !==
          fingerprint({
            ports: c.metrics.wildcardTcpPorts,
            ssh: c.metrics.sshConfigFingerprint,
          })
      )
        c.signals.push({
          code: "drift",
          title: "Security baseline changed",
          severity: "warning",
          detail:
            "Wildcard TCP listeners or the SSH configuration fingerprint changed since the last observation. Review whether this was expected.",
        });
      const hash = fingerprint({
        metrics: c.metrics,
        signals: c.signals,
        limitations: c.limitations,
      });
      const severity = c.signals.some((s) => s.severity === "critical")
        ? "critical"
        : c.signals.some((s) => s.severity === "warning")
          ? "warning"
          : "info";
      const observation = await tx.operationsObservation.create({
        data: {
          userId,
          runId: run.id,
          domain: run.domain,
          severity,
          fingerprint: hash,
          changed: previous?.fingerprint !== hash,
          data: json(c),
        },
      });
      const oldSignals = new Set(old?.signals.map((s) => s.code) ?? []);
      for (const s of c.signals) {
        // Suppress recurring unchanged conditions; re-alert escalation or after seven days.
        const prior = await tx.operationsDecision.findFirst({
          where: { userId, domain: run.domain, title: s.title },
          orderBy: { createdAt: "desc" },
        });
        if (
          prior &&
          oldSignals.has(s.code) &&
          prior.severity === s.severity &&
          Date.now() - +prior.createdAt < 7 * 86400_000
        )
          continue;
        const id = randomUUID(),
          expiresAt = new Date(Date.now() + 7 * 86400_000);
        const action = {
          kind: "observe.recheck",
          domain: run.domain,
          decisionId: id,
        };
        await tx.operationsDecision.create({
          data: {
            id,
            userId,
            observationId: observation.id,
            domain: run.domain,
            title: s.title,
            severity: s.severity,
            brief: json(brief(c, s, run.domain as Domain, p.preferences)),
            action: json(action),
            actionHash: actionDigest(action, expiresAt),
            expiresAt,
          },
        });
        await audit(tx, userId, "decision_created", {
          decisionId: id,
          observationId: observation.id,
        });
        await notify(
          tx,
          p,
          `decision:${id}`,
          s.title,
          s.severity,
          run.domain,
          id,
        );
      }
      const durationMs = Math.min(MAX_RUNTIME_MS, Date.now() - start);
      await tx.operationsRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          durationMs: (current.durationMs ?? 0) + durationMs,
          energyEstimateUsd: {
            increment: energyCost(
              durationMs,
              run.assumedWatts,
              run.electricityRate,
            ),
          },
          leaseToken: null,
          leaseUntil: null,
        },
      });
      await tx.operationsCostReservation.update({
        where: { runId_attempt: { runId: run.id, attempt: run.attempts } },
        data: {
          energyEstimateUsd: energyCost(
            durationMs,
            run.assumedWatts,
            run.electricityRate,
          ),
        },
      });
      if (run.approvalId) {
        await tx.operationsExecution.create({
          data: {
            userId,
            runId: run.id,
            approvalId: run.approvalId,
            result: json({
              observationId: observation.id,
              verified: "Observation persisted",
              conditionResolved: null,
            }),
          },
        });
        await audit(tx, userId, "action_verified", {
          runId: run.id,
          approvalId: run.approvalId,
          observationId: observation.id,
        });
      }
      if (run.domain === "executive" || run.domain === "strategy")
        await notify(
          tx,
          p,
          `briefing:${run.id}`,
          run.domain === "executive"
            ? "Your daily executive briefing is ready"
            : "Your weekly strategic review is ready",
          "info",
          run.domain,
        );
      await audit(tx, userId, "run_completed", {
        runId: run.id,
        observationId: observation.id,
      });
    }, txOptions);
  } catch {
    controller.abort();
    await db.$transaction(async (tx) => {
      const p = await lock(tx, userId);
      const current = await tx.operationsRun.findUnique({
        where: { id: run.id },
      });
      if (
        current?.status !== "running" ||
        current.leaseToken !== run.leaseToken
      )
        return;
      const terminal = run.attempts >= MAX_ATTEMPTS;
      const durationMs = Math.min(MAX_RUNTIME_MS, Date.now() - start);
      await tx.operationsRun.update({
        where: { id: run.id },
        data: {
          status: terminal ? "failed" : "retry",
          errorCode: controller.signal.aborted
            ? "collector_failed_or_timed_out"
            : "collector_failed",
          availableAt: new Date(Date.now() + 2 ** run.attempts * 1000),
          finishedAt: terminal ? new Date() : null,
          leaseToken: null,
          leaseUntil: null,
          durationMs: (current.durationMs ?? 0) + durationMs,
          energyEstimateUsd: {
            increment: energyCost(
              durationMs,
              run.assumedWatts,
              run.electricityRate,
            ),
          },
        },
      });
      await tx.operationsCostReservation.update({
        where: { runId_attempt: { runId: run.id, attempt: run.attempts } },
        data: {
          energyEstimateUsd: energyCost(
            durationMs,
            run.assumedWatts,
            run.electricityRate,
          ),
        },
      });
      await audit(
        tx,
        userId,
        "run_failed",
        { runId: run.id, attempt: run.attempts, terminal },
        "failure",
      );
      await notify(
        tx,
        p,
        `failure:${run.id}`,
        `${run.domain} analysis ${terminal ? "failed" : "will retry"}`,
        "warning",
        run.domain,
      );
    }, txOptions);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return true;
}
export async function decide(
  db: PrismaClient,
  userId: string,
  id: string,
  input: unknown,
) {
  const b = object(input),
    operation = b.operation;
  if (
    !["approve", "reject", "snooze", "analyze", "outcome"].includes(
      String(operation),
    )
  )
    throw new OperationsError("Invalid decision operation.");
  return db.$transaction(async (tx) => {
    const p = await lock(tx, userId);
    const decision = await tx.operationsDecision.findFirst({
      where: { id, userId },
    });
    if (!decision) throw new OperationsError("Decision not found.", 404);
    if (operation === "outcome") {
      if (
        typeof b.observedResult !== "string" ||
        !b.observedResult.trim() ||
        b.observedResult.length > 2000 ||
        typeof b.variance !== "string" ||
        !b.variance.trim() ||
        b.variance.length > 2000 ||
        !["sound", "unsound", "uncertain"].includes(String(b.quality))
      )
        throw new OperationsError(
          "Provide observed result, variance, and decision quality.",
        );
      const outcome = await tx.operationsOutcome.create({
        data: {
          userId,
          decisionId: id,
          observedResult: b.observedResult,
          variance: b.variance,
          quality: String(b.quality),
        },
      });
      await audit(tx, userId, "outcome_recorded", {
        decisionId: id,
        outcomeId: outcome.id,
      });
      return outcome;
    }
    if (
      decision.expiresAt <= new Date() ||
      !["pending", "snoozed"].includes(decision.status)
    )
      throw new OperationsError(
        "Decision is expired or already resolved.",
        409,
      );
    if (operation === "approve") {
      if (p.paused || !p.enabled)
        throw new OperationsError(
          "Resume Operations before approving a recheck.",
          409,
        );
      if (b.actionHash !== decision.actionHash)
        throw new OperationsError(
          "Review the current exact action before approving.",
          409,
        );
      verifyApproval(decision.action, decision.actionHash, decision.expiresAt);
      const approval = await tx.operationsApproval.create({
        data: {
          userId,
          decisionId: id,
          action: decision.action as Prisma.InputJsonValue,
          actionHash: decision.actionHash,
          expiresAt: decision.expiresAt,
        },
      });
      await tx.operationsRun.create({
        data: {
          userId,
          domain: decision.domain,
          dedupeKey: `${userId}:approval:${approval.id}`,
          approvalId: approval.id,
        },
      });
      await tx.operationsDecision.update({
        where: { id },
        data: { status: "approved", decidedAt: new Date() },
      });
    } else if (operation === "reject")
      await tx.operationsDecision.update({
        where: { id },
        data: { status: "rejected", decidedAt: new Date() },
      });
    else if (operation === "snooze")
      await tx.operationsDecision.update({
        where: { id },
        data: {
          status: "snoozed",
          snoozedUntil: new Date(
            Math.min(Date.now() + 86400_000, +decision.expiresAt),
          ),
        },
      });
    else {
      if (p.paused || !p.enabled)
        throw new OperationsError("Operations is paused.", 409);
      const dedupeKey = `${userId}:analysis:${id}:${new Date().toISOString().slice(0, 10)}`;
      await tx.operationsRun.upsert({
        where: { dedupeKey },
        update: {},
        create: { userId, domain: decision.domain, dedupeKey },
      });
    }
    if (operation === "approve" || operation === "reject")
      await tx.operationsNotification.updateMany({
        where: { userId, decisionId: id, readAt: null },
        data: { readAt: new Date() },
      });
    if (operation === "snooze")
      await tx.operationsNotification.updateMany({
        where: { userId, decisionId: id, readAt: null },
        data: {
          availableAt: notificationTime(
            new Date(Math.min(Date.now() + 86400_000, +decision.expiresAt)),
            effectivePreferences(p.preferences),
          ),
        },
      });
    await audit(tx, userId, `decision_${operation}`, {
      decisionId: id,
      ...(operation === "approve" ? { actionHash: decision.actionHash } : {}),
    });
    return { ok: true };
  }, txOptions);
}
export async function snapshot(db: PrismaClient, userId: string) {
  const now = new Date(),
    monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  const [
    profile,
    schedules,
    observations,
    decisions,
    runs,
    notifications,
    history,
    outcomes,
    executions,
    month,
    day,
    pendingCount,
    activeCount,
    activeRuns,
    conversations,
  ] = await Promise.all([
    db.operationsProfile.findUnique({ where: { userId } }),
    db.operationsSchedule.findMany({
      where: { userId },
      orderBy: { nextRunAt: "asc" },
    }),
    db.operationsObservation.findMany({
      where: { userId },
      distinct: ["domain"],
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.operationsDecision.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.operationsRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        domain: true,
        status: true,
        attempts: true,
        availableAt: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        errorCode: true,
        reservedUsd: true,
        apiCostUsd: true,
        energyEstimateUsd: true,
        assumedWatts: true,
        electricityRate: true,
        provider: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        localInferenceMs: true,
        estimatedBusinessValueUsd: true,
        verifiedRevenueUsd: true,
        createdAt: true,
      },
    }),
    db.operationsNotification.findMany({
      where: { userId, availableAt: { lte: now } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.auditLog.findMany({
      where: { userId, action: { startsWith: "operations." } },
      select: { id: true, action: true, outcome: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.operationsOutcome.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.operationsExecution.findMany({
      where: { userId },
      orderBy: { verifiedAt: "desc" },
      take: 20,
    }),
    db.operationsCostReservation.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { apiCostUsd: true, energyEstimateUsd: true, reservedUsd: true },
    }),
    db.operationsCostReservation.aggregate({
      where: { userId, createdAt: { gte: dayStart } },
      _sum: { apiCostUsd: true, energyEstimateUsd: true, reservedUsd: true },
    }),
    db.operationsDecision.count({
      where: {
        userId,
        expiresAt: { gt: now },
        OR: [
          { status: "pending" },
          { status: "snoozed", snoozedUntil: { lte: now } },
        ],
      },
    }),
    db.operationsRun.count({
      where: { userId, status: { in: ["running", "queued", "retry"] } },
    }),
    db.operationsRun.findMany({
      where: { userId, status: { in: ["running", "queued", "retry"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, domain: true, status: true, attempts: true, availableAt: true, startedAt: true, createdAt: true, errorCode: true },
    }),
    db.assistantConversation.findMany({
      where: { userId, archivedAt: null, domain: { in: domains.map(agentChatDomain) } },
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: { id: true, domain: true, title: true, updatedAt: true },
    }),
  ]);
  return {
    profile,
    schedules,
    observations,
    decisions,
    runs,
    notifications,
    history,
    outcomes,
    executions,
    costs: { month: month._sum, day: day._sum },
    pendingCount,
    activeCount,
    activeRuns,
    conversations,
    generatedAt: now.toISOString(),
    reasoning: domains.map(domain => {
      try {
        const plan = modelPlan(domain);
        return { domain, state: plan ? "Configured" : "Rules only", detail: plan ? `${plan.provider} / ${plan.model}. Configuration valid; live model connectivity is not tested here.` : "Deterministic observations and recommendations. Optional model reasoning is disabled." };
      } catch {
        return { domain, state: "Needs setup", detail: "Reasoning configuration is incomplete. Review the server provider, model, and cost settings." };
      }
    }),
    modelStatus:
      "Deterministic collection always runs first. Optional server-configured OpenAI or local reasoning has no tools and requires reserved budget. OpenClaw remains available in the existing interactive Assistant; autonomous gateway execution is disabled.",
  };
}
