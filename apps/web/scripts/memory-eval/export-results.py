"""Export compact, synthetic-only benchmark evidence; omit downloaded models and vectors."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--results", type=Path, default=Path("/tmp/jarvis-memory-vector-eval/results"))
parser.add_argument("--destination", type=Path, required=True)
parser.add_argument("--source-root", type=Path, required=True)
args = parser.parse_args()
args.destination.mkdir(parents=True, exist_ok=True)


def read(name):
    return json.loads((args.results / (name + ".json")).read_text())


def write(name, value):
    (args.destination / (name + ".json")).write_text(json.dumps(value, indent=2) + "\n")


summary, seed, rows = read("summary"), read("seed"), read("per-query")
assert summary["fingerprint"] == seed["fingerprint"]
assert len(rows) == summary["queries"] * 2
assert summary["leaks"] == 0
# Each changed ranking is also represented in the complete query CSV below.
write("summary", {key: value for key, value in summary.items() if key != "changes"})
for name in ["seed", "validation", "warm-cache"]:
    write(name, read(name))
# EXPLAIN contains a query-vector literal. Preserve the plan and timings, omit its numbers.
plan = read("query-plan")
plan = json.loads(re.sub(r"'\[[^\]]+\]'::vector", "'<384-dimensional query vector omitted>'::vector", json.dumps(plan)))
plan["exportNote"] = "Only query-vector literals omitted; plan shape and measured counters unchanged."
write("query-plan", plan)
columns = ["query_id", "mode", "cohort", "expected_sources", "returned_sources", "recall_at_1",
           "recall_at_5", "recall_at_10", "mrr", "ndcg_at_10", "precision_at_5", "empty",
           "trial_1_ms", "trial_2_ms", "trial_3_ms", "context_token_upper_bound", "semantic_results"]
with (args.destination / "per-query.csv").open("w", newline="") as stream:
    writer = csv.writer(stream)
    writer.writerow(columns)
    for row in rows:
        metrics = row["quality"]
        writer.writerow([row["id"], row["mode"], row["cohort"], "|".join(row["expectedSourceIds"]),
                         "|".join(row["returnedSourceIds"]), metrics["recallAt1"], metrics["recallAt5"],
                         metrics["recallAt10"], metrics["mrr"], metrics["ndcgAt10"], metrics["precisionAt5"],
                         metrics["empty"], *row["timings"], row["contextTokens"], row["semanticCount"]])
paths = list((args.source_root / "apps/web/src/lib/memory").rglob("*.ts"))
paths += list((args.source_root / "apps/web/scripts/memory-eval").glob("*"))
paths += [args.source_root / "apps/web/prisma/schema.prisma",
          args.source_root / "apps/web/prisma/migrations/20261026120000_memory_engine_v2/migration.sql"]
write("source-hashes", {str(path.relative_to(args.source_root)): hashlib.sha256(path.read_bytes()).hexdigest()
                        for path in sorted(paths) if path.is_file()})
print(json.dumps({"destination": str(args.destination), "queries": summary["queries"],
                  "rows": len(rows), "fingerprint": summary["fingerprint"]}))
