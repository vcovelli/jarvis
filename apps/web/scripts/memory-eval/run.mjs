import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  makeCorpus,
  EVAL_NOW,
  OWNERS,
} from "../../src/lib/memory/evaluation/corpus.ts";
import {
  quality,
  percentile,
  pairedBootstrap,
} from "../../src/lib/memory/evaluation/metrics.ts";
import {
  retrieve,
  clearMemoryCaches,
  accessSql,
} from "../../src/lib/memory/retrieval.ts";
import {
  serverAccess,
  contentHash,
  hasSecrets,
} from "../../src/lib/memory/policy.ts";
import { embeddingProvider } from "../../src/lib/memory/embedding.ts";
import { composeContext } from "../../src/lib/memory/context.ts";
import { enqueue, saveManual } from "../../src/lib/memory/store.ts";
import { runMemoryJob } from "../../src/lib/memory/jobs.ts";

const args = process.argv.slice(2),
  phase = args[0];
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.MEMORY_VECTOR_TEST_ISOLATED !== "1" ||
  url.pathname !== "/jarvis_memory_vector_eval" ||
  url.searchParams.get("host") !== "/tmp/jarvis-memory-vector-eval/socket"
)
  throw new Error(
    "Only the disposable pgvector evaluation Unix-socket database is allowed.",
  );
if (!["seed", "compare", "validate", "explain", "cleanup"].includes(phase))
  throw new Error("Choose seed, compare, validate, explain, or cleanup.");
const output =
  process.env.MEMORY_EVAL_OUTPUT ?? "/tmp/jarvis-memory-vector-eval/results";
if (!output.startsWith("/tmp/jarvis-memory-vector-eval/"))
  throw new Error(
    "Evaluation output must stay in the isolated temporary directory.",
  );
await mkdir(output, { recursive: true });
const manifest = JSON.parse(
  await readFile(new URL("./model-manifest.json", import.meta.url), "utf8"),
);
const dimension = 384,
  model = manifest.model,
  version = `${manifest.revision}:onnx-fp32-mean-l2-256`;
Object.assign(process.env, {
  MEMORY_EMBEDDING_PROVIDER: "local",
  MEMORY_EMBEDDING_URL: "http://127.0.0.1:3331/v1/embeddings",
  MEMORY_EMBEDDING_MODEL: model,
  MEMORY_EMBEDDING_VERSION: version,
  MEMORY_EMBEDDING_DIMENSION: String(dimension),
  MEMORY_EMBEDDING_ALLOWED_LABELS:
    "private,finance,health,journal,infrastructure,work",
});
delete process.env.MEMORY_EMBEDDING_KEY;
const provider = embeddingProvider(),
  db = new PrismaClient();
const corpus = makeCorpus(),
  byId = new Map(corpus.documents.map((d) => [d.id, d]));
const identity = { model: provider.model, version, dimension };
const json = (name, data) =>
  writeFile(`${output}/${name}.json`, JSON.stringify(data, null, 2) + "\n");
