import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { serverAccess, contentHash, type Candidate } from "./policy.ts";
import {
  consolidate,
  deleteMemory,
  enqueue,
  lockMemory,
  saveManual,
} from "./store.ts";
import { clearMemoryCaches, listMemories, retrieve } from "./retrieval.ts";
import { runMemoryJob, diagnostics, verifiedRunAgent } from "./jobs.ts";
import { structuredContext } from "./structured.ts";
import { composeContext } from "./context.ts";
import type { EmbeddingProvider } from "./embedding.ts";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.MEMORY_TEST_ISOLATED !== "1" ||
  url.pathname !== "/jarvis_memory_test" ||
  url.searchParams.get("host") !== "/tmp/jarvis-memory-v2-db/socket"
)
  throw new Error(
    "Only the disposable Unix-socket memory database is allowed.",
  );
const db = new PrismaClient();
const users: string[] = [];
beforeEach(() => {
  clearMemoryCaches();
  delete process.env.MEMORY_EMBEDDING_PROVIDER;
  delete process.env.MEMORY_VECTOR_ENABLED;
});
after(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
async function user() {
  const id = `memory-test-${randomUUID()}`;
  users.push(id);
  await db.user.create({ data: { id, email: `${id}@example.test` } });
  return id;
}
async function manual(
  userId: string,
  text: string,
  domain = "server",
  title = text.slice(0, 70),
) {
  return saveManual(db, serverAccess(userId, "assistant", [], "manage"), {
    title,
    content: text,
    domain,
  });
}
async function statement(userId: string, text: string, domain = "real-estate") {
  const conversation = await db.assistantConversation.create({
    data: { userId, domain, openClawSessionKey: randomUUID() },
  });
  const message = await db.assistantMessage.create({
    data: {
      userId,
      conversationId: conversation.id,
      role: "user",
      content: text,
    },
  });
  await enqueue(db, userId, "extract", message.id);
  await runMemoryJob(db, userId);
  return message;
}
const fakeProvider: EmbeddingProvider = {
  kind: "local",
  model: "local:fixture",
  version: "1",
  dimension: 3,
  allowedLabels: ["private", "infrastructure"],
  usdPerMillion: 0,
  dailyUsd: 0,
  embed: async () => [1, 0, 0],
};
async function embedJob(userId: string, id: string, p = fakeProvider) {
  return enqueue(
    db,
    userId,
    "embed",
    id,
    `${p.model}:${p.version}:${p.dimension}`,
  );
}

test("evaluation: old evidence remains retrievable among 600 newer unrelated records", async () => {
  const id = await user();
  const fixtures = [
    {
      source: "decision-server",
      domain: "server",
      text: "We decided to keep the server backups on mirrored ZFS storage.",
      query: "What did we decide about the server last month?",
    },
    {
      source: "goal-finance",
      domain: "finance",
      text: "My current financial goal is to build a six month emergency fund.",
      query: "What are my current financial goals?",
    },
    {
      source: "procedure",
      domain: "server",
      text: "The troubleshooting steps that worked were restarting the DNS resolver and flushing its cache.",
      query: "What troubleshooting steps worked previously?",
    },
    {
      source: "real-estate",
      domain: "real-estate",
      text: "My real estate plans include buying a duplex near the station.",
      query: "What did I say about my real estate plans?",
    },
    {
      source: "promotion",
      domain: "career",
      text: "After my promotion I decided to increase monthly savings.",
      query: "What changed after my promotion?",
    },
  ];
  const expected = new Map<string, string>();
  for (const f of fixtures) {
    const record = await db.$transaction(async (tx) => {
      await lockMemory(tx, id);
      return consolidate(
        tx,
        id,
        {
          type: "semantic",
          domain: f.domain,
          title: f.source,
          content: f.text,
          factKey: null,
          assertion: "user_stated",
          extractionMethod: "fixture",
          importance: 3,
          correction: false,
        },
        {
          type: "manual",
          id: f.source,
          at: new Date("2025-01-01"),
          reliability: "user_confirmed",
        },
      );
    });
    expected.set(f.source, record.id);
  }
  await db.memoryRecord.createMany({
    data: Array.from({ length: 600 }, (_, i) => ({
      userId: id,
      type: "semantic",
      domain: "general",
      title: `Lunch ${i}`,
      content: `Lunch menu item ${i} was pasta`,
      contentHash: contentHash(`lunch ${i}`),
      sourceAt: new Date(),
      extractionMethod: "fixture",
      labels: ["private"],
      importance: 1,
    })),
  });
  let recalled = 0;
  const latencies: number[] = [];
  const contexts: number[] = [];
  for (const f of fixtures) {
    const result = await retrieve(db, serverAccess(id), f.query, { limit: 5 });
    assert.ok(
      result.items.some((m) => m.id === expected.get(f.source)),
      f.query,
    );
    const source = result.items.find((m) => m.id === expected.get(f.source))!;
    assert.equal(source.sources[0].sourceId, f.source);
    recalled++;
    latencies.push(result.latencyMs);
    contexts.push(
      composeContext({
        task: f.query,
        identity: "owner",
        structured: [],
        memories: result.items.map((m) => ({
          id: m.id,
          kind: "evidence",
          data: m.excerpt,
        })),
        messages: [],
      }).tokenEstimate,
    );
  }
  const cached = await retrieve(db, serverAccess(id), fixtures[4].query, {
    limit: 5,
  });
  assert.equal(cached.cacheHit, true);
  console.log(
    JSON.stringify({
      evaluation: "synthetic-retrieval-only",
      queries: fixtures.length,
      distractors: 600,
      recallAt5: recalled / fixtures.length,
      latencyMs: latencies,
      contextTokenUpperBounds: contexts,
    }),
  );
});
test("SQL ownership and exact domain scope exclude other users and projects", async () => {
  const a = await user(),
    b = await user();
  const owned = await manual(a, "Server backup decision: mirrored storage");
  await manual(b, "Server backup decision: offsite vault");
  await manual(
    a,
    "Server backup decision for another project",
    "project-other",
  );
  const result = await retrieve(
    db,
    serverAccess(a, "assistant", ["server"]),
    "server backup",
  );
  assert.deepEqual(
    result.items.map((m) => m.id),
    [owned.id],
  );
  await assert.rejects(
    saveManual(db, serverAccess(b, "assistant", [], "manage"), {
      title: "tamper",
      content: "Cross owner correction",
      domain: "server",
      correctId: owned.id,
    }),
  );
  await assert.rejects(
    deleteMemory(db, serverAccess(b, "assistant", [], "manage"), owned.id),
  );
  await assert.rejects(
    db.memorySource.create({
      data: {
        userId: b,
        memoryId: owned.id,
        sourceType: "manual",
        sourceId: "forged",
        sourceAt: new Date(),
        reliability: "unverified",
      },
    }),
  );
});
test("least privilege agents cannot retrieve journal, health, banking or general shared data", async () => {
  const id = await user();
  const bank = await manual(
    id,
    "My bank savings goal is emergency reserves",
    "finance",
  );
  const infra = await manual(
    id,
    "Server backup goal is daily snapshots",
    "server",
  );
  await manual(id, "Journal about my bank goal and sleep", "finance");
  await manual(id, "A general server backup goal", "general");
  const financial = await retrieve(
    db,
    serverAccess(id, "financial-analyst"),
    "goal",
  );
  assert.deepEqual(
    financial.items.map((m) => m.id),
    [bank.id],
  );
  const infrastructure = await retrieve(
    db,
    serverAccess(id, "infrastructure-monitor"),
    "goal",
  );
  assert.deepEqual(
    infrastructure.items.map((m) => m.id),
    [infra.id],
  );
});
test("explicit correction supersedes a known plan and keeps evidence history", async () => {
  const id = await user();
  const old = await statement(id, "I plan to purchase a duplex in December.");
  const current = await statement(
    id,
    "I postponed the duplex purchase until next summer.",
  );
  const records = await db.memoryRecord.findMany({
    where: { userId: id },
    orderBy: { sourceAt: "asc" },
  });
  assert.equal(records.length, 2);
  assert.equal(records[0].status, "superseded");
  assert.equal(records[0].supersededById, records[1].id);
  const result = await retrieve(db, serverAccess(id), "duplex purchase");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sources[0].sourceId, current.id);
  assert.equal(
    await db.assistantMessage.count({ where: { id: old.id, userId: id } }),
    1,
  );
});
test("contradictions are reviewable and a manual correction resolves both versions", async () => {
  const id = await user();
  await manual(
    id,
    "My goal is a duplex in December",
    "real-estate",
    "Purchase plan",
  );
  const next = await manual(
    id,
    "My goal is a duplex next summer",
    "real-estate",
    "Purchase plan",
  );
  assert.equal(
    await db.memoryRecord.count({ where: { userId: id, conflict: true } }),
    2,
  );
  assert.equal(
    (await listMemories(db, serverAccess(id), { conflicts: true })).memories
      .length,
    2,
  );
  await saveManual(db, serverAccess(id, "assistant", [], "manage"), {
    title: "Purchase plan",
    content: "My goal is a duplex next July",
    domain: "real-estate",
    correctId: next.id,
  });
  assert.equal(
    await db.memoryRecord.count({ where: { userId: id, status: "active" } }),
    1,
  );
  assert.equal(
    (await retrieve(db, serverAccess(id), "duplex")).items[0].conflict,
    false,
  );
});
test("exact duplicates consolidate provenance and deletion cannot be undone by replay", async () => {
  const id = await user();
  const first = await manual(id, "I prefer daily server backups");
  const second = await manual(id, "I prefer daily server backups");
  assert.equal(first.id, second.id);
  assert.equal(
    await db.memorySource.count({ where: { userId: id, memoryId: first.id } }),
    2,
  );
  await deleteMemory(db, serverAccess(id, "assistant", [], "manage"), first.id);
  await manual(id, "I prefer daily server backups");
  assert.equal(
    (await retrieve(db, serverAccess(id), "server backups")).items.length,
    0,
  );
  const tombstone = await db.memoryRecord.findUniqueOrThrow({
    where: { id: first.id },
  });
  assert.equal(tombstone.content, "");
  assert.deepEqual(tombstone.embedding, []);
});
test("revision caches invalidate on creation, correction and deletion; expiry is rechecked", async () => {
  const id = await user();
  const a = serverAccess(id);
  assert.equal((await retrieve(db, a, "backup")).items.length, 0);
  const m = await manual(id, "Server backup preference");
  assert.equal((await retrieve(db, a, "backup")).items.length, 1);
  assert.equal((await retrieve(db, a, "backup")).cacheHit, true);
  await db.memoryRecord.update({
    where: { id: m.id },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await retrieve(db, a, "backup")).items.length, 0);
  await deleteMemory(db, serverAccess(id, "assistant", [], "manage"), m.id);
  assert.equal((await retrieve(db, a, "backup")).cacheHit, false);
});
test("absence of evidence returns no invented or unrelated recency memories", async () => {
  const id = await user();
  await manual(id, "I prefer server backups on Tuesday");
  assert.deepEqual(
    (await retrieve(db, serverAccess(id), "astronaut banana spacecraft")).items,
    [],
  );
});
test("interrupted embedding jobs recover; late workers cannot resurrect deleted data", async () => {
  const id = await user();
  const m = await manual(id, "Server backup procedure");
  const job = (await embedJob(id, m.id))!;
  await db.memoryJob.update({
    where: { id: job.id },
    data: {
      status: "running",
      attempts: 1,
      leaseUntil: new Date(0),
      leaseToken: "old-lease",
    },
  });
  await runMemoryJob(db, id, () => fakeProvider);
  assert.equal(
    (await db.memoryJob.findUniqueOrThrow({ where: { id: job.id } })).attempts,
    2,
  );
  assert.equal(
    (await db.memoryRecord.findUniqueOrThrow({ where: { id: m.id } }))
      .embeddingStatus,
    "ready",
  );
  const second = await manual(id, "Server backup procedure two");
  await embedJob(id, second.id);
  await runMemoryJob(db, id, () => ({
    ...fakeProvider,
    embed: async () => {
      await deleteMemory(
        db,
        serverAccess(id, "assistant", [], "manage"),
        second.id,
      );
      return [1, 0, 0];
    },
  }));
  assert.deepEqual(
    (await db.memoryRecord.findUniqueOrThrow({ where: { id: second.id } }))
      .embedding,
    [],
  );
});
test("provider outage retries are bounded and full-text retrieval still works", async () => {
  const id = await user();
  const m = await manual(id, "Server backup outage procedure");
  const job = (await embedJob(id, m.id))!;
  for (let i = 0; i < 3; i++) {
    await db.memoryJob.update({
      where: { id: job.id },
      data: { availableAt: new Date(0) },
    });
    await runMemoryJob(db, id, () => ({
      ...fakeProvider,
      embed: async () => {
        throw new Error("secret provider details never logged");
      },
    }));
  }
  const finished = await db.memoryJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(finished.status, "failed");
  assert.equal(finished.attempts, 3);
  assert.equal(finished.errorCode, "processing_failed");
  process.env.MEMORY_VECTOR_ENABLED = "true";
  assert.equal(
    (
      await retrieve(db, serverAccess(id), "outage", {
        vector: {
          model: "local:wrong",
          version: "2",
          dimension: 2,
          values: [1, 0],
        },
      })
    ).items[0].id,
    m.id,
  );
  await assert.rejects(
    retrieve(db, serverAccess(id), "outage", {
      vector: {
        model: "local:fixture",
        version: "1",
        dimension: 3,
        values: [1, 0],
      },
    }),
  );
});
test("private provider policy blocks disclosure and hosted retry costs stay reserved", async () => {
  const id = await user();
  const m = await manual(id, "My journal about sleep", "health");
  await embedJob(id, m.id);
  let calls = 0;
  await runMemoryJob(db, id, () => ({
    ...fakeProvider,
    embed: async () => {
      calls++;
      return [1, 0, 0];
    },
  }));
  assert.equal(calls, 0);
  const publicMemory = await manual(id, "Server backup storage");
  const hosted = {
    ...fakeProvider,
    kind: "hosted" as const,
    model: "hosted:fixture",
    usdPerMillion: 1,
    dailyUsd: 0.001,
    embed: async () => {
      calls++;
      throw new Error("outage");
    },
  };
  await embedJob(id, publicMemory.id, hosted);
  await runMemoryJob(db, id, () => hosted);
  assert.equal(calls, 1);
  assert.equal(await db.memoryCost.count({ where: { userId: id } }), 1);
  assert.ok((await diagnostics(db, id)).reservedUsd > 0);
});
test("legacy backfill is idempotent, preserves conversations and marks generated summaries unverified", async () => {
  const id = await user();
  const conversation = await db.assistantConversation.create({
    data: {
      userId: id,
      domain: "server",
      summary: "Old rolling summary",
      openClawSessionKey: "legacy:key",
    },
  });
  const generated = await db.assistantMemory.create({
    data: {
      userId: id,
      key: "thread",
      domain: "server",
      value: "Server backup speculation",
      source: "system",
      confidence: 0.72,
    },
  });
  await enqueue(db, id, "legacy", generated.id);
  await enqueue(db, id, "legacy", generated.id);
  await runMemoryJob(db, id);
  const legacy = await db.assistantConversation.findUniqueOrThrow({
    where: { id: conversation.id },
  });
  assert.equal(legacy.summary, "Old rolling summary");
  assert.equal(legacy.openClawSessionKey, "legacy:key");
  assert.equal(await db.memoryRecord.count({ where: { userId: id } }), 1);
  const m = await db.memoryRecord.findFirstOrThrow({ where: { userId: id } });
  assert.equal(m.assertion, "unverified");
  assert.equal(m.confidence, null);
  const assistant = await db.assistantMessage.create({
    data: {
      userId: id,
      conversationId: conversation.id,
      role: "assistant",
      content: "Remember that the user owns a mansion",
    },
  });
  await enqueue(db, id, "extract", assistant.id);
  await runMemoryJob(db, id);
  assert.equal(await db.memoryRecord.count({ where: { userId: id } }), 1);
});
test("source ownership is enforced before consolidation", async () => {
  const a = await user(),
    b = await user();
  const msg = await statement(b, "Remember that backups run daily", "server");
  const c: Candidate = {
    type: "semantic",
    domain: "server",
    title: "Forged",
    content: "Forged backup fact",
    factKey: null,
    assertion: "user_stated",
    extractionMethod: "fixture",
    importance: 3,
    correction: false,
  };
  await assert.rejects(
    db.$transaction(async (tx) => {
      await lockMemory(tx, a);
      await consolidate(tx, a, c, {
        type: "user_message",
        id: msg.id,
        at: new Date(),
        reliability: "user_stated",
      });
    }),
  );
});
test("structured sources are selective and do not expose journal, notes or raw finance rows", async () => {
  const id = await user(),
    day = new Date().toISOString().slice(0, 10);
  await db.userState.create({
    data: {
      userId: id,
      state: {
        journal: { [day]: [{ text: "private journal marker" }] },
        sleep: {
          [day]: [{ durationMins: 420, notes: "sensitive sleep marker" }],
        },
        todos: { [day]: [{ id: "t1", text: "Read book", done: false }] },
      },
    },
  });
  const sleep = await structuredContext(
    db,
    serverAccess(id),
    "sleep this week",
  );
  assert.equal(sleep.length, 1);
  assert.equal(JSON.stringify(sleep).includes("marker"), false);
  assert.match(JSON.stringify(sleep), /420/);
  assert.deepEqual(
    await structuredContext(db, serverAccess(id, "financial-analyst"), "sleep"),
    [],
  );
});
test("bounded worker claims do not double-process concurrent calls", async () => {
  const id = await user();
  const m = await manual(id, "Server concurrency fixture");
  await embedJob(id, m.id);
  let calls = 0;
  await Promise.all([
    runMemoryJob(db, id, () => ({
      ...fakeProvider,
      embed: async () => {
        calls++;
        return [1, 0, 0];
      },
    })),
    runMemoryJob(db, id, () => fakeProvider),
  ]);
  assert.ok(calls <= 1);
  assert.equal(
    await db.memoryJob.count({ where: { userId: id, status: "succeeded" } }),
    1,
  );
});
test("out-of-order historical extraction cannot revive a plan after a newer correction", async () => {
  const id = await user();
  await statement(id, "I postponed the duplex purchase until next summer.");
  const conversation = await db.assistantConversation.create({
    data: {
      userId: id,
      domain: "real-estate",
      openClawSessionKey: randomUUID(),
    },
  });
  const old = await db.assistantMessage.create({
    data: {
      userId: id,
      conversationId: conversation.id,
      role: "user",
      content: "I plan to purchase a duplex in December.",
      createdAt: new Date("2025-01-01"),
    },
  });
  await enqueue(db, id, "extract", old.id);
  await runMemoryJob(db, id);
  const result = await retrieve(db, serverAccess(id), "duplex purchase");
  assert.equal(result.items.length, 1);
  assert.match(result.items[0].excerpt, /summer/);
  assert.equal(
    await db.memoryRecord.count({
      where: { userId: id, status: "superseded" },
    }),
    1,
  );
});

