import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { consumeAuthToken } from "@/lib/authTokens";
import { validatePassword } from "@/lib/passwordPolicy";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "passwordResetComplete");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const token = String(body?.token ?? "");
  const password = validatePassword(body?.password);
  if (!token || !password.valid) return NextResponse.json({ error: !token ? "Reset token is required." : password.error }, { status: 400 });

  const authToken = await consumeAuthToken(token, "password_reset");
  if (!authToken) {
    await writeAuditLog({ action: "auth.password_reset", outcome: "denied", request, metadata: { reason: "invalid_or_expired" } });
    return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: authToken.userId },
    data: { passwordHash: await bcrypt.hash(password.value, 12), sessionVersion: { increment: 1 } },
  });
  await writeAuditLog({ action: "auth.password_reset", userId: authToken.userId, request });
  return NextResponse.json({ ok: true });
}