const mean = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
async function checkedExtension() {
  const rows =
    await db.$queryRaw`SELECT extversion FROM pg_extension WHERE extname='vector'`;
  assert.equal(
    rows.length,
    1,
    "This evaluation must run actual pgvector, not silently fall back",
  );
  return rows[0].extversion;
}
async function localHealth() {
  const h = await (await fetch("http://127.0.0.1:3331/health")).json();
  assert.equal(h.revision, manifest.revision);
  assert.equal(h.dimensions, 384);
  return h;
}
async function seed() {
  await checkedExtension();
  const health = await localHealth();
  for (const d of corpus.documents)
    assert.equal(hasSecrets(`${d.title} ${d.content}`), false, d.id);
  await db.user.deleteMany({ where: { id: { in: [...OWNERS] } } });
  for (const id of OWNERS)
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        memoryState: { create: { revision: 1 } },
      },
    });
  // This cache contains only public synthetic-fixture vectors, never user data.
  const cached = new Map();
  const cachePath = `${output}/synthetic-vectors.jsonl`;
  try {
    for (const line of (await readFile(cachePath, "utf8")).trim().split("\n")) {
      if (line) {
        const item = JSON.parse(line);
        if (item.identity === JSON.stringify(identity))
          cached.set(item.hash, item.values);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let embedded = 0,
    cachedCount = 0,
    embeddingMs = 0;
  const started = performance.now();
  for (let offset = 0; offset < corpus.documents.length; offset += 32) {
    const chunk = corpus.documents.slice(offset, offset + 32),
      missing = [
        ...new Map(
          chunk
            .filter((d) => !cached.has(contentHash(d.content)))
            .map((d) => [contentHash(d.content), d.content]),
        ).entries(),
      ];
    cachedCount += chunk.length - missing.length;
    if (missing.length) {
      const start = performance.now();
      const response = await fetch(process.env.MEMORY_EMBEDDING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: missing.map(([, text]) => text) }),
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.length, missing.length);
      for (let i = 0; i < missing.length; i++) {
        const vector = body.data[i].embedding;
        assert.equal(vector.length, dimension);
        assert.ok(vector.every(Number.isFinite));
        cached.set(missing[i][0], vector);
        await appendFile(
          cachePath,
          JSON.stringify({
            identity: JSON.stringify(identity),
            hash: missing[i][0],
            values: vector,
          }) + "\n",
        );
      }
      embeddingMs += performance.now() - start;
      embedded += missing.length;
    }
    await db.memoryRecord.createMany({
      data: chunk.map((d) => ({
        id: d.id,
        userId: d.userId,
        domain: d.domain,
        title: d.title,
        content: d.content,
        contentHash: contentHash(d.content),
        sourceAt: d.sourceAt,
        effectiveAt: d.effectiveAt,
        expiresAt: d.expiresAt,
        status: d.status,
        labels: d.labels,
        importance: d.importance,
        type: "semantic",
        assertion: "user_stated",
        extractionMethod: "synthetic-evaluation-v1",
        embedding: cached.get(contentHash(d.content)),
        embeddingModel: identity.model,
        embeddingVersion: version,
        embeddingDimension: dimension,
        embeddingStatus: "ready",
      })),
    });
    await db.memorySource.createMany({
      data: chunk.map((d) => ({
        userId: d.userId,
        memoryId: d.id,
        sourceType: "manual",
        sourceId: d.sourceId,
        sourceAt: d.sourceAt,
        reliability: "synthetic_user_statement",
      })),
    });
    if (offset % 1024 === 0)
      console.log(
        JSON.stringify({
          phase: "seed",
          completed: offset + chunk.length,
          total: corpus.documents.length,
          elapsedSeconds: Math.round((performance.now() - started) / 1000),
        }),
      );
  }
  await db.$executeRaw`ANALYZE "MemoryRecord"`;
  const metadata = {
    fingerprint: corpus.fingerprint,
    documents: corpus.documents.length,
    queries: corpus.queries.length,
    owners: OWNERS.length,
    embedded,
    cachedCount,
    embeddingMs,
    totalMs: performance.now() - started,
    identity,
    health,
    pgvector: await checkedExtension(),
    postgres: await db.$queryRaw`SELECT version() AS version`,
    hardware: {
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      hostMemoryBytes: totalmem(),
    },
    byKind: Object.fromEntries(
      ["target", "hard_negative", "distractor", "boundary"].map((k) => [
        k,
        corpus.documents.filter((d) => d.kind === k).length,
      ]),
    ),
  };
  await json("seed", metadata);
  await json("queries", corpus.queries);
  console.log(JSON.stringify(metadata));
}
function aggregate(rows) {
  const positives = rows.filter((r) => r.expectedSourceIds.length),
    negatives = rows.filter((r) => !r.expectedSourceIds.length);
  return {
    queries: rows.length,
    answerable: positives.length,
    recallAt1: mean(positives.map((r) => r.quality.recallAt1)),
    recallAt5: mean(positives.map((r) => r.quality.recallAt5)),
    recallAt10: mean(positives.map((r) => r.quality.recallAt10)),
    mrr: mean(positives.map((r) => r.quality.mrr)),
    ndcgAt10: mean(positives.map((r) => r.quality.ndcgAt10)),
    precisionAt5: mean(positives.map((r) => r.quality.precisionAt5)),
    noEvidenceQueries: negatives.length,
    noEvidenceEmptyRate: mean(negatives.map((r) => Number(r.quality.empty))),
    latencyMs: {
      p50: percentile(
        rows.flatMap((r) => r.timings),
        0.5,
      ),
      p95: percentile(
        rows.flatMap((r) => r.timings),
        0.95,
      ),
      max: Math.max(...rows.flatMap((r) => r.timings)),
    },
    contextTokens: {
      p50: percentile(
        rows.map((r) => r.contextTokens),
        0.5,
      ),
      p95: percentile(
        rows.map((r) => r.contextTokens),
        0.95,
      ),
    },
    semanticUsedQueries: rows.filter((r) => r.semanticCount > 0).length,
  };
}
async function compare() {
  const ext = await checkedExtension(),
    health = await localHealth();
  const seeded = JSON.parse(await readFile(`${output}/seed.json`, "utf8"));
  assert.equal(seeded.fingerprint, corpus.fingerprint);
  assert.equal(
    await db.memoryRecord.count({ where: { userId: { in: [...OWNERS] } } }),
    corpus.documents.length,
  );
  const repeats = 3,
    runs = new Map(),
    warm = [],
    started = performance.now();
  let leaks = 0;
  // Freeze labels before scoring; modes are counterbalanced. No threshold/ranking tuning.
  for (let repeat = 0; repeat < repeats; repeat++)
    for (const [index, q] of corpus.queries.entries()) {
      for (const mode of (index + repeat) % 2
        ? ["hybrid", "fulltext"]
        : ["fulltext", "hybrid"]) {
        clearMemoryCaches();
        process.env.MEMORY_VECTOR_ENABLED = String(mode === "hybrid");
        const access = serverAccess(q.userId, q.agent, q.domains),
          start = performance.now();
        const result = await retrieve(db, access, q.text, {
          limit: 10,
          now: EVAL_NOW,
        });
        const elapsed = performance.now() - start;
        for (const item of result.items) {
          const d = byId.get(item.id);
          assert.ok(d);
          assert.equal(d.userId, q.userId, "cross-user candidate leaked");
          assert.equal(d.status, "active");
          assert.ok(d.effectiveAt <= EVAL_NOW);
          assert.ok(!d.expiresAt || d.expiresAt > EVAL_NOW);
          if (q.domains.length) assert.ok(q.domains.includes(d.domain));
          assert.ok(d.labels.every((l) => access.labels.includes(l)));
          if (
            item.id.startsWith("memory-eval-") ||
            ["deleted:", "expired:", "superseded:", "future:"].some((p) =>
              item.id.startsWith(p),
            )
          )
            leaks++;
          assert.equal(item.sources[0].sourceId, d.sourceId);
        }
        if (q.cohort === "agent_denied")
          assert.equal(result.items.length, 0, "agent boundary failed");
        const sourceIds = result.items.map((item) => item.sources[0].sourceId);
        const composed = composeContext({
          task: q.text,
          identity: `${q.agent}:${q.domains.join(",")}`,
          structured: [],
          memories: result.items.map((m) => ({
            id: m.id,
            kind: "evidence",
            data: { excerpt: m.excerpt, source: m.sources[0].sourceId },
          })),
          messages: [],
          budget: 12000,
        });
        assert.ok(composed.tokenEstimate <= 12000);
        const key = `${mode}:${q.id}`,
          prior = runs.get(key);
        if (prior) {
          assert.deepEqual(
            sourceIds,
            prior.returnedSourceIds,
            "Ranking must be deterministic across repeated trials",
          );
          prior.timings.push(elapsed);
        } else
          runs.set(key, {
            ...q,
            mode,
            returnedSourceIds: sourceIds,
            returnedIds: result.items.map((i) => i.id),
            ranks: result.items.map((i) => i.relevance),
            quality: quality(q.expectedSourceIds, sourceIds),
            timings: [elapsed],
            semanticCount: result.items.filter(
              (i) => i.relevance.semantic !== undefined,
            ).length,
            contextTokens: composed.tokenEstimate,
          });
        if (repeat === 0 && index % 5 === 0) {
          const warmStart = performance.now();
          const cached = await retrieve(db, access, q.text, {
            limit: 10,
            now: EVAL_NOW,
          });
          warm.push({
            mode,
            queryId: q.id,
            ms: performance.now() - warmStart,
            cacheHit: cached.cacheHit,
          });
        }
      }
      if (index % 40 === 0)
        console.log(
          JSON.stringify({
            phase: "compare",
            repeat: repeat + 1,
            completed: index,
            total: corpus.queries.length,
            elapsedSeconds: Math.round((performance.now() - started) / 1000),
          }),
        );
    }
  assert.equal(leaks, 0);
  const rows = [...runs.values()];
  assert.ok(
    rows.filter((r) => r.mode === "hybrid").some((r) => r.semanticCount > 0),
    "Hybrid silently fell back: no real vector candidates",
  );
  const cohorts = [...new Set(corpus.queries.map((q) => q.cohort))];
  const summary = {
    fingerprint: corpus.fingerprint,
    identity,
    pgvector: ext,
    health,
    documents: corpus.documents.length,
    queries: corpus.queries.length,
    repeats,
    cacheMethod:
      "Clear both application caches before every scored request; warmed PostgreSQL/OS caches; complete call includes local query inference and audit writes.",
    totalMs: performance.now() - started,
    leaks,
    results: Object.fromEntries(
      ["fulltext", "hybrid"].map((mode) => [
        mode,
        {
          all: aggregate(rows.filter((r) => r.mode === mode)),
          cohorts: Object.fromEntries(
            cohorts.map((c) => [
              c,
              aggregate(rows.filter((r) => r.mode === mode && r.cohort === c)),
            ]),
          ),
          warmCache: {
            n: warm.filter((r) => r.mode === mode).length,
            p50: percentile(
              warm.filter((r) => r.mode === mode).map((r) => r.ms),
              0.5,
            ),
            p95: percentile(
              warm.filter((r) => r.mode === mode).map((r) => r.ms),
              0.95,
            ),
            hitRate: mean(
              warm
                .filter((r) => r.mode === mode)
                .map((r) => Number(r.cacheHit)),
            ),
          },
        },
      ]),
    ),
  };
  // Resample scenarios, not their correlated paraphrases. Exclude scope duplicates and negatives.
  const scenarioDiffs = [
    ...new Set(
      corpus.queries
        .filter((q) =>
          ["literal", "paraphrase", "conversational"].includes(q.cohort),
        )
        .map((q) => q.scenario),
    ),
  ].map(
    (s) =>
      mean(
        rows
          .filter(
            (r) =>
              r.scenario === s &&
              r.mode === "hybrid" &&
              ["literal", "paraphrase", "conversational"].includes(r.cohort),
          )
          .map((r) => r.quality.recallAt5),
      ) -
      mean(
        rows
          .filter(
            (r) =>
              r.scenario === s &&
              r.mode === "fulltext" &&
              ["literal", "paraphrase", "conversational"].includes(r.cohort),
          )
          .map((r) => r.quality.recallAt5),
      ),
  );
  summary.recallAt5PairedScenarioBootstrap = pairedBootstrap(scenarioDiffs);
  summary.changes = corpus.queries
    .filter((q) => q.expectedSourceIds.length)
    .map((q) => {
      const f = runs.get(`fulltext:${q.id}`),
        h = runs.get(`hybrid:${q.id}`);
      return {
        id: q.id,
        text: q.text,
        cohort: q.cohort,
        expected: q.expectedSourceIds,
        fulltext: f.returnedSourceIds,
        hybrid: h.returnedSourceIds,
        deltaAt5: h.quality.recallAt5 - f.quality.recallAt5,
      };
    })
    .filter((q) => q.deltaAt5 !== 0);
  await json("summary", summary);
  await json("per-query", rows);
  await json("warm-cache", warm);
  console.log(
    JSON.stringify({
      results: summary.results,
      recallAt5PairedScenarioBootstrap:
        summary.recallAt5PairedScenarioBootstrap,
      leaks,
    }),
  );
}
async function validate() {
  const checks = [];
  await checkedExtension();
  await localHealth();
  process.env.MEMORY_VECTOR_ENABLED = "true";
  const access = serverAccess(OWNERS[0], "assistant", ["server"]),
    query = "What retention policy did we choose for the Cedar NAS?",
    values = await provider.embed(query);
  assert.equal(values.length, 384);
  assert.ok(Math.abs(Math.hypot(...values) - 1) < 1e-5);
  checks.push(
    "actual local HTTP adapter: finite 384-dimension normalized embedding",
  );
  const self =
    await db.$queryRaw`SELECT (${JSON.stringify(values)}::vector <=> ${JSON.stringify(values)}::vector) AS distance`;
  assert.ok(Math.abs(self[0].distance) < 1e-5);
  checks.push("actual pgvector cosine operator");
  const good = await retrieve(db, access, query, {
    vector: { ...identity, values },
    now: EVAL_NOW,
  });
  assert.ok(good.items.some((i) => i.relevance.semantic !== undefined));
  checks.push("hybrid returns actual semantic candidate ranks");
  for (const changed of [
    { model: "local:wrong" },
    { version: "wrong" },
    { dimension: 3, values: [1, 0, 0] },
  ]) {
    clearMemoryCaches();
    const mismatched = await retrieve(db, access, query, {
      vector: { ...identity, values, ...changed },
      now: EVAL_NOW,
    });
    assert.ok(
      mismatched.items.every((i) => i.relevance.semantic === undefined),
    );
  }
  checks.push("model/version/dimension mismatches excluded by SQL");
  await assert.rejects(
    retrieve(db, access, query, {
      vector: { ...identity, values: [1, 0, 0] },
      now: EVAL_NOW,
    }),
  );
  checks.push("malformed query dimension rejected before SQL");
  // Save/index through the real durable worker; all sources and requests remain synthetic/local.
  const workerUser = "memory-eval-worker";
  await db.user.deleteMany({ where: { id: workerUser } });
  await db.user.create({ data: { id: workerUser } });
  try {
    const m = await saveManual(
      db,
      serverAccess(workerUser, "assistant", [], "manage"),
      {
        domain: "server",
        title: "Index validation",
        content:
          "The isolated test server keeps recovery copies on a second disk.",
      },
    );
    await runMemoryJob(db, workerUser);
    const indexed = await db.memoryRecord.findUniqueOrThrow({
      where: { id: m.id },
    });
    assert.equal(indexed.embeddingStatus, "ready");
    assert.equal(indexed.embedding.length, 384);
    checks.push("durable worker indexes through actual local endpoint");
    const job = await enqueue(
      db,
      workerUser,
      "embed",
      m.id,
      `${identity.model}:${identity.version}:384:interrupted`,
    );
    await db.memoryJob.update({
      where: { id: job.id },
      data: {
        dedupeKey: `embed:${m.id}:${identity.model}:${identity.version}:384:retry-fixture`,
        status: "running",
        attempts: 1,
        leaseToken: "interrupted",
        leaseUntil: new Date(0),
      },
    });
    await runMemoryJob(db, workerUser);
    assert.equal(
      (await db.memoryRecord.findUniqueOrThrow({ where: { id: m.id } }))
        .embeddingStatus,
      "ready",
    );
    checks.push("expired obsolete job cannot erase valid embedding");
  } finally {
    await db.user.deleteMany({ where: { id: workerUser } });
  }
  const oldUrl = process.env.MEMORY_EMBEDDING_URL;
  process.env.MEMORY_EMBEDDING_URL = "http://127.0.0.1:1/v1/embeddings";
  clearMemoryCaches();
  const outage = await retrieve(db, access, query, { now: EVAL_NOW });
  assert.ok(outage.items.length > 0);
  assert.ok(outage.items.every((i) => i.relevance.semantic === undefined));
  process.env.MEMORY_EMBEDDING_URL = oldUrl;
  checks.push("local endpoint outage falls back to full-text");
  const oldLabels = process.env.MEMORY_EMBEDDING_ALLOWED_LABELS;
  process.env.MEMORY_EMBEDDING_ALLOWED_LABELS = "private";
  clearMemoryCaches();
  const blocked = await retrieve(db, access, query, { now: EVAL_NOW });
  assert.ok(blocked.items.every((i) => i.relevance.semantic === undefined));
  process.env.MEMORY_EMBEDDING_ALLOWED_LABELS = oldLabels;
  checks.push("disclosure policy blocks query embedding");
  // Actual missing-extension behavior, restored immediately in this disposable DB only.
  await db.$executeRaw`DROP EXTENSION vector`;
  try {
    clearMemoryCaches();
    const missing = await retrieve(db, access, query, {
      vector: { ...identity, values },
      now: EVAL_NOW,
    });
    assert.ok(missing.items.length > 0);
    assert.ok(missing.items.every((i) => i.relevance.semantic === undefined));
  } finally {
    await db.$executeRaw`CREATE EXTENSION vector`;
  }
  checks.push(
    "missing extension falls back and isolated extension is restored",
  );
  await json("validation", { checks, passed: checks.length, identity });
  console.log(JSON.stringify({ checks, passed: checks.length }));
}
async function explain() {
  await checkedExtension();
  const q = corpus.queries[1],
    access = serverAccess(q.userId),
    values = await provider.embed(q.text),
    filter = accessSql(access, EVAL_NOW);
  const plans = await db.$queryRaw(
    Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) WITH eligible AS MATERIALIZED (SELECT "id","embedding" FROM "MemoryRecord" WHERE ${filter} AND "embeddingStatus"='ready' AND "embeddingModel"=${identity.model} AND "embeddingVersion"=${version} AND "embeddingDimension"=384 AND cardinality("embedding")=384) SELECT "id" FROM eligible WHERE ("embedding"::vector <=> ${JSON.stringify(values)}::vector)<0.6 ORDER BY "embedding"::vector <=> ${JSON.stringify(values)}::vector,"id" ASC LIMIT 80`,
  );
  const sizes =
    await db.$queryRaw`SELECT pg_size_pretty(pg_total_relation_size('"MemoryRecord"')) AS memoryTable, pg_size_pretty(pg_database_size(current_database())) AS database`;
  await json("query-plan", { queryId: q.id, plans, sizes });
  console.log(JSON.stringify(sizes));
}
try {
  if (phase === "seed") await seed();
  if (phase === "compare") await compare();
  if (phase === "validate") await validate();
  if (phase === "explain") await explain();
  if (phase === "cleanup") {
    await db.user.deleteMany({
      where: { id: { in: [...OWNERS, "memory-eval-worker"] } },
    });
    console.log("Synthetic evaluation owners removed.");
  }
} finally {
  await db.$disconnect();
}
