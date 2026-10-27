import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { retrieve, clearMemoryCaches } from "../../src/lib/memory/retrieval.ts";
import {
  retrieve as baseline,
  clearMemoryCaches as clearBaseline,
  baselineRankingMs,
} from "./baseline-retrieval.ts";
import {
  serverAccess,
  contentHash,
  classifyLabels,
} from "../../src/lib/memory/policy.ts";
import { embeddingProvider } from "../../src/lib/memory/embedding.ts";
import { memoryAbstention } from "../../src/lib/memory/evidence.ts";
import {
  makeCorpus,
  EVAL_NOW,
} from "../../src/lib/memory/evaluation/corpus.ts";
import { answerabilityCases } from "../../src/lib/memory/evaluation/answerability.ts";
import {
  quality,
  percentile,
} from "../../src/lib/memory/evaluation/metrics.ts";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.MEMORY_VECTOR_TEST_ISOLATED !== "1" ||
  url.pathname !== "/jarvis_memory_vector_eval" ||
  url.searchParams.get("host") !== "/tmp/jarvis-memory-vector-eval/socket"
)
  throw Error("Disposable vector database required");
Object.assign(process.env, {
  MEMORY_VECTOR_ENABLED: "true",
  MEMORY_EMBEDDING_PROVIDER: "local",
  MEMORY_EMBEDDING_URL: "http://127.0.0.1:3331/v1/embeddings",
  MEMORY_EMBEDDING_MODEL: "sentence-transformers/all-MiniLM-L6-v2",
  MEMORY_EMBEDDING_VERSION:
    "1110a243fdf4706b3f48f1d95db1a4f5529b4d41:onnx-fp32-mean-l2-256",
  MEMORY_EMBEDDING_DIMENSION: "384",
  MEMORY_EMBEDDING_ALLOWED_LABELS:
    "private,finance,health,journal,infrastructure,work",
});
delete process.env.MEMORY_EMBEDDING_KEY;
const dir = "/tmp/jarvis-memory-vector-eval/v22";
await mkdir(dir, { recursive: true });
const json = (name, value) =>
  writeFile(`${dir}/${name}.json`, JSON.stringify(value, null, 2) + "\n");
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] }),
  provider = embeddingProvider();
let queryEvents = [],
  embeddingMs = 0;
db.$on("query", (e) =>
  queryEvents.push({ query: e.query, duration: e.duration }),
);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const start = performance.now();
  const result = await originalFetch(...args);
  embeddingMs += performance.now() - start;
  return result;
};
const corpus = makeCorpus(),
  docs = new Map(corpus.documents.map((d) => [d.id, d])),
  queries = [...corpus.queries];
