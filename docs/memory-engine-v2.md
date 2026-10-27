# Memory Engine V2

Implemented foundation, disabled by default. This document describes the source change,
not a deployment. PostgreSQL full-text and actual pgvector/local CPU embeddings are verified
in isolated databases. See the [expanded retrieval evaluation](./memory-retrieval-evaluation.md)
for quality, latency, and limitations. Hosted provider acceptance remains untested.

V2.2 adds conservative evidence filtering, deterministic insufficient-evidence responses and
measured retrieval improvements. See the [V2.2 implementation and acceptance report](./memory-engine-v2-2.md)
for updated behavior and remaining limits; the foundation verification below is historical.

## Architecture inventory and migration boundary

The inspected checkout was clean `main`, source version 17.13.0, commit `9f6d8437827e`.
This does not identify the deployed release. Existing Assistant code stores conversations,
messages, deterministic rolling summaries, mutable topic/project memories, and gateway
session references in PostgreSQL. It fetches 12 recent messages and 40 recently updated
memories, then filters the latter in JavaScript. This misses older relevant evidence.
Legacy automatic memory combines assistant output and user text and assigns unexplained
0.68/0.72 confidence values. A client-provided lifestyle snapshot enters the prompt.

Operations already supplies durable jobs, per-user locks, leases, retry limits, audit
records, cost reservations, and an exact approval boundary. V2 follows these patterns in
separate memory tables so extraction never inherits Operations execution privileges.
Operations remains unchanged except a regression assertion now counts decision alerts
separately from the existing executive/strategy briefing notifications.

V2 is enabled with `MEMORY_V2_ENABLED=true` after migration/backfill review. False preserves
the old memory/context path. The existing tables and gateway session keys are not rewritten.
Chat now validates ownership before appending messages and bounds same-origin JSON writes
in both modes. New V2 extraction is queued atomically with each user message; the old
summary-based automatic memory writer is bypassed in V2. Rolling conversation summaries
continue to be maintained, with their generated/unverified status made explicit in context.

## Storage and provenance

Additive migration: `20261026120000_memory_engine_v2/migration.sql`.

| Prisma model | Purpose |
| --- | --- |
| `MemoryRecord` | Versioned facts/events/procedures/temporary context/references, scopes, sensitivity labels, assertion class, confidence kind, importance, validity/expiry, lifecycle, content hash, model identity and embedding |
| `MemorySource` | Many source references per memory, source timestamps and reliability; composite foreign key enforces matching memory owner |
| `MemoryState` | Per-user revision and transactional lock for writes/cache invalidation |
| `MemoryJob` | Idempotent source-ID jobs, leases, attempts, backoff and sanitized failure codes |
| `MemoryCost` | Conservative per-attempt hosted cost reservations retained after failures |

The migration also creates a generated `tsvector` column, a partial GIN index, owner/scope
indexes, lifecycle/type/label/dimension constraints, and an owner-matching supersession
foreign key. Prisma intentionally does not model the generated full-text column. It is
owned by this SQL migration; do not replace migrations with `db push`.

User statements are assertions by the user, not statistical proof. V2 creates no calibrated
confidence scores. Imported automatic summaries are `unverified`, with null confidence.
A generated summary is never promoted to a verified application fact. Authoritative finance,
UserState, and Operations data remain in their existing tables. Memory jobs contain record
IDs, not copies of messages or credentials.

## Retrieval and authorization

All candidate SQL includes owner, allowed exact scopes, allowed sensitivity labels, active
status, effective time, validity, and expiry. Specialized agent grants additionally restrict
both domain lanes and required category labels. A Financial Analyst cannot retrieve journal
or health records, even when those records are in the finance lane. An Infrastructure Monitor
cannot retrieve finance records. Specialized agents do not automatically inherit `general`
or broad project memories. The normal Assistant API fixes agent identity server-side and
ignores any client agent/user/grant parameter. `verifiedRunAgent` validates a stored running
Operations job and current ADMIN/OWNER entitlement for future server callers. It is not
wired to a new autonomous agent, endpoint, or execution privilege.

