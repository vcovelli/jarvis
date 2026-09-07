import { entitlementAllows, type EntitlementTier } from "@/lib/entitlementPolicy";
import { prisma } from "@/lib/prisma";

export async function getUserEntitlement(userId: string, email?: string | null) {
  const adminEmails = new Set((process.env.JARVIS_ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (email && adminEmails.has(email.toLowerCase())) return { tier: "ADMIN" as const, status: "active" as const, expiresAt: null };
  const entitlement = await prisma.entitlement.findUnique({ where: { userId } });
  return entitlement ?? { tier: "INVITED" as const, status: "active" as const, expiresAt: null };
}

export async function userHasEntitlement(userId: string, minimum: EntitlementTier = "FREE", email?: string | null) {
  return entitlementAllows(await getUserEntitlement(userId, email), minimum);
}
