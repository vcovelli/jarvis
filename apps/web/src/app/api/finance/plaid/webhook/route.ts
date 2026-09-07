import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { syncFinancialConnection } from "@/lib/financeSync";
import { verifyPlaidWebhook } from "@/lib/plaidWebhook";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let verification;
  try {
    verification = await verifyPlaidWebhook(rawBody, request.headers.get("plaid-verification"));
  } catch (error) {
    console.error("[plaid] webhook_verification_failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
    await writeAuditLog({ action: "finance.plaid_webhook", outcome: "failure", request, metadata: { reason: "verification_error" } });
    return NextResponse.json({ error: "Webhook verification failed." }, { status: 401 });
  }
  if (!verification.valid) {
    await writeAuditLog({ action: "finance.plaid_webhook", outcome: "denied", request, metadata: { reason: verification.error } });
    return NextResponse.json({ error: "Webhook verification failed." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await writeAuditLog({ action: "finance.plaid_webhook", outcome: "denied", request, metadata: { reason: "invalid_json" } });
    return NextResponse.json({ error: "Webhook payload is invalid." }, { status: 400 });
  }
  const eventType = typeof body.webhook_type === "string" ? body.webhook_type : undefined;
  const eventCode = typeof body.webhook_code === "string" ? body.webhook_code : undefined;
  const itemId = typeof body.item_id === "string" ? body.item_id : undefined;
  try {
    await prisma.externalWebhookEvent.create({
      data: {
        provider: "plaid",
        eventKey: verification.eventKey,
        eventType,
        eventCode,
        metadata: { itemPresent: Boolean(itemId) },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  const connections = itemId
    ? await prisma.financialConnection.findMany({ where: { provider: "plaid", itemId, status: "active" }, select: { id: true, userId: true } })
    : [];
  const shouldSync = eventType === "TRANSACTIONS" || eventType === "INVESTMENTS";
  let failures = 0;
  if (shouldSync) {
    for (const connection of connections) {
      try {
        await syncFinancialConnection(connection.userId, connection.id);
        await writeAuditLog({ action: "finance.plaid_webhook_sync", userId: connection.userId, request, metadata: { connectionId: connection.id, eventType, eventCode } });
      } catch (error) {
        failures += 1;
        console.error("[plaid] webhook_sync_failed", { connectionId: connection.id, errorType: error instanceof Error ? error.name : "UnknownError" });
        await writeAuditLog({ action: "finance.plaid_webhook_sync", outcome: "failure", userId: connection.userId, request, metadata: { connectionId: connection.id, eventType, eventCode } });
      }
    }
  }
  await prisma.externalWebhookEvent.update({
    where: { eventKey: verification.eventKey },
    data: { status: failures ? "partial_failure" : "processed", attempts: { increment: 1 }, processedAt: new Date() },
  });
  return NextResponse.json({ ok: true, matchedConnections: connections.length, syncAttempted: shouldSync, failures });
}