Read grants and management grants are separate. Source inspection rechecks the underlying
record's ownership, including the conversation owner. Mutations reject foreign IDs.
`MemorySource` and supersession links also enforce owner matching at the database level.
Textual sensitivity detection only *adds* restrictions; it cannot grant a specialized agent
access to an unauthorized lane. It is conservative, imperfect classification, not a DLP
system. Keep uncertain private content out of hosted provider policies.

Full-text search uses English stemming with a bounded OR query of meaningful terms, up to
80 matches, across the whole eligible collection. It is not restricted to the newest 40.
Optional pgvector search returns up to 80 compatible matches with cosine distance below
0.6; a materialized eligible CTE applies authorization and exact model/version/dimension
checks before distance evaluation. It uses exact search over stored numeric arrays cast
to vectors. No ANN index is introduced without measurements. Returned candidates use
reciprocal rank fusion, `1/(60+rank)` per lexical/semantic list, with small documented
importance, source-class, freshness and scope bonuses. Ties use memory ID. Similarity is
relevance evidence, not factual confidence. Queries without any lexical or semantic candidates
return no memories; a missing answer can still retrieve related but insufficient evidence.
Retrieval alone does not establish answerability.

Results carry IDs, excerpts, sources, scope, source dates, conflict markers, confidence kind,
rank components, and conservative token estimates. Default k=8, maximum k=20. Search statements
have a 1.5-second PostgreSQL timeout. Vector failures fall back to text. A failed core database
query is a visible service failure, not fabricated evidence. Temporal phrasing such as “last
month” currently influences text relevance but is **not** a calendar-range constraint. Source
dates are provided so the model must qualify the time range. General semantic paraphrase recall
without a configured local embedding provider is limited to lexical matching.

Cache entries contain only result IDs/ranks (128 entries, 30-second TTL). Keys include user,
agent, grants, scopes, revision, query, limit and vector identity. Every hit rechecks visibility,
ownership and expiry and reloads current content. Revisions change transactionally on memory
writes and indexing. Local query vectors use a separate 64-entry/60-second cache under the
same access identity. No Redis, cross-user cache, or decrypted-credential cache is added.

## Extraction, consolidation, jobs and cost

Rules accept only explicit user preferences, goals, decisions, completion statements,
corrections, and selected troubleshooting outcomes. At most four candidates per message;
ordinary chat and questions are not automatically saved. Assistant messages are never inputs.
There is no model-based extraction implementation in this release. Candidate schema checks
bound text, type, importance and scope. Common credential/private-key/account identifier
patterns reject the whole candidate. Rejection cannot guarantee detection of every secret.

Exact normalized content duplicates retain additional source references. Stable fact keys
identify narrow cases, including the duplex purchase example. Explicit corrections supersede
matching prior facts, preserve their content/evidence and point to the replacement. Ambiguous
changes become conflicts; the user can confirm a correction in the drawer. Historical imports
cannot revive a plan after a newer recognized correction. This is conservative rule-based
consolidation, not general natural-language contradiction resolution or arbitrary fact merging.

The worker supports extraction, legacy import and embedding/reindex jobs. Consolidation runs
transactionally inside extraction/import. Workers claim under the user lock, allow one live job per owner, use a 30-second
lease and a unique lease token, retry at most three times with exponential backoff, and fence
late completions. Each invocation processes at most 40 jobs, at most eight for one user.
Queued/running backlog is limited to 1,000 per user; full queues emit metadata-only audits.
Unqueued historical messages can be recovered by a later backfill. No daemon, cron entry,
public cron endpoint, service restart, or shell-execution capability is installed.

Embedding providers are disabled by default. Both `local` and `hosted` adapters use an
operator-configured `{model,input}` to `{data:[{embedding}]}` HTTP endpoint. Local endpoints
must use literal loopback addresses; hosted endpoints require HTTPS. Requests disable redirects,
limit response bodies to 256 KiB, use a five-second timeout and validate finite nonzero vectors.
Obsolete model jobs leave newer embeddings intact. Identity includes provider kind/model, explicit version and dimension (1–4096). Different
identities are never compared. Reindex with a new version after model or endpoint changes.

