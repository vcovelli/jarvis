import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(request, "passwordChange", userId);
  if (limited) return limited;
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  await writeAuditLog({ action: "account.sessions_revoked", userId, request });
  return NextResponse.json({ ok: true });
}
