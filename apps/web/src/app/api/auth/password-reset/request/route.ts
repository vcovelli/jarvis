import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { issueAuthToken } from "@/lib/authTokens";
import { buildPublicAuthUrl, deliverAuthMail, exposeDevelopmentAuthUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

const genericMessage = "If that account exists, a password-reset link has been prepared.";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "passwordResetRequest");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }) : null;
  let developmentResetUrl: string | undefined;

  if (user?.email) {
    const issued = await issueAuthToken(user.id, "password_reset");
    const url = buildPublicAuthUrl("/reset-password", issued.rawToken);
    const delivery = await deliverAuthMail({ kind: "password-reset", to: user.email, url, expiresAt: issued.expiresAt });
    developmentResetUrl = exposeDevelopmentAuthUrl(url);
    await writeAuditLog({ action: "auth.password_reset_requested", userId: user.id, request, metadata: { delivered: delivery.delivered } });
  } else {
    await writeAuditLog({ action: "auth.password_reset_requested", outcome: "success", request, metadata: { accountMatched: false } });
  }

  return NextResponse.json({ ok: true, message: genericMessage, developmentResetUrl }, { status: 202 });
}
