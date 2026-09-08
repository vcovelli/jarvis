import "server-only";
import { entitlementAllows, type EntitlementTier } from "@/lib/entitlementPolicy";
import { prisma } from "@/lib/prisma";
import type { Access } from "@/lib/admin/policy";

export function isConfiguredAdmin(email?: string | null) {
  const emails = new Set((process.env.JARVIS_ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  return Boolean(email && emails.has(email.toLowerCase()));
}
export function effectiveEntitlement(stored: Access | null, email?: string | null): Access {
  // A database-backed owner is never replaced by the legacy ADMIN override.
  if (stored?.tier === "OWNER") return stored;
  if (isConfiguredAdmin(email)) return { tier: "ADMIN", status: "active", expiresAt: null };
  return stored ?? { tier: "INVITED", status: "active", expiresAt: null };
}
export async function getUserEntitlement(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, entitlement: true } });
  return user ? effectiveEntitlement(user.entitlement, user.email) : { tier: "FREE", status: "disabled", expiresAt: null };
}
export async function userHasEntitlement(userId: string, minimum: EntitlementTier = "FREE") {
  return entitlementAllows(await getUserEntitlement(userId), minimum);
}