const owners = ["memory-v22-supported", "memory-v22-absent"];
async function expanded() {
  await db.user.deleteMany({ where: { id: { in: owners } } });
  for (const owner of owners)
    await db.user.create({
      data: { id: owner, memoryState: { create: { revision: 1 } } },
    });
  for (const c of answerabilityCases)
    for (const [index, userId] of owners.entries()) {
      const id = `${userId}:${c.id}`,
        content = index ? c.negative : c.content,
        labels = classifyLabels(c.domain, content);
      await db.memoryRecord.create({
        data: {
          id,
          userId,
          title: c.id,
          domain: c.domain,
          content,
          contentHash: contentHash(content),
          sourceAt: EVAL_NOW,
          effectiveAt: EVAL_NOW,
          labels,
          status: "active",
          importance: 3,
          assertion: "user_stated",
          extractionMethod: "v22-acceptance",
          embedding: await provider.embed(content),
          embeddingModel: provider.model,
          embeddingVersion: provider.version,
          embeddingDimension: 384,
          embeddingStatus: "ready",
        },
      });
      await db.memorySource.create({
        data: {
          userId,
          memoryId: id,
          sourceType: "manual",
          sourceId: `source:${id}`,
          sourceAt: EVAL_NOW,
          reliability: "user_stated",
        },
      });
      docs.set(id, {
        id,
        userId,
        domain: c.domain,
        content,
        status: "active",
        labels,
        effectiveAt: EVAL_NOW,
        expiresAt: null,
        sourceId: `source:${id}`,
      });
      queries.push({
        id,
        text: c.query,
        userId,
        agent: "assistant",
        domains: [c.domain],
        expectedSourceIds: index ? [] : [`source:${id}`],
        cohort: index ? "detail_absent" : "detail_supported",
        scenario: c.id,
      });
    }
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const timing = (a) => ({ p50: percentile(a, 0.5), p95: percentile(a, 0.95) });
function summarize(rows) {
  const positive = rows.filter((r) => r.expectedSourceIds.length),
    negative = rows.filter((r) => !r.expectedSourceIds.length),
    accepted = rows.filter((r) => r.sources.length);
  return {
    queries: rows.length,
    positive: positive.length,
    negative: negative.length,
    recallAt1: mean(positive.map((r) => r.quality.recallAt1)),
    recallAt5: mean(positive.map((r) => r.quality.recallAt5)),
    recallAt10: mean(positive.map((r) => r.quality.recallAt10)),
    mrr: mean(positive.map((r) => r.quality.mrr)),
    ndcg: mean(positive.map((r) => r.quality.ndcgAt10)),
    precisionAt5: mean(positive.map((r) => r.quality.precisionAt5)),
    sourcePrecision:
      rows.reduce(
        (sum, r) =>
          sum + r.sources.filter((s) => r.expectedSourceIds.includes(s)).length,
        0,
      ) /
      Math.max(
        1,
        rows.reduce((s, r) => s + r.sources.length, 0),
      ),
    acceptedSourceCorrectness: mean(
      accepted.map((r) => Number(r.quality.recallAt10 > 0)),
    ),
    answerability: {
      truePositive: positive.filter((r) => r.sources.length).length,
      falseNegative: positive.filter((r) => !r.sources.length).length,
      falsePositive: negative.filter((r) => r.sources.length).length,
      trueNegative: negative.filter((r) => !r.sources.length).length,
    },
    latencyMs: timing(rows.flatMap((r) => r.timings)),
    phases: Object.fromEntries(
      ["embeddingMs", "lexicalMs", "vectorMs", "rankingMs", "otherMs"].map(
        (k) => [k, timing(rows.flatMap((r) => r.phases.map((p) => p[k])))],
      ),
    ),
  };
}
try {
  assert.equal(
    (
      await db.$queryRaw`SELECT extversion FROM pg_extension WHERE extname='vector'`
    )[0]?.extversion,
    "0.8.2",
  );
  assert.equal(
    JSON.parse(
      await readFile(
        "/tmp/jarvis-memory-vector-eval/results/seed.json",
        "utf8",
      ),
    ).fingerprint,
    corpus.fingerprint,
  );
  await expanded();
  const modes = process.env.MEMORY_EVAL_V22_MODES?.split(",") ?? [
    "baseline_fulltext",
    "baseline_hybrid",
    "v22_always",
    "v22_selective",
  ];
  const repeats = Number(process.env.MEMORY_EVAL_REPEATS ?? 3),
    runs = new Map(),
    warm = [];
  let count = 0;
  const started = performance.now();
  for (let trial = 0; trial < repeats; trial++)
    for (const [index, q] of queries.entries()) {
      const order = (index + trial) % 2 ? [...modes].reverse() : modes;
      for (const mode of order) {
        const isBaseline = mode.startsWith("baseline");
        process.env.MEMORY_VECTOR_ENABLED = String(
          mode !== "baseline_fulltext",
        );
        clearMemoryCaches();
        clearBaseline();
        queryEvents = [];
        embeddingMs = 0;
        const start = performance.now(),
          access = serverAccess(q.userId, q.agent, q.domains);
        const result = await (isBaseline ? baseline : retrieve)(
            db,
            access,
            q.text,
            {
              limit: 10,
              now: EVAL_NOW,
              vectorStrategy: mode === "v22_always" ? "always" : "selective",
            },
          ),
          elapsed = performance.now() - start;
        const vectorMs = queryEvents
            .filter((e) => e.query.includes("WITH eligible"))
            .reduce((s, e) => s + e.duration, 0),
          lexicalMs = queryEvents
            .filter((e) => e.query.includes('"searchVector" @@'))
            .reduce((s, e) => s + e.duration, 0),
          rankingMs = isBaseline ? baselineRankingMs : result.timings.rankingMs;
        const phases = {
          embeddingMs,
          vectorMs,
          lexicalMs,
          rankingMs,
          otherMs: Math.max(
            0,
            elapsed - embeddingMs - vectorMs - lexicalMs - rankingMs,
          ),
        };
        const sources = result.items.map((i) => i.sources[0].sourceId);
        for (const item of result.items) {
          const d = docs.get(item.id);
          assert.ok(d);
          assert.equal(d.userId, q.userId);
          assert.equal(d.status, "active");
          assert.ok(d.effectiveAt <= EVAL_NOW);
          assert.ok(!d.expiresAt || d.expiresAt > EVAL_NOW);
          assert.ok(!q.domains.length || q.domains.includes(d.domain));
          assert.ok(d.labels.every((l) => access.labels.includes(l)));
          assert.equal(item.sources[0].sourceId, d.sourceId);
        }
        if (q.cohort === "agent_denied") assert.equal(sources.length, 0);
        const key = `${mode}:${q.id}`,
          prior = runs.get(key);
        if (prior) {
          assert.deepEqual(sources, prior.sources);
          prior.timings.push(elapsed);
          prior.phases.push(phases);
        } else
          runs.set(key, {
            ...q,
            mode,
            sources,
            quality: quality(q.expectedSourceIds, sources),
            timings: [elapsed],
            phases: [phases],
            evidence: result.evidence ?? null,
            abstention: isBaseline
              ? null
              : memoryAbstention(q.text, result.evidence.status),
            vectorStatus: result.vectorStatus ?? null,
          });
        if (trial === 0 && index % 8 === 0) {
          const t = performance.now();
          const hit = await (isBaseline ? baseline : retrieve)(
            db,
            access,
            q.text,
            {
              limit: 10,
              now: EVAL_NOW,
              vectorStrategy: mode === "v22_always" ? "always" : "selective",
            },
          );
          warm.push({
            mode,
            query: q.id,
            ms: performance.now() - t,
            hit: hit.cacheHit,
          });
        }
      }
      if (++count % 40 === 0)
        console.log(
          JSON.stringify({
            trial: trial + 1,
            queries: count,
            seconds: Math.round((performance.now() - started) / 1000),
          }),
        );
    }
  const rows = [...runs.values()],
    summary = {
      fingerprint: corpus.fingerprint,
      queries: queries.length,
      documents: docs.size,
      repeats,
      elapsedMs: performance.now() - started,
      results: Object.fromEntries(
        modes.map((mode) => {
          const rs = rows.filter((r) => r.mode === mode);
          return [
            mode,
            {
              all: summarize(rs),
              frozen: summarize(
                rs.filter((r) => !r.cohort.startsWith("detail_")),
              ),
              cohorts: Object.fromEntries(
                [...new Set(queries.map((q) => q.cohort))].map((c) => [
                  c,
                  summarize(rs.filter((r) => r.cohort === c)),
                ]),
              ),
              warm: timing(
                warm.filter((w) => w.mode === mode).map((w) => w.ms),
              ),
            },
          ];
        }),
      ),
    };
  await json("summary", summary);
  await json("per-query", rows);
  await json("warm", warm);
  console.log(JSON.stringify(summary));
} finally {
  await db.$disconnect();
}
