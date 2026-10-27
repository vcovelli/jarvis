import { PrismaClient } from "@prisma/client";

function createClient() {
  // Prisma's formatted error text can include query arguments (including private memory).
  const client = new PrismaClient({ log: [{ emit: "event", level: "error" }] });
  client.$on("error", () => console.error("[database] operation_failed"));
  return client;
}
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };
export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
