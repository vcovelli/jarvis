import assert from "node:assert/strict";
import test from "node:test";
import { makeCorpus, EVAL_NOW } from "./corpus.ts";
import { quality, percentile, pairedBootstrap } from "./metrics.ts";
import { serverAccess } from "../policy.ts";

test("frozen corpus has eligible source-level gold, realistic distractors, and boundary cases", () => {
  const corpus = makeCorpus();
  assert.equal(
    corpus.fingerprint,
    "f8a6723c02426ecd25153a7c7e77cc38020fd50ce348ede573067549ea9efb73",
  );
  assert.equal(corpus.documents.length, 20576);
  assert.equal(corpus.queries.length, 312);
  const sources = new Map(corpus.documents.map((d) => [d.sourceId, d]));
  assert.equal(sources.size, corpus.documents.length);
  assert.equal(
    corpus.queries.filter((q) => q.expectedSourceIds.length).length,
    270,
  );
  assert.equal(
    corpus.documents.filter((d) => d.kind === "boundary").length,
    384,
  );
  for (const query of corpus.queries) {
    const access = serverAccess(query.userId, query.agent, query.domains);
    for (const source of query.expectedSourceIds) {
      const document = sources.get(source)!;
      assert.ok(document, query.id);
      assert.equal(document.userId, query.userId);
      assert.equal(document.status, "active");
      assert.ok(document.effectiveAt <= EVAL_NOW);
      assert.ok(!document.expiresAt || document.expiresAt > EVAL_NOW);
      assert.ok(
        document.labels.every((label) => access.labels.includes(label)),
      );
      assert.ok(
        !query.domains.length || query.domains.includes(document.domain),
      );
    }
  }
});

test("metrics count unique relevant sources and respect rank cutoffs", () => {
  const result = quality(["a", "b"], ["wrong", "a", "a", "b"]);
  assert.equal(result.recallAt1, 0);
  assert.equal(result.recallAt5, 1);
  assert.equal(result.precisionAt5, 2 / 5);
  assert.equal(result.mrr, 1 / 2);
  assert.ok(
    Math.abs(
      result.ndcgAt10! -
        (1 / Math.log2(3) + 1 / Math.log2(5)) / (1 + 1 / Math.log2(3)),
    ) < 1e-12,
  );
  const late = quality(
    ["a"],
    [...Array.from({ length: 9 }, (_, i) => `wrong-${i}`), "a"],
  );
  assert.equal(late.recallAt5, 0);
  assert.equal(late.recallAt10, 1);
  assert.equal(late.mrr, 0.1);
});

test("missing evidence is evaluated separately from positive recall", () => {
  assert.equal(quality([], []).recallAt5, null);
  assert.equal(quality([], []).ndcgAt10, null);
  assert.equal(quality([], []).empty, true);
  assert.equal(quality([], ["unrelated"]).empty, false);
  assert.equal(quality(["a"], []).recallAt5, 0);
  assert.equal(quality(["a"], []).mrr, 0);
});

test("nearest-rank percentiles and paired bootstrap are deterministic", () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.95), 5);
  assert.equal(percentile([], 0.5), null);
  assert.deepEqual(pairedBootstrap([1, 1, 1]), {
    mean: 1,
    low: 1,
    high: 1,
    rounds: 2000,
  });
  assert.deepEqual(
    pairedBootstrap([0, -1, 1, 0.5]),
    pairedBootstrap([0, -1, 1, 0.5]),
  );
});
