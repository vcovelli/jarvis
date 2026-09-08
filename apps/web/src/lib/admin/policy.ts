import { entitlementAllows, normalizeEntitlementTier, type EntitlementTier } from "../entitlementPolicy.ts";

export const rolloutLevels = ["STABLE", "BETA", "EXPERIMENTAL"] as const;
export type Rollout = typeof rolloutLevels[number];
export const editableTiers: EntitlementTier[] = ["FREE", "INVITED", "PRO", "ADMIN", "OWNER"];
export type Access = { tier: unknown; status?: string; expiresAt?: Date | null };
export type Actor = { id: string; entitlement: Access };
export const canViewAdmin = (actor: Actor | null) => Boolean(actor && entitlementAllows(actor.entitlement, "ADMIN"));
export const canManageUsers = (actor: Actor | null) => Boolean(actor && entitlementAllows(actor.entitlement, "OWNER"));

export class AdminError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export type UserChange = { rolloutLevel?: Rollout; tier?: EntitlementTier };
export function parseUserChange(body: unknown): UserChange {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdminError(400, "Invalid change.");
  const input = body as Record<string, unknown>;
  if (!Object.keys(input).length || Object.keys(input).some((key) => !["rolloutLevel", "tier"].includes(key))) throw new AdminError(400, "Only rolloutLevel and tier can be changed.");
  if ("rolloutLevel" in input && !rolloutLevels.includes(input.rolloutLevel as Rollout)) throw new AdminError(400, "Invalid rollout level.");
  if ("tier" in input && !editableTiers.includes(input.tier as EntitlementTier)) throw new AdminError(400, "Invalid entitlement.");
  return input as UserChange;
}
export function assertUserChange(actor: Actor | null, target: { id: string; entitlement: Access; configuredAdmin: boolean }, change: UserChange, ownerCount: number) {
  if (!actor) throw new AdminError(401, "Sign in required.");
  if (!canManageUsers(actor)) throw new AdminError(403, "Owner access required.");
  if (change.tier !== undefined) {
    if (actor.id === target.id) throw new AdminError(403, "You cannot change your own entitlement.");
    if (target.configuredAdmin) throw new AdminError(409, "This entitlement is managed by server configuration.");
    if (target.entitlement.tier === "OWNER" && change.tier !== "OWNER" && ownerCount <= 1) throw new AdminError(409, "Keep at least one active owner.");
    if (change.tier === "OWNER" && target.entitlement.expiresAt) throw new AdminError(409, "Owner access requires a non-expiring entitlement.");
    if (change.tier === "OWNER" && !entitlementAllows(target.entitlement, "FREE")) throw new AdminError(409, "An inactive or expired entitlement cannot become an owner.");
  }
}

export const LAST_ACTIVE_INTERVAL_MS = 15 * 60_000;
export function needsActivityUpdate(lastActiveAt: Date | null, now = new Date()) {
  return !lastActiveAt || now.getTime() - lastActiveAt.getTime() >= LAST_ACTIVE_INTERVAL_MS;
}
export function activityLabel(lastActiveAt: string | null, now = Date.now()) {
  if (!lastActiveAt) return "Unavailable";
  const age = now - new Date(lastActiveAt).getTime();
  return age < 30 * 60_000 ? "Active recently" : age < 24 * 60 * 60_000 ? "Today" : age < 7 * 24 * 60 * 60_000 ? "This week" : "Older";
}

export type UserRecord = {
  id: string; name: string | null; email: string | null; emailVerified: Date | null;
  createdAt: Date; lastActiveAt: Date | null; rolloutLevel: Rollout; entitlement: Access | null;
};
export function presentUser(user: UserRecord, entitlement: Access, configuredAdmin = false) {
  return {
    id: user.id, name: user.name, email: user.email, verified: Boolean(user.emailVerified),
    createdAt: user.createdAt.toISOString(), lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    rolloutLevel: user.rolloutLevel, tier: normalizeEntitlementTier(entitlement.tier),
    entitlementStatus: entitlement.status ?? "active", expiresAt: entitlement.expiresAt?.toISOString() ?? null,
    accessActive: entitlementAllows(entitlement), configuredAdmin,
  };
}
export type AdminUser = ReturnType<typeof presentUser>;
export function administrativeAudit(actorId: string, targetId: string, previous: { tier: string; rolloutLevel: string }, next: { tier: string; rolloutLevel: string }) {
  return {
    userId: actorId, action: "admin.user_access_changed", outcome: "success",
    metadata: { actorUserId: actorId, targetUserId: targetId, previous, next },
  };
}
