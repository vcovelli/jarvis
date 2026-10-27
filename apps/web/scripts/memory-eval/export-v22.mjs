import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import {
  makeCorpus,
  EVAL_NOW,
} from "../../src/lib/memory/evaluation/corpus.ts";
import { answerabilityCases } from "../../src/lib/memory/evaluation/answerability.ts";
import { composeContext } from "../../src/lib/memory/context.ts";
import { clip } from "../../src/lib/memory/policy.ts";
import { memoryAbstention } from "../../src/lib/memory/evidence.ts";
const input = "/tmp/jarvis-memory-vector-eval/v22",
  dest = resolve(
    process.argv[2] ?? "../../docs/evaluations/memory-v22-2026-10-27",
  );
await mkdir(dest, { recursive: true });
const read = async (name) =>
  JSON.parse(await readFile(`${input}/${name}.json`, "utf8"));
const write = (name, value) =>
  writeFile(`${dest}/${name}.json`, JSON.stringify(value, null, 2) + "\n");
const rows = await read("per-query"),
  summary = await read("summary");
assert.equal(rows.length, 1344);
assert.equal(summary.repeats, 3);
const docs = new Map(
  makeCorpus().documents.map((d) => [
    d.sourceId,
    { ...d, reliability: "synthetic_user_statement" },
  ]),
);
for (const c of answerabilityCases)
  for (const userId of ["memory-v22-supported", "memory-v22-absent"]) {
    const id = `${userId}:${c.id}`;
    docs.set(`source:${id}`, {
      id,
      sourceId: `source:${id}`,
      content: userId.endsWith("supported") ? c.content : c.negative,
      domain: c.domain,
      sourceAt: EVAL_NOW,
      reliability: "user_stated",
    });
  }
const contextRows = [];
for (const row of rows) {
  if (row.mode.startsWith("v22_"))
    assert.equal(
      memoryAbstention(row.text, row.evidence.status),
      row.abstention,
    );
  // Reconstruct the application's memory payload, default k=8, without other context sections.
  const context = composeContext({
    task: row.text,
    identity: `Authenticated owner. Agent: personal assistant. Authorized scopes: ${row.domains.join(", ")}.`,
    structured: [],
    messages: [],
    memories: row.sources.slice(0, 8).map((source) => {
      const d = docs.get(source);
      assert.ok(d);
      return {
        id: d.id,
        kind: "user_stated",
        data: {
          excerpt: clip(d.content, 1100),
          sources: [
            {
              memoryId: d.id,
              sourceType: "manual",
              sourceId: d.sourceId,
              sourceAt: d.sourceAt,
              reliability: d.reliability,
            },
          ],
          scope: d.domain,
          at: d.sourceAt,
          conflict: false,
          confidence: { kind: "uncalibrated", value: null },
        },
      };
    }),
  });
  assert.ok(context.tokenEstimate <= 12000);
  const goldIds = row.expectedSourceIds.map((source) => docs.get(source).id);
  contextRows.push({
    mode: row.mode,
    query: row.id,
    positive: goldIds.length > 0,
    selected: context.selectedMemoryIds,
    goldRetained: goldIds.some((id) => context.selectedMemoryIds.includes(id)),
    tokenUpperBound: context.tokenEstimate,
  });
}
const contextSummary = Object.fromEntries(
  [...new Set(rows.map((r) => r.mode))].map((mode) => {
    const r = contextRows.filter((r) => r.mode === mode),
      p = r.filter((r) => r.positive),
      n = r.filter((r) => !r.positive);
    return [
      mode,
      {
        positive: p.length,
        goldRetained: p.filter((r) => r.goldRetained).length,
        recall: p.filter((r) => r.goldRetained).length / p.length,
        negative: n.length,
        negativeWithEvidence: n.filter((r) => r.selected.length).length,
        maxTokenUpperBound: Math.max(...r.map((r) => r.tokenUpperBound)),
      },
    ];
  }),
);
await write("summary", summary);
await write("context-summary", contextSummary);
await write("guard-parity", await read("guard-parity"));
await write("cache", await read("cache"));
const indexes = await read("indexes");
await write("indexes", {
  summary: indexes.summary,
  builds: indexes.builds,
  plans: indexes.plans,
});
const escape = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
const csv = (name, header, data) =>
  writeFile(
    `${dest}/${name}.csv`,
    [header, ...data].map((row) => row.map(escape).join(",")).join("\n") + "\n",
  );
await csv(
  "per-query",
  [
    "mode",
    "query",
    "cohort",
    "expected_sources",
    "returned_sources",
    "recall1",
    "recall5",
    "recall10",
    "mrr",
    "ndcg10",
    "precision5",
    "trial_ms",
    "embedding_ms",
    "lexical_ms",
    "vector_ms",
    "ranking_ms",
    "other_ms",
    "evidence_status",
    "abstention",
    "context_sources",
    "context_gold",
  ],
  rows.map((r, i) => [
    r.mode,
    r.id,
    r.cohort,
    r.expectedSourceIds.join("|"),
    r.sources.join("|"),
    r.quality.recallAt1,
    r.quality.recallAt5,
    r.quality.recallAt10,
    r.quality.mrr,
    r.quality.ndcgAt10,
    r.quality.precisionAt5,
    r.timings.map((x) => x.toFixed(3)).join("|"),
    ...["embeddingMs", "lexicalMs", "vectorMs", "rankingMs", "otherMs"].map(
      (k) => r.phases.map((p) => p[k].toFixed(3)).join("|"),
    ),
    r.evidence?.status,
    r.abstention,
    contextRows[i].selected.join("|"),
    contextRows[i].goldRetained,
  ]),
);
await csv(
  "index-per-query",
  [
    "mode",
    "trial",
    "query",
    "cohort",
    "ms",
    "gold_in_candidates",
    "candidate_ids",
  ],
  indexes.runs.map((r) => [
    r.mode,
    r.trial,
    r.queryId,
    r.cohort,
    r.ms,
    r.gold,
    r.ids.join("|"),
  ]),
);
const profile = JSON.parse(
  await readFile(
    "/tmp/jarvis-memory-vector-eval/results/v22-plan-cache-profile.json",
    "utf8",
  ),
);
await write("planner-profile", profile);
const hashes = {};
async function hashTree(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name);
    if (entry.isDirectory()) await hashTree(file);
    else if (/\.(?:ts|mjs|py|json|txt|md)$/.test(file))
      hashes[relative(resolve("../.."), file)] = createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
  }
}
await hashTree(resolve("src/lib/memory"));
await hashTree(resolve("scripts/memory-eval"));
for (const name of [
  "src/lib/memory/assistant.ts",
  "src/app/api/assistant/message/route.ts",
  ".env.example",
  "package.json",
]) {
  const file = resolve(name);
  hashes[relative(resolve("../.."), file)] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}
await write("source-hashes", hashes);
console.log(
  JSON.stringify({
    queries: summary.queries,
    rows: rows.length,
    contextSummary,
  }),
);
