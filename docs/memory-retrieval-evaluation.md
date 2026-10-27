# Full-text versus hybrid memory retrieval

Retrieval trials ran on 2026-10-26; plan inspection and cleanup completed on 2026-10-27, using the actual Memory V2 retrieval path, a disposable PostgreSQL
16.14 instance with pgvector 0.8.2, and local CPU inference. This report supplements the
[foundation verification](./memory-engine-v2.md). No production migration, configuration,
provider disclosure, service restart, or deployment was performed.

## Environment and method

The database ran in a dedicated Docker container with networking disabled, no published port,
a temporary Unix socket and tmpfs data. Limits were two CPU cores and 2 GiB RAM, with 128 MiB
PostgreSQL shared buffers. All nine repository migrations were applied there. The image was
`pgvector/pgvector:0.8.2-pg16-bookworm`, pinned by SHA-256 digest in the reproduction guide.
The host was an AMD Ryzen 5 5600X with 12 logical CPUs and approximately 32 GiB RAM.

The local model was `sentence-transformers/all-MiniLM-L6-v2`, immutable revision
`1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. A loopback HTTP endpoint loaded the checksum-verified
90.4 MB ONNX fp32 model with ONNX Runtime 1.23.2, two CPU inference threads, attention-mask mean
pooling, L2 normalization, 256-token truncation and 384-dimensional output. The pooling and
truncation follow the [model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2).
Model artifacts and Python packages were the only external downloads. Memory and query inference
remained local; no hosted model or paid API was used. The endpoint's measured post-ingestion RSS
was approximately 226 MiB; this is a snapshot, not a peak-memory bound.

Both modes called `retrieve()` with the same authorization policy, fixed evaluation date,
limit 10, source hydration and context budget. Full-text mode used the existing PostgreSQL
English OR query, lexical top 80 and existing metadata bonuses. Hybrid added compatible-model
cosine candidates with distance below 0.6, semantic top 80 and the existing reciprocal-rank
fusion. The ranking code, threshold, model and labels were not tuned after inspecting results.
This tests the implemented full-text baseline, not every possible lexical ranker such as BM25.

The actual vector query casts stored numeric arrays to `vector` and performs filtered exact
search. It has no HNSW/IVFFlat index. pgvector documents exact search as its default behavior;
ANN would be a separate experiment. See [pgvector's documentation](https://github.com/pgvector/pgvector).

Each of 312 queries ran three times per mode, alternating which mode ran first: **1,872 scored
retrieval calls**. Both application caches were cleared before each call; PostgreSQL and OS
caches were warm. Timings include local query inference, SQL, source hydration and audit/access
writes, measured outside `retrieve()`. They exclude the separate context-composition step.
An additional 63 immediate repeated requests per mode measured warm application caches.
There was one request at a time; this is not a throughput or concurrency test.

## Frozen evaluation set

| Component | Count |
| --- | ---: |
| Manually authored target memories | 64 |
| Same-topic / wrong-project hard negatives | 128 |
| Other-user copies and lifecycle boundary records | 384 |
| Generated plausible background notes | 20,000 |
| Total stored memories, across three owners | **20,576** |
| Eligible memories for the primary owner's unrestricted Assistant | **12,192** |
| Positive source-labeled questions | **270** |
| Missing-answer questions | 24 |
| Forbidden-domain questions | 16 |
| Mixed-label specialist restrictions | 2 |
| Total questions | **312** |

The eight domains are infrastructure, coding, finance, real estate, career, sleep, journal and
household/general. Each target has literal, paraphrase and conversational questions, plus a
scope-restricted paraphrase. Target memories are from 2022–2024, while the 20,000 background
notes are newer. Other-owner duplicates, deleted/superseded/expired/future-effective copies,
wrong-project alternatives and close-topic notes exercise retrieval beyond simple word overlap.

Gold judgments identify exact supporting source IDs, fixed before retrieval scoring. Pre-scoring
validation corrected two specialist expectations: Workshop wording and an employer-match memory
carry the additional `work` label, so those agents cannot read those sources. Other eligible
records in their lanes remain readable. No memory text was changed to improve a score.

Frozen fixture SHA-256:
`f8a6723c02426ecd25153a7c7e77cc38020fd50ce348ede573067549ea9efb73`.
The corpus and questions are reproducible from the checked-in
[fixtures](../apps/web/src/lib/memory/evaluation/corpus.ts) and
[64 authored scenarios](../apps/web/src/lib/memory/evaluation/scenarios.ts).

## Measured results

**Hybrid improved source recall at a substantial latency cost.** Across 270 answerable
questions, recall@5 increased by **15.2 percentage points**, from 169 to 210 successful
retrievals. There were 43 gains and two regressions; 60 questions still missed their gold source
in the first five results. These are source-retrieval scores, not generated-answer scores.

| Metric | Full-text only | Hybrid |
| --- | ---: | ---: |
| Recall@1 | 13.7% (37/270) | 50.7% (137/270) |
| Recall@5 | 62.6% (169/270) | **77.8% (210/270)** |
| Recall@10 | 67.0% (181/270) | **83.7% (226/270)** |
| Mean reciprocal rank, within returned top 10 | 0.353 | **0.627** |
| nDCG@10, binary source labels | 0.432 | **0.678** |
| Complete retrieval latency, p50 | **12.5 ms** | 509.0 ms |
| Complete retrieval latency, p95 | **57.7 ms** | 558.3 ms |
| Immediate warm-cache latency, p50 / p95 | 2.64 / 3.04 ms | 2.80 / 3.35 ms |
| Forbidden-domain empty results | 16/16 | 16/16 |
| Missing-answer empty results | **0/24** | **0/24** |
| Observed owner/scope/lifecycle/label violations | 0 | 0 |

Quality metrics use one ranking per unique query; repeated trials measure timing and verify
stability, rather than tripling the apparent quality sample size. Recall@k is the fraction
of answerable queries containing their gold source in the first k results. MRR rewards earlier
first gold sources; nDCG discounts lower positions. The latency rows include all 312 queries,
including scoped and denied queries, across three trials per mode.

| Positive query cohort | Queries | Full-text recall@5 | Hybrid recall@5 | Full-text p50 | Hybrid p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Literal | 64 | 89.1% | **93.8%** | 12.3 ms | 510.7 ms |
| Paraphrase | 64 | 46.9% | **68.8%** | 16.2 ms | 516.8 ms |
| Conversational | 64 | 62.5% | **82.8%** | 25.6 ms | 527.2 ms |
| Scope-restricted paraphrase | 64 | 59.4% | **71.9%** | 9.3 ms | 79.7 ms |
| Authorized specialist | 14 | 28.6% | **50.0%** | 7.8 ms | 35.6 ms |

For the 192 unrestricted literal/paraphrase/conversational questions alone, recall@5 rose from
66.1% (127/192) to 81.8% (157/192), a 15.6-point gain. A paired bootstrap resampling the **64
scenarios**, keeping each scenario's three correlated questions together, gave a descriptive
95% percentile interval of **+9.9 to +21.4 points**, using 2,000 deterministic resamples. This
interval describes variation within these authored scenarios, not uncertainty over production
user traffic. Scope and specialist duplicates are excluded from that calculation.

All three trials returned identical source rankings. Hybrid supplied actual semantic ranks in
263 of the 312 query result sets; full-text supplied none. Not every query has an eligible
semantic match above the fixed threshold. The complete benchmark took 372.6 seconds, including
warm-cache probes and context composition. Both immediate cache probes hit on all 63 requests
per mode; this artificial repeat-hit rate is not an estimate of production cache reuse.

### Gains and regressions

The first three paraphrase gains in fixture order illustrate the improvement without selecting
only the largest rank changes:

| Query | Gold-source rank: full-text → hybrid |
| --- | --- |
| “How did we get smooth sound from the Workshop guest?” | 8 → **1** |
| “Which private connection should I use to reach Maple's shell away from home?” | Outside top 10 → **2** |
| “Can the money that protects me from job loss be counted toward closing?” | Outside top 10 → **2** |

Both regressions concern one scenario: “Which regular conversation made uncertainty at work
less intimidating?” The gold journal-transition source fell from rank 3 to rank 10, both
unrestricted and journal-scoped. Several generic reflection notes appeared in both candidate
lists and outranked the older target after fusion. This is a case to investigate with a separate
development set; it was left unchanged in the recorded comparison.

Neither mode returned empty results for any of the 24 missing-answer questions. Lexical OR
matching and semantic similarity can retrieve related records even when the requested fact
is absent. A nonempty retrieval result must therefore **not** serve as an answerability signal.
The two mixed-label specialist questions never exposed the forbidden gold source; one returned
other permitted, unrelated records and one returned none in both modes.

### Runtime and storage

The measured local model startup and real indexing path worked on CPU. Initial ingestion
computed 20,190 unique content embeddings; duplicate contents reused vectors. Inference plus
cache serialization took 92.6 seconds, and initial ingestion took 124.4 seconds. A subsequent
cached reseed applied the two pre-scoring query-label corrections without recomputing vectors.
These are batch-fixture timings, not a measured throughput guarantee for the single-item worker.

The recorded exact-vector plan materialized **12,192 eligible rows**, kept 444 above the cosine
threshold, and selected 80 with a top-N sort. It used the existing owner/status index to find
eligible rows and no ANN index. This standalone post-benchmark plan took **173.9 ms**, with no
shared-block reads or temporary spill. It is one warmed SQL snapshot, not a decomposition of
the 509 ms median complete call measured during the sustained comparison.

The MemoryRecord relation, including its indexes and TOAST storage, occupied **158 MB**; the
disposable database occupied **185 MB** after retrieval/audit writes and cached reseeding.
These include database overhead and churn, so they are not a per-memory storage projection.
Scope filtering materially reduced hybrid latency in this run. Exact scans and array-to-vector
casts warrant further profiling before larger or concurrent workloads; this result does not
establish that adding an ANN index would preserve the same authorization/recall behavior.

The context harness used the same 12,000 upper-bound budget with current query, scope and saved
evidence, without conversation history or structured application facts. Serialized context p50 /
p95 bounds were 3,629 / 3,773 for full-text and 3,631 / 3,789 for hybrid; maxima were 3,834 and
3,861. These are conservative UTF-8-byte token bounds, not model-tokenizer counts. The evidence
section has its own cap, so top-10 retrieval recall does not imply all ten records entered
context; post-composition gold recall and full conversational answer quality were not scored.

Keep vector retrieval opt-in pending a latency budget and a separate missing-evidence/answer
quality gate. The benchmark supports a recall benefit for this configuration and dataset; it
does not support an unconditional production rollout.

## Validation and limits

The live database/provider validation passed ten checks: actual normalized local embeddings;
pgvector cosine distance; returned semantic candidate ranks; model/version/dimension mismatch
exclusion; malformed query vector rejection; real durable-worker indexing; interrupted obsolete
job recovery without erasing a valid vector; endpoint outage fallback; disclosure-policy blocking;
and missing-extension fallback with immediate restoration in the isolated database.

Every returned result was checked against owner, source ID, status, effective date, expiry,
scope and sensitivity labels. Forbidden-domain specialist queries were required to return no
results. All context payloads were required to fit the same 12,000-byte/token upper bound.
Repeated trials were required to return identical source rankings. These are execution
assertions, not just aggregate quality scores.

Additional checks: **116 unit/regression tests passed**, including four new fixture/metric tests;
ESLint, TypeScript and version consistency passed. Existing production ranking behavior was
unchanged. The isolated database and local endpoint were stopped after evidence collection.

This dataset is substantially larger than the earlier five-question/600-distractor smoke test,
but remains **synthetic**. Its 20,000 backgrounds use recurring templates; its 270 positive
questions share 64 underlying scenarios and usually have one judged source each. It does not
establish real-user accuracy, multilingual performance, extraction/consolidation quality,
longitudinal reasoning or model-answer faithfulness. Precision@5 is capped at 0.2 under the
single-gold-source labels and should not be interpreted as exhaustive relevance judgment.

No answer-generating model was evaluated. Returning related memories for a missing-answer
question is a retrieval limitation, not proof that the assistant would hallucinate. Conversely,
source recall does not prove a correct answer. A separate grounded-answer/abstention evaluation
and a user-reviewed, consented corpus are required before claiming production answer quality.

## Reproduction and evidence

Follow the [pinned setup, commands and cleanup guide](../apps/web/scripts/memory-eval/README.md).
The runner refuses any database except the explicit disposable database and Unix socket path.
It writes complete intermediate results under `/tmp/jarvis-memory-vector-eval/results`.
Downloaded weights and embedding arrays remain outside the repository.

Committed evidence under [evaluations/memory-v2-2026-10-26](./evaluations/memory-v2-2026-10-26/)
contains aggregate results, every query/mode's source IDs and three timings, live validation,
model/environment identity, warm-cache measurements, SQL plan and tested source hashes.
