import "server-only";
import { getCoreConfigChecks } from "@/lib/env";
import { prisma } from "@/lib/prisma";
export function getAppHealth() { return { status: "ok", service: "jarvis-web", timestamp: new Date().toISOString() }; }
export async function getReadiness() {
  const config = getCoreConfigChecks();
  let database = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms'");
      await tx.$queryRaw`SELECT 1`;
    }, { maxWait: 3000, timeout: 4000 });
    database = true;
  } catch { database = false; }
  const checks = { configuration: Object.values(config).every((check) => !check.required || check.ok), database };
  return { status: Object.values(checks).every(Boolean) ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() };
}