Every private category requires explicit `MEMORY_EMBEDDING_ALLOWED_LABELS`. An API key alone
enables nothing. Hosted jobs additionally require a positive price assumption and per-user
UTC daily cap, and each request must reserve at most $0.05. Reservations use UTF-8 bytes as a
conservative token upper bound, remain charged to the cap on failure/crash, and are estimates,
not invoices. Verify provider accounting before activation. Exhausted/budget-blocked jobs do
not restart automatically. Review them before creating a new indexing version. No model
extraction, chat-inference accounting, or global multi-user spending budget is added.

Chat performs no hosted query-embedding requests. When vector mode and a permitted local
provider are explicitly enabled, query embedding has an 800 ms response-path budget (underlying
HTTP request still terminates within five seconds); failures return text retrieval. All accessible
categories must be permitted for this query disclosure. Server callers may also supply a validated
query vector. Embedding jobs continue independently of chat availability.

## Context and OpenClaw ownership

Jarvis owns conversation storage, summaries, saved memory, provenance, lifecycle and retrieval.
OpenClaw remains the existing inference/execution backend. Its `chat.send` protocol uses a
session key, message subscription and streaming events; the repository does not establish a
stateless call or gateway-history deletion API. Actual gateway retention/global agent memory
configuration was **not** inspected or changed. The existing operator scopes and tool privileges
are untouched. No claim is made that a prompt overrides gateway permissions.

V2 supplies bounded JSON reference sections after a fixed policy preamble. Priorities are:
current request, authenticated scope, relevant structured facts, selected memory, explicitly
unverified summary, and necessary recent messages. Each section has a fixed cap and the entire
serialized payload is bounded. UTF-8 byte length is used as a conservative token upper bound,
not a provider tokenizer prediction. A custom budget must leave output/headroom within the
chosen provider's input window. Long current requests can be deterministically truncated; this
is recorded in the private context audit. The current message is excluded from recent history.

`MEMORY_CONTEXT_ALLOWED_LABELS` is separate from embedding disclosure. Empty means no saved
context is sent to the existing OpenClaw backend. Mixed conversation summaries/transcripts are
included only when *all* categories are explicitly permitted; they cannot be reliably split by
sensitivity. Existing current user requests still follow the interactive Assistant backend path.
V2 intent parsing is deterministic and does not implicitly send the client snapshot to OpenAI.
Live action lookup uses saved server UserState; unsynced device changes may need syncing first.
Demo mode remains explicitly labeled and uses the existing demonstration behavior.

Each V2 turn receives a fresh gateway session namespace, retaining continuity through selected
Jarvis evidence and recent history. This avoids replay of previous injected context or deleted
memories from a reused gateway session. Legacy persisted session keys remain intact. Increasing
`MEMORY_SESSION_EPOCH`, changing the backend model, or changing provider configuration requires
no memory rewrite; each subsequent turn is already fresh. There is no automatic deletion of
old gateway sessions. Operator gateway-retention cleanup is separate. V2 deletion stops future
Jarvis retrieval; it cannot retract data already sent to a provider, backups or legacy sessions.

Finance arithmetic still uses existing deterministic analytics; historical goal/decision questions
can reach memory instead of being consumed by the finance shortcut. Structured context can request
finance aggregates, saved task excerpts, descriptive sleep means with date ranges, or recent
Operations infrastructure metrics. It selects only requested state fields and fixed safe metrics.
Absent infrastructure observations older than 15 minutes are reported unavailable. Existing direct
status requests still use fresh telemetry. Habit/sleep correlation, promotion before/after analysis,
investment performance reconstruction and longitudinal causal inference are not implemented.
The context explicitly reports these limitations instead of inventing trends.

