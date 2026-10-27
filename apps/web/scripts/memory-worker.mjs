// Bounded invocation only. Operator supplies env; no scheduler is installed or modified.
import { PrismaClient } from "@prisma/client";
import { runMemoryJob } from "../src/lib/memory/jobs.ts";
if (process.env.MEMORY_V2_ENABLED !== "true")
  throw new Error("Memory V2 is disabled.");
const db = new PrismaClient();
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
try {
  const jobs = await db.memoryJob.findMany({
    where: {
      OR: [
        { status: "queued", availableAt: { lte: new Date() } },
        { status: "running", leaseUntil: { lte: new Date() } },
      ],
    },
    select: { userId: true },
    orderBy: { availableAt: "asc" },
    take: 100,
  });
  let count = 0;
  for (const userId of new Set(jobs.map((j) => j.userId))) {
    for (let i = 0; i < 8 && count < 40 && !stopped; i++) {
      if (!(await runMemoryJob(db, userId))) break;
      count++;
    }
  }
  console.log(JSON.stringify({ processed: count }));
} catch {
  console.error(
    "Memory worker failed. Check migration state and protected configuration.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
