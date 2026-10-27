// Disposable snapshot benchmark only. No indexes or vector column are added to application tables.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { PrismaClient, Prisma } from "@prisma/client";
import { serverAccess } from "../../src/lib/memory/policy.ts";
import { accessSql } from "../../src/lib/memory/retrieval.ts";
import { embeddingProvider } from "../../src/lib/memory/embedding.ts";
import {
  makeCorpus,
  EVAL_NOW,
} from "../../src/lib/memory/evaluation/corpus.ts";
import { percentile } from "../../src/lib/memory/evaluation/metrics.ts";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.MEMORY_VECTOR_TEST_ISOLATED !== "1" ||
  url.pathname !== "/jarvis_memory_vector_eval" ||
  url.searchParams.get("host") !== "/tmp/jarvis-memory-vector-eval/socket"
)
  throw Error("Disposable database required");
Object.assign(process.env, {
  MEMORY_EMBEDDING_PROVIDER: "local",
  MEMORY_EMBEDDING_URL: "http://127.0.0.1:3331/v1/embeddings",
  MEMORY_EMBEDDING_MODEL: "sentence-transformers/all-MiniLM-L6-v2",
  MEMORY_EMBEDDING_VERSION:
    "1110a243fdf4706b3f48f1d95db1a4f5529b4d41:onnx-fp32-mean-l2-256",
  MEMORY_EMBEDDING_DIMENSION: "384",
  MEMORY_EMBEDDING_ALLOWED_LABELS:
    "private,finance,health,journal,infrastructure,work",
});
const db = new PrismaClient(),
  provider = embeddingProvider(),
  dir = "/tmp/jarvis-memory-vector-eval/v22";
await mkdir(dir, { recursive: true });
const { queries, documents } = makeCorpus(),
  byId = new Map(documents.map((d) => [d.id, d]));
// 32 unrestricted paraphrases, 16 scopes, and all 32 specialized-agent boundaries.
const sample = queries.filter(
  (q, i) =>
    (q.cohort === "paraphrase" && Math.floor(i / 4) % 2 === 0) ||
    (q.cohort === "scoped" && Math.floor(i / 4) % 4 === 0) ||
    q.cohort.startsWith("agent_"),
);
const vectors = new Map();
for (const q of sample) vectors.set(q.id, await provider.embed(q.text));
const runs = [],
  builds = [],
  plans = {};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const identity = Prisma.sql`"embeddingModel"=${provider.model} AND "embeddingVersion"=${provider.version} AND "embeddingDimension"=384`;