Prompt data remains untrusted even inside JSON. Schema boundaries and source IDs reduce ambiguity;
they do not prove model prompt-injection immunity. Authorization and write/tool permissions must
remain enforced outside inference. The existing structured-action confirmation UI is retained.

## User controls, diagnostics and retention

Assistant → Settings → Manage memory uses the existing drawer. V2 adds scope-aware paginated
search (50 rows/page), source inspection, facts/events/procedure labels, assertion provenance,
conflict review, explicit correction history and confirmed deletion. Earlier versions are optional.
No onboarding or unrelated UI redesign is added.

Deletion creates a tombstone, removes its content and embedding, cancels queued/running indexing,
and invalidates retrieval. Source IDs and a normalized content hash remain to prevent backfill
resurrection and preserve auditability. Original conversations/application records are not deleted.
This is not a complete account-data erasure operation. Working records expire after seven days;
all records support expiry/validity, but there is no automatic physical purge scheduler. Operators
must review database/backups/audit/job retention before extended use. Storage is server-side,
not end-to-end encrypted. Access and provider adapters are centralized for future encryption work;
per-user/client-controlled encryption is not implemented.

`GET /api/assistant/memory/diagnostics` requires current ADMIN/OWNER authorization and reports only
that actor's data: counts/types/statuses, embedding coverage, pending/failed jobs, duplicate audits,
reserved cost estimates, and the latest 100 retrieval/context metadata records with IDs/ranks,
cache-hit rate, latency and context estimates. It exposes no memory content or query text. Ordinary
memory APIs use session ownership, rate limiting, same-origin JSON writes and no-store responses.
Audits are transactionally required for mutations and recorded before sensitive reads return.
The shared Prisma logger now emits a fixed failure code instead of formatted errors that can
include private query arguments. New memory jobs/API error handling excludes private content, queries
and provider response bodies from general logs.
There are no public user-ID metrics. Evaluation results are generated by the isolated test suite,
not fabricated as live diagnostics or model-answer quality scores.

## Configuration

All new settings are in `apps/web/.env.example`; no production env files are modified.

| Variable | Default / purpose |
| --- | --- |
| `MEMORY_V2_ENABLED` | `false`; compatibility switch |
| `MEMORY_CONTEXT_ALLOWED_LABELS` | Empty; explicit disclosure to existing OpenClaw backend |
| `MEMORY_CONTEXT_TOKEN_BUDGET` | `12000`; conservative full serialized input bound, clamped to 2048–64000 |
| `MEMORY_SESSION_EPOCH` | `1`; gateway namespace generation |
| `MEMORY_VECTOR_ENABLED` | `false`; optional pgvector query path |
| `MEMORY_EMBEDDING_PROVIDER` | `disabled`, `local`, or `hosted` |
| `MEMORY_EMBEDDING_URL`, `MEMORY_EMBEDDING_KEY` | Explicit endpoint and optional server-side credential |
| `MEMORY_EMBEDDING_MODEL`, `MEMORY_EMBEDDING_VERSION`, `MEMORY_EMBEDDING_DIMENSION` | Required explicit embedding identity |
| `MEMORY_EMBEDDING_ALLOWED_LABELS` | Empty; no category may be disclosed |
| `MEMORY_EMBEDDING_USD_PER_MILLION`, `MEMORY_EMBEDDING_DAILY_USD` | Explicit positive hosted price/cap; no hosted spending by default |

Labels: `private,finance,health,journal,infrastructure,work`. Every label attached to a record
must be allowed. Specialized agent grants remain an additional restriction.

## Backfill, deployment and rollback

Do not execute production activation as part of source development. Obtain operator approval
for migration, deployment, scheduler, extension and provider-spending changes separately.

1. Review the source and current production backup/restore evidence. Prepare a separate release
   checkout; never build over a running app's `.next`. Preserve ignored configuration.
2. With V2/provider/vector flags off, generate Prisma Client and apply the additive migration using
   the established approved deployment procedure. There is no reset/truncate/extension install.
