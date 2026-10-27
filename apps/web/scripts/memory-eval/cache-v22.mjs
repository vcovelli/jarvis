import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { retrieve, clearMemoryCaches } from "../../src/lib/memory/retrieval.ts";
import { serverAccess } from "../../src/lib/memory/policy.ts";
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
const db = new PrismaClient(),
  queries = makeCorpus()
    .queries.filter((q) => q.cohort === "paraphrase")
    .slice(0, 24),
  rows = [];
let requests = 0;
const original = globalThis.fetch;
globalThis.fetch = async (...args) => {
  requests++;
  return original(...args);
};
async function measured(q, mode) {
  const before = requests,
    start = performance.now();
  const r = await retrieve(
    db,
    serverAccess(q.userId, q.agent, q.domains),
    q.text,
    { now: EVAL_NOW, limit: 10, vectorStrategy: "always" },
  );
  const row = {
    mode,
    query: q.id,
    ms: performance.now() - start,
    cacheHit: r.cacheHit,
    embeddingRequests: requests - before,
    timings: r.timings,
    ids: r.items.map((i) => i.id),
  };
  rows.push(row);
  return row;
}
try {
  clearMemoryCaches();
  for (const q of queries) {
    const cold = await measured(q, "cold_application");
    assert.equal(cold.cacheHit, false);
    assert.equal(cold.embeddingRequests, 1);
    const hot = await measured(q, "both_caches");
    assert.equal(hot.cacheHit, true);
    assert.equal(hot.embeddingRequests, 0);
    assert.deepEqual(hot.ids, cold.ids);
  }
  console.log(
    "Waiting 31 seconds for the 30-second result cache to expire; query vectors live for 60 seconds.",
  );
  await new Promise((resolve) => setTimeout(resolve, 31000));
  for (const q of queries) {
    const vector = await measured(q, "query_vector_only");
    assert.equal(vector.cacheHit, false);
    assert.equal(vector.embeddingRequests, 0);
    assert.deepEqual(
      vector.ids,
      rows.find((r) => r.query === q.id && r.mode === "cold_application").ids,
    );
  }
  const summary = Object.fromEntries(
    ["cold_application", "both_caches", "query_vector_only"].map((mode) => {
      const r = rows.filter((r) => r.mode === mode);
      return [
        mode,
        {
          n: r.length,
          p50: percentile(
            r.map((r) => r.ms),
            0.5,
          ),
          p95: percentile(
            r.map((r) => r.ms),
            0.95,
          ),
          embeddingRequests: r.reduce((n, r) => n + r.embeddingRequests, 0),
        },
      ];
    }),
  );
  await mkdir("/tmp/jarvis-memory-vector-eval/v22", { recursive: true });
  await writeFile(
    "/tmp/jarvis-memory-vector-eval/v22/cache.json",
    JSON.stringify({ summary, rows }, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary));
} finally {
  await db.$disconnect();
}
