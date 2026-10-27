# Memory Engine V2.2 — Evidence quality, abstention and performance

Source implementation and isolated evaluation, 2026-10-27. Production settings, schemas,
services, secrets and provider permissions remain unchanged. This continues the
[20,576-memory V2 evaluation](./memory-retrieval-evaluation.md).

## Behavior

Retrieval now distinguishes source candidates from support for a requested detail. Questions
asking for a typed fact—such as a device identifier, phone, address, date, named professional,
author, employer, financial amount or measured value—require that detail in the authorized
source text. A related topic or another kind of number is insufficient. The conservative filter
rejects missing provenance, negated/unconfirmed values, mismatched named entities and unresolved
exact-time requests. Ordinary definitions, instructions and brainstorming retain the normal
Assistant path. General narrative retrieval remains explicitly unverified support.

When a memory question has insufficient evidence and no relevant authoritative structured
records, the Assistant returns:

> I don't know from the available memory evidence. I couldn't find a source that supports that detail.

This response is persisted with source `memory-insufficient` and returned before gateway health
checks or generation. It has no fabricated citation. The context policy separately tells the
model to distinguish related evidence from support and to state uncertainty. Existing direct
status, intent and deterministic finance routes retain their precedence. Missing-data placeholders
in structured records do not count as usable evidence; valid structured aggregations still do.

The gate is a conservative English rule system, **not semantic entailment, calibrated confidence,
or proof that every accepted source answers the question**. It can decline valid unusual formats,
miss unmodeled missing facts, or accept text with subtler ambiguity. Recent conversation text and
unverified summaries do not override a missing durable fact in the deterministic abstention path.
No hosted provider or new generative model is enabled.

## Ranking and performance changes

Candidate authorization, owner isolation, scope and sensitivity checks, lifecycle/expiry filters,
compatible model identity and source revalidation remain in SQL. New processing happens only
after those filters. Ranked candidates receive a bounded rare-query-term contribution; near-identical
repeated notes are deferred behind distinct evidence. Different numeric facts and explicit
conflicts are protected from duplicate deferral. No record or provenance link is deleted or merged.