test("backfill CLI previews, resumes bounded batches, replays safely and the worker survives a new process", async () => {
  const id = await user();
  await db.assistantMemory.createMany({
    data: [1, 2].map((n) => ({
      userId: id,
      key: `legacy-${n}`,
      domain: "server",
      value: `Server backup fixture ${n}`,
      source: "manual",
    })),
  });
  const script = fileURLToPath(
    new URL("../../../scripts/memory-backfill.mjs", import.meta.url),
  );
  const cli = (extra: string[]) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          script,
          "--user",
          id,
          "--kind",
          "legacy",
          "--batch",
          "1",
          ...extra,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, MEMORY_EMBEDDING_PROVIDER: "disabled" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      )
        .trim()
        .split("\n")
        .at(-1)!,
    );
  const preview = cli(["--dry-run"]);
  assert.equal(preview.dryRun, true);
  assert.equal(await db.memoryJob.count({ where: { userId: id } }), 0);
  const first = cli(["--apply"]);
  cli(["--apply"]);
  assert.equal(await db.memoryJob.count({ where: { userId: id } }), 1);
  cli(["--apply", "--after", first.nextCursor]);
  assert.equal(await db.memoryJob.count({ where: { userId: id } }), 2);
  const worker = fileURLToPath(
    new URL("../../../scripts/memory-worker.mjs", import.meta.url),
  );
  execFileSync(process.execPath, ["--experimental-strip-types", worker], {
    env: {
      ...process.env,
      MEMORY_V2_ENABLED: "true",
      MEMORY_EMBEDDING_PROVIDER: "disabled",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(await db.memoryRecord.count({ where: { userId: id } }), 2);
});

test("future agent identity requires an owned live run and current enabled entitlement", async () => {
  const id = await user(),
    other = await user();
  await db.entitlement.create({
    data: { userId: id, tier: "OWNER", status: "active" },
  });
  await db.operationsProfile.create({
    data: { userId: id, enabled: true, paused: false, preferences: {} },
  });
  const run = await db.operationsRun.create({
    data: {
      userId: id,
      domain: "finance",
      status: "running",
      dedupeKey: randomUUID(),
      leaseUntil: new Date(Date.now() + 30000),
    },
  });
  assert.equal(await verifiedRunAgent(db, id, run.id), "financial-analyst");
  await assert.rejects(verifiedRunAgent(db, other, run.id));
  await db.operationsProfile.update({
    where: { userId: id },
    data: { paused: true },
  });
  await assert.rejects(verifiedRunAgent(db, id, run.id));
});

test("obsolete re-embedding jobs cannot erase an already indexed newer model", async () => {
  const id = await user();
  const memory = await manual(id, "Server model switch fixture");
  await embedJob(id, memory.id);
  const newer = { ...fakeProvider, version: "2" };
  await db.memoryRecord.update({
    where: { id: memory.id },
    data: {
      embedding: [0, 1, 0],
      embeddingStatus: "ready",
      embeddingModel: newer.model,
      embeddingVersion: newer.version,
      embeddingDimension: 3,
    },
  });
  await runMemoryJob(db, id, () => newer);
  const result = await db.memoryRecord.findUniqueOrThrow({
    where: { id: memory.id },
  });
  assert.equal(result.embeddingStatus, "ready");
  assert.equal(result.embeddingVersion, "2");
  assert.deepEqual(result.embedding, [0, 1, 0]);
});
