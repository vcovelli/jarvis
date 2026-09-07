import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { issueAuthToken } from "@/lib/authTokens";
import { buildPublicAuthUrl, deliverAuthMail, exposeDevelopmentAuthUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "emailVerification");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, emailVerified: true } }) : null;
  let developmentVerificationUrl: string | undefined;
  if (user?.email && !user.emailVerified) {
    const issued = await issueAuthToken(user.id, "email_verification");
    const url = buildPublicAuthUrl("/verify-email", issued.rawToken);
    const delivery = await deliverAuthMail({ kind: "email-verification", to: user.email, url, expiresAt: issued.expiresAt });
    developmentVerificationUrl = exposeDevelopmentAuthUrl(url);
    await writeAuditLog({ action: "auth.email_verification_requested", userId: user.id, request, metadata: { delivered: delivery.delivered } });
  }
  return NextResponse.json({ ok: true, message: "If verification is needed, a new link has been prepared.", developmentVerificationUrl }, { status: 202 });
}