Vector transactions use `SET LOCAL plan_cache_mode='force_custom_plan'`. The experiment found
that generic prepared plans caused a large latency jump after repeated calls, whereas disabling
JIT did not fix it. This is a transaction-local setting for optional vector search; connection or
server-wide planning defaults are unchanged. The exact query materializes eligible vectors once
and computes distance once. [PostgreSQL documents plan-cache modes and their tradeoff between
planning and execution cost](https://www.postgresql.org/docs/16/runtime-config-query.html).

`MEMORY_VECTOR_STRATEGY=selective` skips query embedding/vector SQL for typed factual requests
that still require explicit lexical support; general paraphrases retain vector retrieval.
`always` remains available for comparison and rollout review. Both strategies apply the same
evidence gate and retain full-text fallback. Existing vector/provider/disclosure flags remain
opt-in. No automatic scope inference broadens grants.

Per-call timings separate revision lookup, query embedding, lexical SQL, vector SQL, candidate
hydration, ranking, source hydration and audit writes. Returned total timing includes the audit;
the audit itself can only record stages completed before its write. No query text, excerpts,
embeddings or provider responses are added to general logs.

## Evaluation design

The frozen 312 questions and original 20,576 documents are unchanged. They are now a **development
and regression set**, since V2.2 deliberately addresses errors observed in V2. Twelve separately
authored typed facts add paired supported/absent questions and 24 documents, for **336 questions
and 20,600 records**. Supported facts live under a different owner than the paired absent notes,
so matching another owner's fact must never permit an answer.

Four modes use the same data: frozen V2 full-text, frozen V2 hybrid, V2.2 always-vector, and V2.2
selective-vector. Each query runs three times in counterbalanced order, with application caches
cleared before scoring. Database and OS caches are warm; requests are serial. Timings include
local CPU MiniLM inference where used, SQL, hydration and audit writes. The same immutable model,
PostgreSQL 16.14, pgvector 0.8.2, isolated two-CPU/two-GiB database and CPU host described in the
V2 report are reused. Source labels and thresholds are recorded; this is not a real-user benchmark.

The first V2.2 pilot exposed remaining wrong-field financial matches and duplicate crowding. Those
were corrected using targeted negative tests, then the final repeated comparison was run. The
original baseline retrieval implementation is frozen in the evaluation tooling, with only import
paths and a ranking timer changed. General-chat guard refinements are checked for parity against
all recorded benchmark evidence before final verification.

Quality includes recall@1/5/10, MRR, nDCG, precision@5, micro source precision, answerability confusion
counts, and accepted-source correctness. Answerability predicts whether evidence is offered against
whether an authorized gold source exists in the corpus; accepted-source correctness separately
checks that the offered top ten actually contain the gold. These are different quantities.
Labels remain one gold source per positive query, so precision@5 cannot exceed 0.2. They are not
exhaustive human relevance judgments or measurements of generated-answer truthfulness.

## Recorded results

The final comparison made **4,032 scored retrieval calls** (336 questions × four modes × three
trials), plus 168 warm-cache probes, in **658.7 seconds**. The table uses only the unchanged
312-question set (270 positive questions) for comparability with V2.

| Metric | V2 full-text | V2 hybrid | V2.2 always | V2.2 selective |
| --- | ---: | ---: | ---: | ---: |
| Recall@1 | 13.7% | 50.7% | 55.9% | 55.9% |
| Recall@5 | 62.6% | 77.8% | 81.5% | 81.5% |
| Recall@10 | 67.0% | 83.7% | 88.1% | 88.1% |
| MRR | 0.353 | 0.627 | 0.676 | 0.676 |
| nDCG@10 | 0.432 | 0.678 | 0.726 | 0.726 |
| Precision@5 (single gold) | 12.5% | 15.6% | 16.3% | 16.3% |
| Micro source precision | 6.4% | 8.0% | 9.1% | 9.1% |
| Accepted top-10 source correctness | 61.4% | 76.6% | 87.8% | 87.8% |
| p50 complete retrieval | 12.2 ms | 509.0 ms | 205.7 ms | 204.4 ms |
| p95 complete retrieval | 57.4 ms | 558.3 ms | 252.9 ms | 251.5 ms |

V2.2 retrieved the gold source in the top five for **220/270** questions versus **210/270**
with V2 hybrid: ten gains, **zero new recall@5 regressions**. Both journal-transition cases moved
from rank **10 to 5**. They remain below the full-text rank of 3; this fixes the top-five failure,
not every ranking imperfection. Duplicate generic reflections had occupied the earlier slots.

All **24/24 original missing-answer questions** now return no supplied evidence, versus **0/24**
in both V2 modes. The 12 additional supported facts retain their correct source at rank one,
and all 12 paired absent facts abstain despite another owner having a matching fact. There were
**zero false abstentions among the 282 positive questions** in this dataset. Across all 54 negative
questions, 53 return no evidence; the remaining mixed-label specialist question retrieves unrelated
but authorized sources. No unauthorized source, lifecycle violation or nondeterministic repeat
ranking was observed in any mode.

For the complete 336-query set, V2.2 answerability counts are TP=282, FN=0, FP=1, TN=53
(precision 99.6%, recall 100%, specificity 98.1%). These count the existence of an authorized gold
source in the corpus, not whether the offered sources support an answer. On the frozen set,
**12.2% of accepted top-ten result sets still lack their judged gold source**. This residual
source-correctness risk is why `unverified_support` is not called factual certainty.

A separate deterministic reconstruction uses the application's memory payload, default k=8,
source metadata, 1,100-byte excerpt cap and context budget, with no transcript/structured data.
Gold survives context selection in **235/282 (83.3%)** V2.2 positive cases versus **222/282
(78.7%)** for V2 hybrid. Negative contexts containing evidence fall from 37 to 1 across all 54
negative cases. Maximum serialized context bound is 4,520 UTF-8 bytes/token upper-bound units.
This is context-source retention, not generated-answer accuracy. The real Assistant also rechecks
support after excerpt clipping and budget selection, and abstains if the surviving evidence is
insufficient.

### Where the 509 ms went

| Component, per-call median | V2 hybrid | V2.2 selective |
| --- | ---: | ---: |
| Local embedding HTTP | 4.41 ms | 4.56 ms |
| Full-text SQL | 8.00 ms | 8.00 ms |
| Vector SQL | 487.00 ms | 180.00 ms |
| JavaScript ranking | 0.06 ms | 1.69 ms |
| Other: hydration, audit, revision and client overhead | 7.90 ms | 10.43 ms |

Component percentiles are not additive. SQL durations come from Prisma query events; embedding
HTTP timing ends at response headers, with parsing/client overhead in the residual. Internal
V2.2 stage timers separately include complete adapter and transaction calls. No timing captures
query contents or credentials in general application logs.

The initial profile reproduced a jump from about 163–170 ms vector SQL to 483–501 ms after
repeated executions selected a generic plan. Disabling JIT left the slowdown intact. Forcing a
custom plan held the same baseline SQL around 163–169 ms. The final V2.2 path also pays for
candidate text and the new evidence/diversity logic; it still reduces median complete latency by
**59.8%**. Selective mode has the same quality as always-vector here and mainly helps typed facts:
original missing-answer p50 drops from 201.8 ms to 9.6 ms.
It does not remove the broad-query exact-scan cost.


## Isolated index and cache experiments

Indexes are benchmarked on a disposable `MemoryVectorBench` snapshot with native `vector(384)`
values. Application tables and migrations are unchanged. Native exact search, HNSW, iterative
HNSW and IVFFlat are compared with the same authorized filters and compatible model identity.
The sample covers unrestricted paraphrases, scoped queries and all specialized-agent boundaries.
Actual plans are captured to distinguish indexed execution from a planner's choice of an exact
scan. Candidate overlap with exact top 80 and gold-source candidate recall are both measured;
ANN candidate recall is not the same as end-to-end answer quality.

pgvector documents that approximate-index filtering and search parameters affect recall; iterative
scans can examine more candidates. See the [pgvector filtering and iterative scan documentation](https://github.com/pgvector/pgvector#filtering).
No ANN option is installed in the application or enabled based solely on index speed.

The cache experiment separately measures cold application caches, immediate full-result hits,
and query-vector-only hits after the real 30-second result TTL expires while the 60-second vector
TTL remains valid. It checks actual embedding request counts, source-rank equality and cache-hit
flags. Every hit still reloads authorized records and sources.

| Snapshot strategy | p50 / p95 SQL path | Exact top-80 overlap | Gold candidate recall |
| --- | ---: | ---: | ---: |
| native_exact | 3.96 / 32.34 ms | 100.0% | 69.4% |
| hnsw_40 | 1.34 / 3.51 ms | 69.6% | 54.8% |
| hnsw_iterative_100 | 2.15 / 3.75 ms | 86.2% | 59.7% |
| ivfflat_10 | 1.94 / 3.53 ms | 94.8% | 67.7% |
| ivfflat_100 | 3.48 / 18.32 ms | 100.0% | 69.4% |

The 80-query sample ran three times per strategy (1,200 calls), including 62 positive queries
and all 16 forbidden-domain checks. All forbidden-domain calls returned empty; all candidate
IDs passed owner, scope, label and lifecycle assertions. Native exact gold candidate recall is
43/62; pure vector search does not recover every gold source that hybrid can recover lexically.
The best sampled approximate IVFFlat setting (`probes=10`) loses one of those 43 gold candidates.
HNSW at ef_search=40 and iterative ef_search=100 loses nine and six respectively.

Plans show real HNSW/IVFFlat use for the unrestricted sample. Scoped and specialist samples
choose the ordinary owner index. At `ivfflat.probes=100`, the planner chooses an exact owner-index
scan, so that row is **not an ANN speed claim**. HNSW built in 1.53 seconds and used 39.6 MiB;
IVFFlat built in 0.26 seconds and used 32.7 MiB. Snapshot storage/build costs exclude the future
application migration and maintenance work.

Native vector storage is a promising next performance change, but these are isolated SQL
measurements, not an implemented end-to-end production speedup. Adding it would require a
reviewed migration, durable synchronization, identity constraints and deletion/reindex tests.
No approximate index is adopted because the sampled speed/recall tradeoff is unfavorable.

| Cache condition, 24 distinct queries | p50 | p95 | Embedding HTTP calls |
| --- | ---: | ---: | ---: |
| cold_application | 212.05 ms | 239.61 ms | 24 |
| both_caches | 2.95 ms | 3.47 ms | 0 |
| query_vector_only | 204.37 ms | 239.57 ms | 0 |

Every immediate full-result hit and vector-only hit preserved source ranks. Vector-only hits
avoided inference but still paid the exact SQL cost; full-result caching provides the large gain.
This is a controlled repeat-access experiment, not an expected production hit-rate estimate.


## Verification, reproduction and remaining limits

Use the [isolated setup guide](../apps/web/scripts/memory-eval/README.md), then the V2.2 commands
listed there. Every database runner refuses the production database and requires the explicit
synthetic database/socket identity. Index-table creation and removal affect only the disposable
container. A separate host-native test cluster and isolated build/loopback preview verify the
existing memory API and Assistant response behavior without production configuration.

Final isolated verification passed: **125 unit/regression tests**, **19 memory database tests**,
**42 HTTP/Chromium assertions**, and **10 live pgvector/local-provider checks**. ESLint,
TypeScript, the production build in the isolated source copy, and release-metadata consistency
also passed. The HTTP/browser checks used a loopback development preview; the production build
was verified separately. Source metadata remains 17.13.0; no release, deployment, or production
migration was performed. See the durable [verification record](./evaluations/memory-v22-2026-10-27/verification.json)
and [live vector-validation record](./evaluations/memory-v22-2026-10-27/validation.json).

The temporary preview, mock gateway, and embedding endpoint are stopped; their loopback ports
3329–3331 are closed. The labelled disposable pgvector container was stopped and removed,
destroying its tmpfs synthetic database, and the separate host-native PostgreSQL test cluster
was stopped. Production services and configuration were untouched. Synthetic artifacts and
reproduction files remain available; see the [cleanup record](./evaluations/memory-v22-2026-10-27/cleanup.json).

The result does not establish an exhaustive answerability detector, general model faithfulness,
real-user source correctness, concurrent service capacity or ANN production readiness. The typed
acceptance set is small and authored alongside the implementation. General narrative questions
still require grounded generation, and broad-source false positives must remain visible in the
metrics. Treat the evidence state as a retrieval decision, not a factual confidence score.
