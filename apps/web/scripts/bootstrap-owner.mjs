import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "./load-env.mjs";
loadLocalEnv();
const userId = process.argv.find((arg) => arg.startsWith("--user-id="))?.slice(10).trim();
if (!userId) throw new Error("Provide --user-id=<existing account ID>. No account is created by this command.");
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(74192026)`;
    const existing = await tx.entitlement.count({ where: { tier: "OWNER" } });
    if (existing) throw new Error("An owner already exists. Use Admin to assign additional owners.");
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, rolloutLevel: true, entitlement: { select: { tier: true } } } });
    if (!user) throw new Error("Account not found. Check the exact user ID.");
    await tx.entitlement.upsert({ where: { userId }, create: { userId, tier: "OWNER", status: "active" }, update: { tier: "OWNER", status: "active", expiresAt: null } });
    await tx.auditLog.create({ data: { action: "admin.owner_bootstrapped", outcome: "success", metadata: { actor: "server-operator", targetUserId: userId, previous: { tier: user.entitlement?.tier ?? "INVITED", rolloutLevel: user.rolloutLevel }, next: { tier: "OWNER", rolloutLevel: user.rolloutLevel } } } });
  });
  console.log("Owner assigned. Sign in to Jarvis and open Admin. Your current rollout is unchanged; adjust it in Admin.");
} finally { await prisma.$disconnect(); }
