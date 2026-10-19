// Run from the existing host scheduler; no HTTP listener, model calls, or shell tools.
// Node 22.15+: node --experimental-strip-types scripts/operations-worker.mjs
import { PrismaClient } from "@prisma/client";
import {
  eligible,
  scheduleDue,
  runNext,
} from "../src/lib/operations/engine.ts";
const db = new PrismaClient();
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
try {
  const profiles = await db.operationsProfile.findMany({
    where: { enabled: true, paused: false },
    select: { userId: true },
    take: 100,
  });
  for (const { userId } of profiles) {
    if (stop || !(await eligible(db, userId))) continue;
    await scheduleDue(db, userId);
    for (let i = 0; i < 8 && !stop; i++)
      if (!(await runNext(db, userId))) break;
  }
} catch {
  console.error(
    "Operations worker failed; check database connectivity and migration state.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
