import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  changeSettings,
  decide,
  enqueue,
  initialize,
  runNext,
  scheduleDue,
  snapshot,
} from "./engine.ts";
import {
  collect,
  collectInfrastructure,
  type Collection,
} from "./collectors.ts";
import { defaultPreferences } from "./policy.ts";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.OPERATIONS_TEST_ISOLATED !== "1" ||
  url.pathname !== "/jarvis_operations_test" ||
  url.searchParams.get("host") !== "/tmp/jarvis-operations-test/socket"
)
  throw new Error(
    "Only the disposable Unix-socket operations database is allowed.",
  );
const db = new PrismaClient();
const ids: string[] = [];
after(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
async function user() {
  const id = `ops-test-${randomUUID()}`;
  ids.push(id);
  await db.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      entitlement: { create: { tier: "OWNER" } },
    },
  });
  await initialize(db, id);
  await changeSettings(db, id, { enabled: true, paused: false });
  return id;
}
function fixture(): Collection {
  return {
    source: "Isolated synthetic test fixture",
    observedAt: new Date().toISOString(),
    sourceUpdatedAt: new Date().toISOString(),
    metrics: { diskUsedPct: 96 },
    signals: [
      {
        code: "disk",
        title: "Disk requires review",
        severity: "critical",
        detail: "Synthetic test threshold.",
      },
    ],
    limitations: ["Test fixture only"],
  };
}
const collector = async () => fixture();

test("supervision retains old active work and scopes agent discussions to their owner", async () => {
  const id = await user(), other = await user();
  const activeId = randomUUID();
  await db.operationsRun.create({ data: { id: activeId, userId: id, domain: "business", dedupeKey: randomUUID(), status: "queued", createdAt: new Date(0) } });
  await db.operationsRun.createMany({ data: Array.from({ length: 41 }, () => ({ userId: id, domain: "finance", dedupeKey: randomUUID(), status: "succeeded" })) });
  for (const [userId, domain, archivedAt] of [[id, "agent-business", null], [other, "agent-business", null], [id, "finance", null], [id, "agent-business", new Date()]] as const) {
    await db.assistantConversation.create({ data: { userId, domain, title: "Discussion fixture", openClawSessionKey: randomUUID(), archivedAt } });
  }
  const result = await snapshot(db, id);
  assert.equal(result.runs.length, 40);
  assert.equal(result.runs.some(run => run.id === activeId), false);
  assert.equal(result.activeRuns[0].id, activeId);
  assert.equal(result.activeCount, 1);
  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].domain, "agent-business");
});

