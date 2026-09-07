import { prisma } from "@/lib/prisma";
import { hashOpaqueToken } from "@/lib/tokenSecurity";

export async function findUsableInvite(code: string, email: string) {
  if (!code) return null;
  const invite = await prisma.registrationInvite.findUnique({ where: { codeHash: hashOpaqueToken(code) } });
  if (!invite || invite.usedAt || invite.expiresAt <= new Date()) return null;
  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) return null;
  return invite;
}
