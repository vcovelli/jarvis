import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";

import { AdminError } from "@/lib/admin/policy";
import { writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { getAuthenticatedUserId } from "@/lib/authBoundary";
import { removePlaidItem } from "@/lib/plaidRemoval";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getAuthenticatedUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(request, "passwordChange", userId);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => null);
    const password = String(body?.password ?? "");
    if (!password) return NextResponse.json({ error: "Password required." }, { status: 400 });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { entitlement: { select: { tier: true } }, passwordHash: true, financialConnections: { select: { id: true, provider: true, accessTokenEncrypted: true } } },
    });
    if (!user?.passwordHash) return NextResponse.json({ error: "Password not set for this account." }, { status: 400 });
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      await writeAuditLog({ action: "account.deletion", outcome: "denied", userId, request, metadata: { reason: "incorrect_password" } });
      return NextResponse.json({ error: "Password is incorrect." }, { status: 403 });
    }

    if (user.entitlement?.tier === "OWNER") return NextResponse.json({ error: "Transfer ownership and have another owner change your entitlement before deleting this account." }, { status: 409 });

    const revocations = [];
    for (const connection of user.financialConnections) {
      const result = await removePlaidItem(connection.provider, connection.accessTokenEncrypted);
      revocations.push({ connectionId: connection.id, attempted: result.attempted, removed: result.removed });
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74192026)`;
      const entitlement = await tx.entitlement.findUnique({ where: { userId }, select: { tier: true } });
      if (entitlement?.tier === "OWNER") throw new AdminError(409, "An owner account cannot be deleted. Transfer ownership first.");
      await tx.user.delete({ where: { id: userId } });
    });
    await writeAuditLog({
      action: "account.deletion",
      metadata: {
        financeConnectionCount: revocations.length,
        providerRevocationFailures: revocations.filter((item) => item.attempted && !item.removed).length,
      },
    });
    return NextResponse.json({ ok: true, providerRevocations: revocations });
  } catch (error) {
    if (error instanceof AdminError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[account] deletion_failed", { userId, errorType: error instanceof Error ? error.name : "UnknownError" });
    await writeAuditLog({ action: "account.deletion", outcome: "failure", userId, request });
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }
}