3. Preview and enqueue bounded backfill for one explicit owner. CLI defaults to dry-run and never
   silently loads another checkout's environment. From `apps/web`, with approved env supplied:

   ```bash
   npm run memory:backfill -- --user USER_ID --kind legacy --batch 100 --dry-run
   npm run memory:backfill -- --user USER_ID --kind legacy --batch 100 --apply
   # Repeat with --after the reported nextCursor until possiblyMore is false.
   npm run memory:backfill -- --user USER_ID --kind extract --batch 100 --apply
   ```

   `legacy` preserves old saved-memory provenance; `extract` examines only user messages. Jobs
   dedupe by owner/kind/source/version. Progress and failures report the last safe cursor; replay
   is safe. Backlog saturation stops before advancing past unqueued work. Repeat a full scan later
   for records created during an earlier scan. A dry-run counts eligible source rows, not the number
   of durable facts extraction will produce. No source rows are mutated by the backfill CLI.
4. Set V2 in the worker environment and invoke `npm run memory:worker` manually in bounded batches.
   Inspect diagnostics and conflicts, then enable V2 in the reviewed app release. Select context
   disclosure categories deliberately. Test existing conversation reads, saves, corrections,
   deletion, action confirmations, and streaming with the actual configured gateway.
5. Only after separate approval add a bounded memory-worker invocation to the existing scheduler.
   No scheduler command is installed by this code. Keep embeddings disabled initially.
6. Optional embeddings: review local model quality or hosted disclosure/price policy, configure
   an identity, then `npm run memory:backfill -- --user USER_ID --kind embed --batch 100 --apply`.
   Change the explicit version when model weights/endpoint semantics change, then repeat. Failed
   requests keep cost reservations and their attempts; do not reset rows to bypass budget controls.
