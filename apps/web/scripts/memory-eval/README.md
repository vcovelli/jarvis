# Isolated memory retrieval evaluation

This harness runs the application's real retrieval SQL, local HTTP embedding adapter,
indexing worker, source hydration, access policy, and context composer. It uses synthetic
personal-memory fixtures and never needs a production database, environment file, provider
key, or paid inference. See [the recorded report](../../../../docs/memory-retrieval-evaluation.md).

## Reproduce

Prerequisites: Docker, Python 3.11+, Node 22.15+, and public dependency downloads. Reserve
about 1 GB of temporary disk space and 2 GB of database RAM. These commands use a fixed,
strictly guarded disposable database name and socket path. An existing container with this
name causes setup to fail rather than being overwritten. Run from the repository root:

```bash
# Copy reviewed source, including untracked implementation files, without ignored .env/node_modules.
eval_root=/tmp/jarvis-memory-vector-eval
mkdir -p "$eval_root/source" "$eval_root/socket"
chmod 1777 "$eval_root/socket"
git ls-files --cached --others --exclude-standard -z | tar --null -T - -cf - | tar -xf - -C "$eval_root/source"
cd "$eval_root/source/apps/web"
npm ci
npm run prisma:generate

python3 -m venv "$eval_root/venv"
"$eval_root/venv/bin/pip" install -r scripts/memory-eval/requirements.lock.txt
"$eval_root/venv/bin/python" scripts/memory-eval/download-model.py --model-dir "$eval_root/model"
"$eval_root/venv/bin/python" scripts/memory-eval/local-embeddings.py \
  --model-dir "$eval_root/model" --threads 2 > "$eval_root/endpoint.log" 2>&1 &
embedding_pid=$!
# Wait for {"ready":true,...} in endpoint.log, then verify the pinned identity:
curl --fail http://127.0.0.1:3331/health

docker run --detach --name jarvis-memory-pgvector-eval \
  --label jarvis.test=memory-vector-eval --network none --cpus 2 --memory 2g --pids-limit 128 \
  --mount type=bind,src="$eval_root/socket",dst=/var/run/postgresql \
  --tmpfs /var/lib/postgresql/data:rw,size=2g --tmpfs /tmp:rw,size=64m \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=jarvis_memory_vector_eval \
  pgvector/pgvector@sha256:00ba258a66dac104fd5171074a0084462a64a1369d8513f3d0a634e2f24d15bc \
  postgres -c listen_addresses= -c unix_socket_permissions=0777 \
    -c shared_buffers=128MB -c max_connections=30
# Wait until this succeeds:
docker exec jarvis-memory-pgvector-eval pg_isready -U postgres -d jarvis_memory_vector_eval
export DATABASE_URL='postgresql://postgres@localhost/jarvis_memory_vector_eval?host=/tmp/jarvis-memory-vector-eval/socket&connection_limit=4'
export MEMORY_VECTOR_TEST_ISOLATED=1
npm run prisma:migrate:deploy
docker exec jarvis-memory-pgvector-eval psql -U postgres -d jarvis_memory_vector_eval -c 'CREATE EXTENSION vector'

npm run memory:eval -- seed
npm run memory:eval -- validate
npm run memory:eval -- compare
npm run memory:eval -- explain
# Optional: save compact source-level evidence to a reviewable directory.
python3 scripts/memory-eval/export-results.py \
  --source-root "$eval_root/source" --destination "$eval_root/export"
```

The database has no network interface or published port. Only the temporary Unix socket is
mounted; its trust authentication is appropriate only for this synthetic disposable fixture.
The endpoint binds literal loopback and loads checksum-verified files without remote model
code. Bulk ingestion accepts arrays of strings for speed; the actual application adapter and
worker tests send individual strings. The endpoint is an evaluation fixture, not a new
production service. Inference runs on CPU with two ONNX threads.

