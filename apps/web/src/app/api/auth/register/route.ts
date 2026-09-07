import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { writeAuditLog } from "@/lib/audit";
import { issueAuthToken } from "@/lib/authTokens";
import { findUsableInvite } from "@/lib/invitations";
import { buildPublicAuthUrl, deliverAuthMail, exposeDevelopmentAuthUrl } from "@/lib/mail";
import { validatePassword } from "@/lib/passwordPolicy";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { validateRegistrationAccess } from "@/lib/registration";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "registration");
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => null);
    const access = validateRegistrationAccess(body?.accessCode);
    if (!access.allowed) {
      await writeAuditLog({ action: "auth.registration", outcome: "denied", request, metadata: { reason: access.mode } });
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = validatePassword(body?.password);
    const name = String(body?.name ?? "").trim().slice(0, 120);
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password.valid) {
      return NextResponse.json({ error: !email || !/^\S+@\S+\.\S+$/.test(email) ? "A valid email is required." : password.error }, { status: 400 });
    }

    const invite = access.mode === "invite" ? await findUsableInvite(String(body?.accessCode ?? "").trim(), email) : null;
    if (access.mode === "invite" && !invite) {
      await writeAuditLog({ action: "auth.registration", outcome: "denied", request, metadata: { reason: "invalid_invite" } });
      return NextResponse.json({ error: "A valid invitation is required." }, { status: 403 });
    }

    const passwordHash = await bcrypt.hash(password.value, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: name || null,
          passwordHash,
          entitlement: { create: { tier: access.mode === "open" ? "FREE" : "INVITED", status: "active" } },
        },
      });
      if (invite) {
        const claimed = await tx.registrationInvite.updateMany({
          where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date(), usedByUserId: created.id },
        });
        if (claimed.count !== 1) throw new Error("Invitation was already used.");
      }
      return created;
    });

    const verification = await issueAuthToken(user.id, "email_verification");
    const verificationUrl = buildPublicAuthUrl("/verify-email", verification.rawToken);
    const delivery = await deliverAuthMail({ kind: "email-verification", to: email, url: verificationUrl, expiresAt: verification.expiresAt });
    await writeAuditLog({
      action: "auth.registration",
      userId: user.id,
      request,
      metadata: { mode: access.mode, verificationDelivered: delivery.delivered },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      verificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED?.toLowerCase() === "true",
      developmentVerificationUrl: exposeDevelopmentAuthUrl(verificationUrl),
    }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    await writeAuditLog({ action: "auth.registration", outcome: "failure", request, metadata: { reason: duplicate ? "duplicate" : "internal" } });
    return NextResponse.json({ error: duplicate ? "Email is already registered." : "Failed to register user." }, { status: duplicate ? 409 : 500 });
  }
}