7. Optional vector mode requires an operator-installed compatible pgvector extension. Check:

   ```sql
   SELECT name, default_version, installed_version
   FROM pg_available_extensions WHERE name = 'vector';
   SELECT extversion FROM pg_extension WHERE extname = 'vector';
   ```

   These are read-only checks. Review [pgvector installation and model-dimension guidance](https://github.com/pgvector/pgvector)
   and perform isolated semantic retrieval acceptance before production activation. The migration
   intentionally contains no `CREATE EXTENSION`. Full-text indexing follows PostgreSQL's
   [generated-column guidance](https://www.postgresql.org/docs/16/textsearch-tables.html) and
   [GIN guidance](https://www.postgresql.org/docs/16/textsearch-indexes.html).

Rollback: disable the V2 worker invocation, set `MEMORY_V2_ENABLED=false`, and return to the prior
compatible app release via the existing deployment workflow. Keep additive tables and audit data;
never run a destructive down migration. Conversations, summaries, messages and original session
keys remain usable. V2-only corrections/deletions are **not** projected back into legacy memory;
legacy context may contain an earlier fact or previously disclosed data. Review that privacy tradeoff
before rollback. Prefer disabling the gateway temporarily if withdrawn data must not be reused.
Restoring V2 restores its saved corrections/tombstones. No automatic data deletion or backfill runs.

## Verification and scaling

Commands and recorded results are below. Tests require no paid APIs. The memory integration suite
refuses any database except `jarvis_memory_test` on `/tmp/jarvis-memory-v2-db/socket` with
`MEMORY_TEST_ISOLATED=1`. A fresh PostgreSQL 16 cluster and independent dependency/client/build
copy under `/tmp/jarvis-memory-v2-verify` were used. No production database was connected.

```bash
npm run prisma:generate
# prisma validate, then prisma migrate deploy against the isolated database only
npm run test:memory
MEMORY_TEST_ISOLATED=1 npm run test:memory:integration
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm run version:check
OPERATIONS_TEST_ISOLATED=1 npm run test:operations:integration
# Isolated loopback preview at 127.0.0.1:3329, explicit test env, optional installed Playwright:
MEMORY_TEST_ISOLATED=1 MEMORY_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs npm run test:memory:http
```

The database suite covers old recall with 600 recent distractors, expected source IDs, exact scopes,
multi-user and specialized-agent restrictions, correction/supersession, contradictions, duplicate
provenance, deleted and expired exclusions, revision caching, absent evidence, out-of-order backfill,
interrupted/late/concurrent jobs, outage retries, hosted disclosure and conservative reservations,
legacy-summary labeling, source tampering, selective structured data, and vector absence/mismatch
fallback. Unit tests cover validation, malformed provider responses, identities, cache expiry,
serialized context budgets and injection strings remaining data. A mocked gateway verifies the
existing accepted/delta/final streaming protocol and exclusion of another run's events. It makes no
claim about live gateway tool policy or model compliance.

The foundation verification table below preserves the original five-question smoke benchmark.
The follow-up [pgvector/local embedding evaluation](./memory-retrieval-evaluation.md) uses
20,576 synthetic memories and 312 questions, comparing full-text against hybrid retrieval
through the actual application path. Neither evaluation measures model-answer accuracy.
Latency varies with host load.

For small single-host installations, start with PostgreSQL full-text and the existing CPU. Medium
collections should monitor private query latency, queue age and cache hit rates before enabling
embeddings. Large collections should measure filtered exact-vector scans, retention growth and
index plans before adding model-specific partial vector indexes or partitions. No GPU, Redis,
dedicated vector database, Kubernetes or new orchestration system is required. Local embedding
acceleration is optional and hardware should follow measured model/latency needs.

Next phase: use the expanded evaluation to review recall regressions and missing-evidence
behavior; validate gateway retention/tool policy in isolation; expand date-aware retrieval and conservative fact schemas with stronger
fixtures; design opt-in model extraction and data-erasure workflows; then add structured longitudinal
analytics backed by explicit date ranges and sufficient data. Do not enable autonomous execution
or new provider disclosure as a side effect of this foundation.

## Foundation verification — 2026-10-26

| Check | Result |
| --- | --- |
| Prisma schema validation and client generation | Passed in isolated source copy |
| Fresh PostgreSQL 16 migration | All nine migrations applied, including V2 |
| Existing-data migration | Separate pre-V2 database seeded before migration; owner, conversation, message, summary, legacy memory/confidence and session key preserved |
| Full unit/regression suite | 112 passed, including 15 memory/streaming tests |
| Memory database/evaluation/CLI suite | 19 passed |
| Existing Operations PostgreSQL regressions | 17 passed; stale briefing-count assertion corrected |
| Memory HTTP + Chromium acceptance | 33 assertions passed; 390×844 and 1440×1000; save, correction, search, deletion, ownership, diagnostics and source access |
| OpenClaw streaming | Mocked transport plus real HTTP/SSE through a loopback mock gateway; delta/final events, server evidence, excluded forged client state, distinct V2 sessions and preserved legacy keys |
| ESLint, independent TypeScript check | Passed |
| Production Next.js build | Passed in `/tmp/jarvis-memory-v2-verify`, never over live output |
| Version/release consistency | Passed at unchanged source version 17.13.0; no release/tag created |
| `git diff --check` | Passed |
| pgvector availability | Original host-native cluster lacked the extension. The subsequent disposable PostgreSQL 16.14/pgvector 0.8.2 validation passed; see the expanded report. |

Latest retrieval smoke evaluation: **recall@5 = 1.0 (5/5)** with 600 newer unrelated records.
Measured cold query latencies were **11, 6, 6, 5, 5 ms** (median 6 ms) on this host. Serialized
context upper bounds were **1205, 1077, 1115, 1080, 1065** tokens/UTF-8 bytes. Earlier runs were
2–8 ms; these numbers are not a production latency guarantee. This is retrieval evaluation only.
Provider transport, billing and model-answer accuracy were not tested with paid APIs.

The build retained the existing non-blocking `baseline-browser-mapping` freshness warning.
No runtime dependencies were added, no production schema/extension/backfill was changed, and no
PM2/systemd service, production scheduler, secret, deployed app, or gateway privilege was modified.
Test users were removed and the temporary preview/mock gateway and test database servers were stopped.

Reproducing the database suite requires PostgreSQL binaries, Node 22.15+, and a disposable cluster
initialized by an unprivileged user. Set only synthetic configuration, never source a production `.env`:

```bash
mkdir -p /tmp/jarvis-memory-v2-db/socket
/usr/lib/postgresql/16/bin/initdb -D /tmp/jarvis-memory-v2-db/data -A trust --no-locale -E UTF8
/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/jarvis-memory-v2-db/data -l /tmp/jarvis-memory-v2-db/server.log \
  -o "-k /tmp/jarvis-memory-v2-db/socket -h '' -p 55439" start
/usr/lib/postgresql/16/bin/createdb -h /tmp/jarvis-memory-v2-db/socket -p 55439 jarvis_memory_test
export DATABASE_URL='postgresql://YOUR_OS_USER@localhost:55439/jarvis_memory_test?host=/tmp/jarvis-memory-v2-db/socket'
# From a separate source/dependency copy with no production .env:
npm run prisma:migrate:deploy
MEMORY_TEST_ISOLATED=1 npm run test:memory:integration
```

Use the same isolated database for HTTP tests, an unprivileged preview at `127.0.0.1:3329`,
`MEMORY_V2_ENABLED=true`, `MEMORY_CONTEXT_ALLOWED_LABELS=private,infrastructure`,
`MEMORY_EMBEDDING_PROVIDER=disabled`, empty `OPENAI_API_KEY`, a synthetic `NEXTAUTH_SECRET`,
`NEXTAUTH_URL=http://127.0.0.1:3329`, and `OPENCLAW_GATEWAY_URL=ws://127.0.0.1:3330`.
Point `OPENCLAW_CONFIG_PATH`/`OPENCLAW_DEVICE_IDENTITY_PATH` to nonexistent fixture paths and
set `OPENCLAW_GATEWAY_TOKEN` to a synthetic string. The HTTP script starts/stops its own mock
gateway on port 3330. Stop the preview and disposable database when finished; never stop a
process identified only by a generic name or assume another checkout's database is disposable.

## Exact changed-file inventory

Paths are relative to the repository root. Files not previously tracked are included.


- `apps/web/.env.example`
- `apps/web/package.json`
- `apps/web/prisma/migrations/20261026120000_memory_engine_v2/migration.sql`
- `apps/web/prisma/schema.prisma`
- `apps/web/scripts/memory-backfill.mjs`
- `apps/web/scripts/memory-worker.mjs`
- `apps/web/scripts/test-memory-http.mjs`
- `apps/web/src/app/api/assistant/intent/route.ts`
- `apps/web/src/app/api/assistant/memory/diagnostics/route.ts`
- `apps/web/src/app/api/assistant/memory/route.ts`
- `apps/web/src/app/api/assistant/memory/source/route.ts`
- `apps/web/src/app/api/assistant/message/route.ts`
- `apps/web/src/app/v2/assistant/page.tsx`
- `apps/web/src/components/assistant/MemoryManager.tsx`
- `apps/web/src/lib/assistant/conversations.ts`
- `apps/web/src/lib/assistant/serverIntent.ts`
- `apps/web/src/lib/memory/assistant.ts`
- `apps/web/src/lib/memory/context.ts`
- `apps/web/src/lib/memory/embedding.ts`
- `apps/web/src/lib/memory/http.ts`
- `apps/web/src/lib/memory/integration.test.ts`
- `apps/web/src/lib/memory/jobs.ts`
- `apps/web/src/lib/memory/memory.test.ts`
- `apps/web/src/lib/memory/policy.ts`
- `apps/web/src/lib/memory/retrieval.ts`
- `apps/web/src/lib/memory/store.ts`
- `apps/web/src/lib/memory/streaming.test.ts`
- `apps/web/src/lib/memory/structured.ts`
- `apps/web/src/lib/operations/integration.test.ts`
- `apps/web/src/lib/prisma.ts`
- `docs/README.md`
- `docs/memory-engine-v2.md`