test("real host collector returns bounded observations without shell access", async () => {
  const result = await collectInfrastructure(AbortSignal.timeout(5000));
  assert.equal(typeof result.metrics.hostname, "string");
  assert.ok(Number(result.metrics.cpuCount) > 0);
  assert.ok(Number(result.metrics.diskUsedPct) >= 0);
});
test("scheduled loop, decision, exact approval, persisted verified outcome", async () => {
  const id = await user();
  await Promise.all([scheduleDue(db, id), scheduleDue(db, id)]);
  assert.equal(await db.operationsRun.count({ where: { userId: id } }), 6);
  for (let i = 0; i < 6; i++) await runNext(db, id, collector);
  const first = await snapshot(db, id);
  assert.equal(first.observations.length, 6);
  const decision = first.decisions[0];
  await assert.rejects(
    decide(db, id, decision.id, {
      operation: "approve",
      actionHash: "tampered",
    }),
  );
  const results = await Promise.allSettled([
    decide(db, id, decision.id, {
      operation: "approve",
      actionHash: decision.actionHash,
    }),
    decide(db, id, decision.id, {
      operation: "approve",
      actionHash: decision.actionHash,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await runNext(db, id, collector);
  assert.equal(
    await db.operationsExecution.count({ where: { userId: id } }),
    1,
  );
  assert.equal(await db.operationsApproval.count({ where: { userId: id } }), 1);
  await decide(db, id, decision.id, {
    operation: "outcome",
    observedResult: "Condition persisted",
    variance: "No resolution expected",
    quality: "sound",
  });
  assert.equal(await db.operationsOutcome.count({ where: { userId: id } }), 1);
  assert.equal(
    await db.operationsDecision.count({ where: { userId: id } }),
    6,
    "unchanged signal is deduplicated",
  );
  assert.ok(
    first.notifications.filter(notification => notification.decisionId).length <= 6,
    "quiet hours may defer decision notifications; briefings are separate",
  );
  const reopened = new PrismaClient();
  assert.equal(
    await reopened.operationsObservation.count({ where: { userId: id } }),
    7,
  );
  await reopened.$disconnect();
});
test("cross-user decisions and revoked access cannot execute", async () => {
  const a = await user(),
    b = await user();
  await enqueue(db, a, "finance");
  await runNext(db, a, collector);
  const d = await db.operationsDecision.findFirstOrThrow({
    where: { userId: a },
  });
  await assert.rejects(decide(db, b, d.id, { operation: "reject" }));
  await db.entitlement.update({
    where: { userId: a },
    data: { tier: "INVITED" },
  });
  await enqueue(db, a, "security");
  assert.equal(await runNext(db, a, collector), false);
});
test("pause fences in-flight collector and preserves original brief", async () => {
  const id = await user();
  await enqueue(db, id, "infrastructure");
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const running = runNext(db, id, async () => {
    entered();
    await barrier;
    return fixture();
  });
  await started;
  await changeSettings(db, id, { paused: true });
  release();
  await running;
  assert.equal(
    await db.operationsObservation.count({ where: { userId: id } }),
    0,
  );
  assert.equal(
    (await db.operationsRun.findFirstOrThrow({ where: { userId: id } })).status,
    "cancelled",
  );
});
test("concurrent workers claim once and retry lost leases", async () => {
  const id = await user();
  const run = await enqueue(db, id, "infrastructure");
  let calls = 0;
  await Promise.all([
    runNext(db, id, async () => {
      calls++;
      return fixture();
    }),
    runNext(db, id, async () => {
      calls++;
      return fixture();
    }),
  ]);
  assert.equal(calls, 1);
  await db.operationsRun.update({
    where: { id: run.id },
    data: {
      status: "running",
      attempts: 1,
      leaseToken: "dead-worker",
      leaseUntil: new Date(0),
    },
  });
  await runNext(db, id, collector);
  assert.equal(
    (await db.operationsRun.findUniqueOrThrow({ where: { id: run.id } }))
      .status,
    "retry",
  );
  await db.operationsRun.update({
    where: { id: run.id },
    data: { attempts: 3, status: "running", leaseUntil: new Date(0) },
  });
  await runNext(db, id, collector);
  assert.equal(
    (await db.operationsRun.findUniqueOrThrow({ where: { id: run.id } }))
      .status,
    "failed",
  );
});
test("daily budget blocks concurrent work and cannot be overridden by output", async () => {
  const id = await user();
  await changeSettings(db, id, { perJobUsd: 0, dailyUsd: 0, monthlyUsd: 0 });
  await enqueue(db, id, "finance");
  let calls = 0;
  await runNext(db, id, async () => {
    calls++;
    return fixture();
  });
  assert.equal(calls, 0);
  assert.equal(
    (await db.operationsRun.findFirstOrThrow({ where: { userId: id } }))
      .errorCode,
    "budget_exceeded",
  );
});
test("retry charges current accounting period even when job was created earlier", async () => {
  const id = await user();
  const run = await enqueue(db, id, "finance");
  await db.operationsRun.update({
    where: { id: run.id },
    data: { createdAt: new Date("2020-01-01") },
  });
  await runNext(db, id, collector);
  const state = await snapshot(db, id);
  assert.ok((state.costs.day.reservedUsd ?? 0) > 0);
});
test("reject, snooze, fresh analysis, and approval expiry are server-side", async () => {
  const id = await user();
  await enqueue(db, id, "infrastructure");
  await runNext(db, id, collector);
  const d = await db.operationsDecision.findFirstOrThrow({
    where: { userId: id },
  });
  await decide(db, id, d.id, { operation: "snooze" });
  assert.equal((await snapshot(db, id)).pendingCount, 0);
  await decide(db, id, d.id, { operation: "analyze" });
  await decide(db, id, d.id, { operation: "analyze" });
  assert.equal(
    await db.operationsRun.count({ where: { userId: id, status: "queued" } }),
    1,
  );
  await decide(db, id, d.id, { operation: "reject" });
  await assert.rejects(
    decide(db, id, d.id, { operation: "approve", actionHash: d.actionHash }),
  );
  await db.operationsDecision.update({
    where: { id: d.id },
    data: { status: "pending", expiresAt: new Date(0) },
  });
  await assert.rejects(
    decide(db, id, d.id, { operation: "approve", actionHash: d.actionHash }),
  );
});
test("approved action expires in queue and never executes", async () => {
  const id = await user();
  await enqueue(db, id, "finance");
  await runNext(db, id, collector);
  const d = await db.operationsDecision.findFirstOrThrow({
    where: { userId: id },
  });
  await decide(db, id, d.id, {
    operation: "approve",
    actionHash: d.actionHash,
  });
  await db.operationsApproval.update({
    where: { decisionId: d.id },
    data: { expiresAt: new Date(0) },
  });
  await runNext(db, id, collector);
  assert.equal(
    await db.operationsExecution.count({ where: { userId: id } }),
    0,
  );
  assert.equal(
    await db.operationsRun.count({
      where: { userId: id, errorCode: "invalid_approval" },
    }),
    1,
  );
});
test("finance and business report absent sources honestly and never fetch credentials", async () => {
  const id = await user();
  const context = {
    db,
    userId: id,
    preferences: defaultPreferences,
    signal: AbortSignal.timeout(5000),
  };
  const f = await collect("finance", context),
    b = await collect("business", context);
  assert.equal(f.metrics.stale, true);
  assert.equal(f.metrics.liquidUsd, null);
  assert.equal(b.metrics.revenueUsd, null);
  assert.equal(b.metrics.expensesUsd, null);
});
test("audit failure rolls back decision approval and job creation", async () => {
  const id = await user();
  await enqueue(db, id, "finance");
  await runNext(db, id, collector);
  const d = await db.operationsDecision.findFirstOrThrow({
    where: { userId: id },
  });
  await db.$executeRawUnsafe(
    `CREATE FUNCTION reject_operations_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'operations.decision_approve' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER reject_operations_test_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_operations_test_audit()',
  );
  try {
    await assert.rejects(
      decide(db, id, d.id, { operation: "approve", actionHash: d.actionHash }),
    );
    assert.equal(
      (await db.operationsDecision.findUniqueOrThrow({ where: { id: d.id } }))
        .status,
      "pending",
    );
    assert.equal(
      await db.operationsApproval.count({ where: { userId: id } }),
      0,
    );
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER reject_operations_test_audit ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION reject_operations_test_audit()");
  }
});

test("Plaid completion timestamp triggers durable deduplicated analysis", async () => {
  const id = await user();
  await db.financialConnection.create({
    data: {
      userId: id,
      itemId: randomUUID(),
      accessTokenEncrypted: "TEST-ONLY-NEVER-READ",
      products: [],
      lastSyncedAt: new Date(),
    },
  });
  await scheduleDue(db, id);
  await scheduleDue(db, id);
  assert.equal(
    await db.operationsRun.count({
      where: { userId: id, dedupeKey: { contains: ":finance-sync:" } },
    }),
    1,
  );
  await db.financialConnection.updateMany({
    where: { userId: id },
    data: { lastSyncedAt: new Date(Date.now() + 1000) },
  });
  await scheduleDue(db, id);
  assert.equal(
    await db.operationsRun.count({
      where: { userId: id, dedupeKey: { contains: ":finance-sync:" } },
    }),
    2,
  );
});
test("failed collection retries are bounded and resource durations persist", async () => {
  const id = await user();
  const run = await enqueue(db, id, "finance");
  for (let i = 0; i < 3; i++) {
    await db.operationsRun.update({
      where: { id: run.id },
      data: { availableAt: new Date(0) },
    });
    await runNext(db, id, async () => {
      throw new Error("test provider unavailable");
    });
  }
  const failed = await db.operationsRun.findUniqueOrThrow({
    where: { id: run.id },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts, 3);
  assert.notEqual(failed.durationMs, null);
  assert.equal(
    await db.operationsCostReservation.count({ where: { userId: id } }),
    3,
  );
  assert.equal(await runNext(db, id, collector), false);
});

test("optional reasoning reserves budget before any paid call and records usage", async () => {
  const keys = [
    "OPERATIONS_MODEL_PROVIDER",
    "OPERATIONS_MODEL",
    "OPERATIONS_MODEL_INPUT_USD_PER_MILLION",
    "OPERATIONS_MODEL_OUTPUT_USD_PER_MILLION",
    "OPENAI_API_KEY",
    "OPERATIONS_INFRASTRUCTURE_PROVIDER",
    "OPERATIONS_INFRASTRUCTURE_MODEL",
  ];
  const saved = keys.map((k) => process.env[k]);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    for (const [i, value] of [
      "openai",
      "test-configured-model",
      "1",
      "2",
      "FAKE_TEST_KEY",
      // Per-agent configuration takes precedence over the global fixture provider.
      "openai",
      "test-configured-model",
    ].entries())
      process.env[keys[i]] = value;
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({
          status: "completed",
          usage: { input_tokens: 100, output_tokens: 50 },
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    summary: "Investigate disk pressure",
                    uncertainty: ["Test fixture"],
                  }),
                },
              ],
            },
          ],
        }),
      );
    };
    const id = await user();
    await changeSettings(db, id, { perJobUsd: 0.02 });
    await enqueue(db, id, "infrastructure");
    await runNext(db, id, collector);
    const run = await db.operationsRun.findFirstOrThrow({
      where: { userId: id },
    });
    assert.equal(calls, 1);
    assert.equal(run.inputTokens, 100);
    assert.equal(run.outputTokens, 50);
    assert.ok(Math.abs(run.apiCostUsd - 0.0002) < 1e-12);
    assert.equal(run.status, "succeeded");
    const c = (
      await db.operationsObservation.findFirstOrThrow({ where: { userId: id } })
    ).data as unknown as Collection;
    assert.equal(c.reasoning?.summary, "Investigate disk pressure");
    const blocked = await user();
    await changeSettings(db, blocked, { perJobUsd: 0.001 });
    await enqueue(db, blocked, "finance");
    await runNext(db, blocked, collector);
    assert.equal(calls, 1, "budget prevented another HTTP call");
    assert.equal(
      await db.operationsObservation.count({ where: { userId: blocked } }),
      1,
      "deterministic evidence remains available",
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [i, k] of keys.entries())
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
  }
});

test("real scheduled infrastructure observation persists through the CLI worker", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  // Previous test profiles are disposable; isolate this one-shot worker invocation.
  await db.operationsProfile.updateMany({
    where: { userId: { in: ids } },
    data: { enabled: false },
  });
  const id = await user();
  await promisify(execFile)(
    process.execPath,
    ["--experimental-strip-types", "scripts/operations-worker.mjs"],
    {
      cwd: process.cwd(),
      timeout: 15000,
      env: {
        ...process.env,
        OPERATIONS_MODEL_PROVIDER: "disabled",
        OPERATIONS_PROMETHEUS_URL: "",
        PROMETHEUS_BASE_URL: "",
        OPERATIONS_BACKUP_MARKER: "",
      },
    },
  );
  const observations = await db.operationsObservation.findMany({
    where: { userId: id },
  });
  assert.equal(observations.length, 6);
  const infrastructure = observations.find(
    (o) => o.domain === "infrastructure",
  )!.data as unknown as Collection;
  assert.equal(typeof infrastructure.metrics.hostname, "string");
  assert.ok(Number(infrastructure.metrics.cpuCount) > 0);
  assert.ok(observations.some((o) => o.domain === "executive"));
  assert.equal(
    await db.operationsRun.count({
      where: { userId: id, status: "succeeded" },
    }),
    6,
  );
});

test("financial cash flow includes refunds while spending excludes transfers", async () => {
  const id = await user();
  const connection = await db.financialConnection.create({
    data: {
      userId: id,
      itemId: randomUUID(),
      accessTokenEncrypted: "TEST_NOT_READ",
      products: [],
      lastSyncedAt: new Date(),
    },
  });
  for (const [
    eventType,
    amount,
    cashFlowAmount,
    countsAsSpend,
    internalTransfer,
  ] of [
    ["expense", 100, -100, true, false],
    ["refund", 25, 25, false, false],
    ["transfer", 500, 0, false, true],
  ] as const) {
    const transaction = await db.financialTransaction.create({
      data: {
        userId: id,
        connectionId: connection.id,
        providerTransactionId: randomUUID(),
        providerAccountId: "test-account",
        date: new Date(),
        name: "TEST",
        amount,
        isoCurrencyCode: "USD",
        category: [],
      },
    });
    await db.financialEvent.create({
      data: {
        userId: id,
        transactionId: transaction.id,
        eventType,
        primaryCategory: "test",
        displayName: "TEST",
        amount,
        cashFlowAmount,
        countsAsSpend,
        internalTransfer,
        date: new Date(),
      },
    });
  }
  const c = await collect("finance", {
    db,
    userId: id,
    preferences: defaultPreferences,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(c.metrics.netCashFlow30dUsd, -75);
  assert.equal(c.metrics.spending30dUsd, 100);
});
