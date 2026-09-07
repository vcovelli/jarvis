import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashOpaqueToken, type SecurityTokenType } from "@/lib/tokenSecurity";

const tokenLifetimeMs: Record<SecurityTokenType, number> = {
  password_reset: 30 * 60_000,
  email_verification: 24 * 60 * 60_000,
};

export async function issueAuthToken(userId: string, type: SecurityTokenType) {
  const rawToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + tokenLifetimeMs[type]);
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type, consumedAt: null } }),
    prisma.authToken.create({ data: { userId, type, tokenHash: hashOpaqueToken(rawToken), expiresAt } }),
  ]);
  return { rawToken, expiresAt };
}

export async function consumeAuthToken(rawToken: string, type: SecurityTokenType) {
  const tokenHash = hashOpaqueToken(rawToken);
  return prisma.$transaction(async (tx) => {
    const token = await tx.authToken.findUnique({ where: { tokenHash } });
    if (!token || token.type !== type || token.consumedAt || token.expiresAt <= new Date()) return null;
    const consumed = await tx.authToken.updateMany({
      where: { id: token.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    return consumed.count === 1 ? token : null;
  });
}
