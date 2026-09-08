import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveEntitlement, isConfiguredAdmin } from "@/lib/entitlements";
import { AdminError, administrativeAudit, assertUserChange, canManageUsers, parseUserChange, presentUser } from "./policy";

export const adminUserSelect = {
  id: true, name: true, email: true, emailVerified: true, createdAt: true,
  lastActiveAt: true, rolloutLevel: true,
  entitlement: { select: { tier: true, status: true, expiresAt: true } },
} as const;
export async function getAdminUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: adminUserSelect });
  if (!user) throw new AdminError(404, "User not found.");
  return presentUser(user, effectiveEntitlement(user.entitlement, user.email), isConfiguredAdmin(user.email) && user.entitlement?.tier !== "OWNER");
}
export async function listAdminUsers(query = "", page = 1) {
  const q = query.trim().slice(0, 120);
  const where = q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }, { id: q }] } : {};
  const safePage = Math.max(1, Math.min(10000, Math.floor(page) || 1));
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, select: adminUserSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 30, skip: (safePage - 1) * 30 }),
    prisma.user.count({ where }),
  ]);
  return { users: users.map((user) => presentUser(user, effectiveEntitlement(user.entitlement, user.email), isConfiguredAdmin(user.email) && user.entitlement?.tier !== "OWNER")), total, page: safePage, pages: Math.max(1, Math.ceil(total / 30)) };
}
export async function changeAdminUser(actorId: string, targetId: string, body: unknown) {
  const change = parseUserChange(body);
  return prisma.$transaction(async (tx) => {
    // Shared with owner bootstrap and account deletion. Serializes concurrent privilege changes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(74192026)`;
    const actorRecord = await tx.user.findUnique({ where: { id: actorId }, select: adminUserSelect });
    const actor = actorRecord ? { id: actorId, entitlement: effectiveEntitlement(actorRecord.entitlement, actorRecord.email) } : null;
    if (!canManageUsers(actor)) throw new AdminError(actor ? 403 : 401, "Owner access required.");
    const target = await tx.user.findUnique({ where: { id: targetId }, select: adminUserSelect });
    if (!target) throw new AdminError(404, "User not found.");
    const entitlement = effectiveEntitlement(target.entitlement, target.email);
    const ownerCount = await tx.entitlement.count({ where: { tier: "OWNER", status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    assertUserChange(actor, { id: targetId, entitlement, configuredAdmin: isConfiguredAdmin(target.email) && target.entitlement?.tier !== "OWNER" }, change, ownerCount);
    const previous = { tier: String(entitlement.tier), rolloutLevel: target.rolloutLevel };
    const next = { tier: change.tier ?? previous.tier, rolloutLevel: change.rolloutLevel ?? previous.rolloutLevel };
    if (previous.tier === next.tier && previous.rolloutLevel === next.rolloutLevel) return { ok: true, changed: false };
    if (change.rolloutLevel) await tx.user.update({ where: { id: targetId }, data: { rolloutLevel: change.rolloutLevel } });
    if (change.tier) await tx.entitlement.upsert({ where: { userId: targetId }, create: { userId: targetId, tier: change.tier, status: "active" }, update: { tier: change.tier } });
    // Unlike best-effort operational logging, a failed admin audit rolls back the change.
    await tx.auditLog.create({ data: administrativeAudit(actorId, targetId, previous, next) });
    return { ok: true, changed: true };
  }, { maxWait: 5000, timeout: 10000 });
}
