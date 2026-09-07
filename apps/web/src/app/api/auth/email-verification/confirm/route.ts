import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { consumeAuthToken } from "@/lib/authTokens";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "emailVerification");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const token = String(body?.token ?? "");
  if (!token) return NextResponse.json({ error: "Verification token is required." }, { status: 400 });
  const authToken = await consumeAuthToken(token, "email_verification");
  if (!authToken) {
    await writeAuditLog({ action: "auth.email_verification", outcome: "denied", request, metadata: { reason: "invalid_or_expired" } });
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: authToken.userId }, data: { emailVerified: new Date() } });
  await writeAuditLog({ action: "auth.email_verification", userId: authToken.userId, request });
  return NextResponse.json({ ok: true });
}