function query(q, approximate) {
  const access = serverAccess(q.userId, q.agent, q.domains),
    filter = accessSql(access, EVAL_NOW),
    vector = JSON.stringify(vectors.get(q.id));
  return approximate
    ? Prisma.sql`WITH nearest AS MATERIALIZED (SELECT "id", embedding <=> ${vector}::vector AS distance FROM "MemoryVectorBench" WHERE ${filter} AND ${identity} ORDER BY embedding <=> ${vector}::vector LIMIT 80) SELECT * FROM nearest WHERE distance<0.6 ORDER BY distance,"id"`
    : Prisma.sql`WITH eligible AS MATERIALIZED (SELECT "id",embedding FROM "MemoryVectorBench" WHERE ${filter} AND ${identity}), distances AS MATERIALIZED (SELECT "id",embedding <=> ${vector}::vector AS distance FROM eligible) SELECT * FROM distances WHERE distance<0.6 ORDER BY distance,"id" LIMIT 80`;
}
try {
  await db.$executeRaw`DROP TABLE IF EXISTS "MemoryVectorBench"`;
  await db.$executeRaw`CREATE TABLE "MemoryVectorBench" AS SELECT "id","userId","domain","labels","status","effectiveAt","expiresAt","validUntil","embeddingModel","embeddingVersion","embeddingDimension", "embedding"::vector(384) AS embedding FROM "MemoryRecord" WHERE "embeddingStatus"='ready' AND cardinality(embedding)=384`;
  await db.$executeRaw`CREATE INDEX "MemoryVectorBench_owner" ON "MemoryVectorBench"("userId","domain","status")`;
  await db.$executeRaw`ANALYZE "MemoryVectorBench"`;
  for (const mode of [
    "native_exact",
    "hnsw_40",
    "hnsw_iterative_100",
    "ivfflat_10",
    "ivfflat_100",
  ]) {
    if (mode === "hnsw_40") {
      const t = performance.now();
      await db.$executeRaw`CREATE INDEX "MemoryVectorBench_hnsw" ON "MemoryVectorBench" USING hnsw (embedding vector_cosine_ops) WITH (m=16,ef_construction=64)`;
      builds.push({
        index: "hnsw",
        ms: performance.now() - t,
        size: await db.$queryRaw`SELECT pg_relation_size('"MemoryVectorBench_hnsw"') AS bytes`,
      });
    }
    if (mode === "ivfflat_10") {
      await db.$executeRaw`DROP INDEX "MemoryVectorBench_hnsw"`;
      const t = performance.now();
      await db.$executeRaw`CREATE INDEX "MemoryVectorBench_ivfflat" ON "MemoryVectorBench" USING ivfflat (embedding vector_cosine_ops) WITH (lists=100)`;
      builds.push({
        index: "ivfflat",
        ms: performance.now() - t,
        size: await db.$queryRaw`SELECT pg_relation_size('"MemoryVectorBench_ivfflat"') AS bytes`,
      });
    }
    for (let trial = 0; trial < 3; trial++)
      for (const q of sample) {
        const sql = query(q, mode !== "native_exact"),
          t = performance.now();
        const rows = await db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout='1500ms'`;
          await tx.$executeRaw`SET LOCAL plan_cache_mode='force_custom_plan'`;
          if (mode === "hnsw_40")
            await tx.$executeRaw`SET LOCAL hnsw.ef_search=40`;
          if (mode === "hnsw_iterative_100") {
            await tx.$executeRaw`SET LOCAL hnsw.ef_search=100`;
            await tx.$executeRaw`SET LOCAL hnsw.iterative_scan='strict_order'`;
          }
          if (mode === "ivfflat_10")
            await tx.$executeRaw`SET LOCAL ivfflat.probes=10`;
          if (mode === "ivfflat_100")
            await tx.$executeRaw`SET LOCAL ivfflat.probes=100`;
          // EXPLAIN runs separately below; measured request is the SELECT plus transaction/config cost.
          return tx.$queryRaw(sql);
        });
        const ms = performance.now() - t,
          access = serverAccess(q.userId, q.agent, q.domains);
        for (const row of rows) {
          const d = byId.get(row.id);
          assert.ok(d);
          assert.equal(d.userId, q.userId);
          assert.equal(d.status, "active");
          assert.ok(d.effectiveAt <= EVAL_NOW);
          assert.ok(!d.expiresAt || d.expiresAt > EVAL_NOW);
          assert.ok(d.labels.every((l) => access.labels.includes(l)));
          assert.ok(!q.domains.length || q.domains.includes(d.domain));
        }
        if (q.cohort === "agent_denied") assert.equal(rows.length, 0);
        runs.push({
          mode,
          trial,
          queryId: q.id,
          cohort: q.cohort,
          ms,
          ids: rows.map((r) => r.id),
          gold: q.expectedSourceIds.length
            ? Number(
                rows.some((r) =>
                  q.expectedSourceIds.includes(`source:${r.id}`),
                ),
              )
            : null,
        });
        if (
          trial === 0 &&
          [
            "backup-retention:1",
            "backup-retention:scoped",
            "agent:backup-retention",
          ].includes(q.id)
        ) {
          plans[`${mode}:${q.id}`] = await db.$transaction(async (tx) => {
            if (mode === "hnsw_iterative_100") {
              await tx.$executeRaw`SET LOCAL hnsw.ef_search=100`;
              await tx.$executeRaw`SET LOCAL hnsw.iterative_scan='strict_order'`;
            }
            if (mode === "ivfflat_10")
              await tx.$executeRaw`SET LOCAL ivfflat.probes=10`;
            if (mode === "ivfflat_100")
              await tx.$executeRaw`SET LOCAL ivfflat.probes=100`;
            return tx.$queryRaw(
              Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`,
            );
          });
        }
      }
    console.log(JSON.stringify({ completed: mode, queries: sample.length }));
  }
  const summary = Object.fromEntries(
    [...new Set(runs.map((r) => r.mode))].map((mode) => {
      const r = runs.filter((r) => r.mode === mode),
        overlaps = r
          .map((row) => {
            const exact = runs.find(
              (e) =>
                e.mode === "native_exact" &&
                e.queryId === row.queryId &&
                e.trial === row.trial,
            );
            return exact.ids.length
              ? row.ids.filter((id) => exact.ids.includes(id)).length /
                  exact.ids.length
              : null;
          })
          .filter((x) => x !== null);
      return [
        mode,
        {
          queries: sample.length,
          trials: 3,
          p50: percentile(
            r.map((x) => x.ms),
            0.5,
          ),
          p95: percentile(
            r.map((x) => x.ms),
            0.95,
          ),
          candidateOverlapAt80: mean(overlaps),
          goldCandidateRecall: mean(
            r.filter((x) => x.gold !== null).map((x) => x.gold),
          ),
          emptyDenied: r.filter(
            (x) => x.cohort === "agent_denied" && !x.ids.length,
          ).length,
        },
      ];
    }),
  );
  const clean = JSON.parse(
    JSON.stringify({ summary, builds, plans, runs }, (_, v) =>
      typeof v === "bigint" ? Number(v) : v,
    ).replace(
      /'\[[^\]]+\]'::vector/g,
      "'<384-dimensional query vector omitted>'::vector",
    ),
  );
  await writeFile(`${dir}/indexes.json`, JSON.stringify(clean, null, 2) + "\n");
  console.log(JSON.stringify(summary));
} finally {
  await db.$executeRaw`DROP TABLE IF EXISTS "MemoryVectorBench"`;
  await db.$disconnect();
}
