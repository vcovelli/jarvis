import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";

import { writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { validatePassword } from "@/lib/passwordPolicy";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(request, "passwordChange", userId);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => null);
    const currentPassword = String(body?.currentPassword ?? "");
    const nextPassword = validatePassword(body?.nextPassword);
    if (!currentPassword || !nextPassword.valid) {
      return NextResponse.json({ error: !currentPassword ? "Missing password fields." : nextPassword.error }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) return NextResponse.json({ error: "Password not set for this account." }, { status: 400 });
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      await writeAuditLog({ action: "account.password_change", outcome: "denied", userId, request, metadata: { reason: "incorrect_current_password" } });
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(nextPassword.value, 12), sessionVersion: { increment: 1 } },
    });
    await writeAuditLog({ action: "account.password_change", userId, request, metadata: { sessionsInvalidated: true } });
    return NextResponse.json({ ok: true, requiresSignIn: true });
  } catch (error) {
    console.error("[account] password_change_failed", { userId, errorType: error instanceof Error ? error.name : "UnknownError" });
    await writeAuditLog({ action: "account.password_change", outcome: "failure", userId, request });
    return NextResponse.json({ error: "Failed to update password." }, { status: 500 });
  }
}
