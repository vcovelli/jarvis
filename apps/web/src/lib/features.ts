import "server-only";
import { prisma } from "@/lib/prisma";
import { featureAllows } from "@/lib/featurePolicy";

/** Call with the authenticated server-side user ID. Entitlement checks remain separate. */
export async function hasFeature(userId: string, key: string): Promise<boolean> {
  const [user, feature] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { rolloutLevel: true } }),
    prisma.featureFlag.findUnique({ where: { key }, select: { stage: true } }),
  ]);
  return Boolean(user && feature && featureAllows(user.rolloutLevel, feature.stage));
}
