// Baseline diagnostic only; all session changes use a one-connection disposable client.
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { retrieve, clearMemoryCaches } from "./baseline-retrieval.ts";
import { serverAccess } from "../../src/lib/memory/policy.ts";
import {
  makeCorpus,
  EVAL_NOW,
} from "../../src/lib/memory/evaluation/corpus.ts";
if (
  process.env.MEMORY_VECTOR_TEST_ISOLATED !== "1" ||
  !process.env.DATABASE_URL.includes(
    "jarvis_memory_vector_eval?host=/tmp/jarvis-memory-vector-eval/socket",
  )
)
  throw Error("isolated DB required");
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
const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
let events = [],
  embeddingMs = 0;
db.$on("query", (e) => events.push(e));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const start = performance.now();
  const r = await originalFetch(...args);
  embeddingMs += performance.now() - start;
  return r;
};
const { queries } = makeCorpus(),
  selected = queries.filter((q) =>
    [
      "backup-retention:1",
      "journal-transition:1",
      "journal-transition:scoped",
      "remote-access:1",
    ].includes(q.id),
  ),
  rows = [];
try {
  for (const [jit, planMode] of [
    ["on", "auto"],
    ["off", "auto"],
    ["on", "force_custom_plan"],
  ]) {
    await db.$executeRawUnsafe(`SET plan_cache_mode=${planMode}`);
    await db.$executeRawUnsafe(`SET jit=${jit}`);
    for (let trial = 0; trial < 3; trial++)
      for (const q of selected) {
        clearMemoryCaches();
        events = [];
        embeddingMs = 0;
        const t = performance.now();
        const r = await retrieve(
          db,
          serverAccess(q.userId, q.agent, q.domains),
          q.text,
          { limit: 10, now: EVAL_NOW },
        );
        const totalMs = performance.now() - t,
          measurements = events.map((e) => ({
            kind: e.query.includes("WITH eligible")
              ? "vector"
              : e.query.includes("searchVector")
                ? "lexical"
                : e.query.includes("AuditLog")
                  ? "audit"
                  : "other",
            ms: e.duration,
          }));
        rows.push({
          jit,
          planMode,
          trial,
          query: q.id,
          totalMs,
          embeddingMs,
          sql: measurements,
          ids: r.items.map((i) => i.id),
        });
        if (
          jit === "on" &&
          planMode === "auto" &&
          trial === 2 &&
          q.id === "journal-transition:1"
        ) {
          const e = events.find((e) => e.query.includes("WITH eligible"));
          const plan = await db.$queryRawUnsafe(
            "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + e.query,
            ...JSON.parse(e.params).map((p) =>
              typeof p === "string" && /^2026-10-26/.test(p) ? new Date(p) : p,
            ),
          );
          await writeFile(
            "/tmp/jarvis-memory-vector-eval/results/v22-baseline-plan.json",
            JSON.stringify(plan, null, 2),
          );
        }
      }
  }
  await writeFile(
    "/tmp/jarvis-memory-vector-eval/results/v22-plan-cache-profile.json",
    JSON.stringify(rows, null, 2),
  );
  console.log(
    JSON.stringify(
      rows.map((r) => ({
        ...r,
        ids: undefined,
        sql: r.sql.filter((e) => ["vector", "lexical"].includes(e.kind)),
      })),
    ),
  );
} finally {
  await db.$disconnect();
}
