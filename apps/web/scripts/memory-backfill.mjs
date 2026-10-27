import { PrismaClient } from "@prisma/client";
import { enqueue, lockMemory } from "../src/lib/memory/store.ts";
import { embeddingProvider } from "../src/lib/memory/embedding.ts";
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const userId = option("--user", "");
const kind = option("--kind", "legacy");
const after = option("--after", "");
const size = Number(option("--batch", "100"));
const apply = args.includes("--apply");
if (apply && args.includes("--dry-run"))
  throw new Error("Choose --apply or --dry-run, not both.");
if (args.includes("--retry-failed"))
  throw new Error(
    "Exhausted jobs require operator review; automatic retry resets are not supported.",
  );
if (
  !userId ||
  !["legacy", "extract", "embed"].includes(kind) ||
  !Number.isInteger(size) ||
  size < 1 ||
  size > 200
)
  throw new Error(
    "Use --user ID --kind legacy|extract|embed [--batch 1..200] [--after ID] [--apply]. Dry-run is the default.",
  );
const db = new PrismaClient();
let queued = 0,
  cursor = after;
try {
  const where = { userId, ...(after ? { id: { gt: after } } : {}) };
  const rows =
    kind === "legacy"
      ? await db.assistantMemory.findMany({
          where,
          orderBy: { id: "asc" },
          take: size,
          select: { id: true },
        })
      : kind === "extract"
        ? await db.assistantMessage.findMany({
            where: { ...where, role: "user", conversation: { userId } },
            orderBy: { id: "asc" },
            take: size,
            select: { id: true },
          })
        : await db.memoryRecord.findMany({
            where: { ...where, status: "active" },
            orderBy: { id: "asc" },
            take: size,
            select: { id: true },
          });
  let version = "v2";
  if (kind === "embed") {
    const p = embeddingProvider();
    if (!p)
      throw new Error("Configure an embedding provider before reindexing.");
    version = `${p.model}:${p.version}:${p.dimension}`;
  }
  for (const row of rows) {
    if (apply) {
      const result = await db.$transaction(async (tx) => {
        await lockMemory(tx, userId);
        return enqueue(tx, userId, kind, row.id, version);
      });
      if (!result) break; // Do not advance past an unqueued row when the backlog is full.
      queued++;
    }
    cursor = row.id;
    if (apply && queued % 20 === 0)
      console.log(
        JSON.stringify({ progress: true, queued, nextCursor: cursor }),
      );
  }
  console.log(
    JSON.stringify({
      dryRun: !apply,
      kind,
      scanned: rows.length,
      queued,
      nextCursor: cursor,
      possiblyMore: rows.length === size || (apply && queued < rows.length),
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      error: "backfill_failed",
      queued,
      nextCursor: cursor,
      recovery:
        "Check protected configuration, then resume from this cursor. Re-execution is safe.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
