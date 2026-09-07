import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { FINANCIAL_EVENT_TYPES, buildEventFlags, getDefaultCategoryForEventType, normalizeMerchantName } from "@/lib/finance/classification";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const FINANCIAL_EVENT_TYPE_SET = new Set<string>(FINANCIAL_EVENT_TYPES);

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const existing = await prisma.financialEvent.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Event was not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid event correction payload." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const eventTypeInput = getString(input.eventType);
  if (eventTypeInput && !FINANCIAL_EVENT_TYPE_SET.has(eventTypeInput)) {
    return NextResponse.json({ error: "Invalid finance event type." }, { status: 400 });
  }
  const eventType = eventTypeInput || existing.eventType;
  const defaults = getDefaultCategoryForEventType(eventType, existing.primaryCategory);
  const flags = buildEventFlags(eventType, existing.amount);
  const normalizedMerchantInput = getString(input.normalizedMerchant);
  const displayName = getString(input.displayName) || existing.displayName;

  const event = await prisma.financialEvent.update({
    where: { id: existing.id },
    data: {
      eventType,
      primaryCategory: getString(input.primaryCategory) || defaults.primaryCategory,
      subcategory: getString(input.subcategory) ?? defaults.subcategory,
      normalizedMerchant: normalizedMerchantInput ? normalizeMerchantName(normalizedMerchantInput) : existing.normalizedMerchant,
      displayName,
      relatedEventId: null,
      transferGroupId: null,
      cashFlowAmount: flags.cashFlowAmount,
      countsAsIncome: flags.countsAsIncome,
      countsAsSpend: flags.countsAsSpend,
      countsAsSavings: flags.countsAsSavings,
      countsAsInvestmentContribution: flags.countsAsInvestmentContribution,
      countsAsTransfer: flags.countsAsTransfer,
      internalTransfer: flags.internalTransfer,
      investmentIncome: flags.investmentIncome,
      affectsNetWorth: flags.affectsNetWorth,
      needsReview: input.needsReview === true ? true : false,
      confidence: 1,
      classificationSource: "manual",
      classificationReason: "Manually corrected by user.",
      userReviewedAt: new Date(),
    },
  });

  await writeAuditLog({ action: "finance.event_reviewed", userId, request, metadata: { eventId: event.id, eventType: event.eventType } });

  return NextResponse.json({ event });
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
