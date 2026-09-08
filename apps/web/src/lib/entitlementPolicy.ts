export type EntitlementTier = "FREE" | "INVITED" | "PRO" | "ADMIN" | "OWNER";
const tierRank: Record<EntitlementTier, number> = { FREE: 0, INVITED: 1, PRO: 2, ADMIN: 3, OWNER: 4 };

export function normalizeEntitlementTier(value: unknown): EntitlementTier {
  return value === "FREE" || value === "PRO" || value === "ADMIN" || value === "OWNER" ? value : "INVITED";
}

export function entitlementAllows(params: { tier: unknown; status?: string; expiresAt?: Date | null }, minimum: EntitlementTier = "FREE", now = new Date()) {
  if (params.status && params.status !== "active") return false;
  if (params.expiresAt && params.expiresAt <= now) return false;
  return tierRank[normalizeEntitlementTier(params.tier)] >= tierRank[minimum];
}