`seed` replaces only named synthetic evaluation users. Results and reusable synthetic vectors
stay under `/tmp/jarvis-memory-vector-eval/results`. `validate` temporarily drops and recreates
**this isolated database's** vector extension to test fallback. Do not run phases concurrently.
`compare` refuses a mismatched fixture fingerprint, checks every returned source and boundary,
clears both application caches before each scored request, alternates mode order, and repeats
each query three times. It fails if hybrid never supplies semantic candidates. It saves every
query's source IDs/ranks, relevance metrics, timings, conservative context size, and cache results.
`explain` records an actual `EXPLAIN (ANALYZE, BUFFERS)` plan and relation/database size.

## Cleanup

In the same shell, after collecting reports:

```bash
npm run memory:eval -- cleanup
kill "$embedding_pid"
wait "$embedding_pid" || true
docker stop jarvis-memory-pgvector-eval
docker rm jarvis-memory-pgvector-eval
```

The tmpfs database disappears when stopped. Model files, source/dependency copies and synthetic
result caches remain in the temporary directory for optional reuse; none belong in Git. The
committed report includes compact result artifacts, not model weights or embedding arrays.

## Dataset and interpretation

The frozen corpus lives in `src/lib/memory/evaluation/{scenarios,corpus}.ts`. It has 64 manually
written scenarios across eight personal-assistant domains, 20,000 generated background notes,
128 hard negatives and 384 tenant/lifecycle boundary records. Questions include exact terms,
paraphrases, conversational wording, scope restrictions, absent answers and specialist-agent
restrictions. Source-level relevance judgments are fixed before retrieval scoring. Two specialist
expectations were corrected during pre-scoring authorization review because the `work` label
restricts Workshop and employer references; their contents and retrieval settings stayed fixed.

This is a repeatable synthetic stress/quality evaluation. The backgrounds reuse templates, the
questions share 64 scenarios, and each positive question has one judged gold source. It does not
estimate production user-query accuracy, general corpus diversity, model-answer faithfulness,
multilingual quality, concurrency capacity, ANN behavior, or the quality of automatic extraction.
No model, threshold, rank-fusion or freshness setting is tuned to improve these recorded scores.


## V2.2 evidence and performance evaluation

After the isolated setup and `seed` above, from the disposable application source copy:

```bash
# Serial phases: concurrent index/build jobs would confound latency measurements.
npm run memory:eval:v22
node --experimental-strip-types scripts/memory-eval/profile-v22.mjs
node --experimental-strip-types scripts/memory-eval/indexes-v22.mjs
node --experimental-strip-types scripts/memory-eval/cache-v22.mjs
# After the complete three-trial run, export synthetic evidence and source hashes:
node --experimental-strip-types scripts/memory-eval/export-v22.mjs /tmp/jarvis-memory-vector-eval/v22-export
```

Use the same guarded `DATABASE_URL` with `connection_limit=1` for consistent profiling.
The comparison adds only the two named `memory-v22-supported` / `memory-v22-absent` synthetic
owners and replaces their previous fixture records on rerun. It compares frozen V2 retrieval
against V2.2 always/selective strategies; three trials are the default. `MEMORY_EVAL_REPEATS`
and `MEMORY_EVAL_V22_MODES` can restrict a development run. Do not relabel it as the full run.
The profile changes only its own disposable client's planner/JIT settings. Index experiments
create and remove `MemoryVectorBench`; no application table/index/migration is changed. The
cache experiment waits 31 seconds to test actual cache lifetimes. All results are under
`/tmp/jarvis-memory-vector-eval/v22`. See [the V2.2 report](../../../../docs/memory-engine-v2-2.md).

The comparison keeps query-level source IDs and phase timings, plus source precision,
answerability confusion counts and accepted-source correctness. All returned IDs are checked
against frozen owner, scope, source, sensitivity and lifecycle labels. The two specialist
mixed-label questions may return other authorized records; forbidden-domain questions must
return none. A nonempty result is never labeled proof of a supported answer.

The normal cleanup phase removes the original fixture owners. The two V2.2 owners disappear
with the tmpfs database when the isolated container is stopped/removed; no persistent database
or production owner is touched. Stop the loopback embedding process as described above.
