import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeRuleMatchValue } from "@/lib/finance/classification";
import { normalizeFinancialTransactions } from "@/lib/finance/normalization";
import { prisma } from "@/lib/prisma";

const MATCH_TYPES = new Set([
  "contains",
  "name_contains",
  "exact",
  "exact_name",
  "merchant",
  "merchant_exact",
  "merchant_contains",
  "category",
  "plaid_category",
  "regex",
]);

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await prisma.financialClassificationRule.findMany({
    where: { userId },
    orderBy: [{ enabled: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid classification rule payload." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const matchType = getString(input.matchType) || "contains";
  const matchValue = getString(input.matchValue);
  const eventType = getString(input.eventType);
  const primaryCategory = getString(input.primaryCategory);
  if (!MATCH_TYPES.has(matchType)) return NextResponse.json({ error: "Unsupported match type." }, { status: 400 });
  if (!matchValue) return NextResponse.json({ error: "Match value is required." }, { status: 400 });
  if (!eventType) return NextResponse.json({ error: "Event type is required." }, { status: 400 });
  if (!primaryCategory) return NextResponse.json({ error: "Primary category is required." }, { status: 400 });

  const rule = await prisma.financialClassificationRule.create({
    data: {
      userId,
      name: getString(input.name) || `${eventType} rule`,
      enabled: input.enabled === false ? false : true,
      priority: getInteger(input.priority) ?? 100,
      matchType,
      matchValue,
      matchValueNormalized: normalizeRuleMatchValue(matchType, matchValue),
      institutionId: getString(input.institutionId),
      connectionId: getString(input.connectionId),
      accountId: getString(input.accountId),
      amount: getNumber(input.amount),
      eventType,
      primaryCategory,
      subcategory: getString(input.subcategory),
      normalizedMerchant: getString(input.normalizedMerchant),
      confidence: getNumber(input.confidence) ?? 0.98,
      source: "user_rule",
    },
  });
  const backfill = await normalizeFinancialTransactions(userId, { all: true, limit: 5000 });
  await writeAuditLog({ action: "finance.classification_rule_created", userId, request, metadata: { ruleId: rule.id, matchType: rule.matchType, eventType: rule.eventType } });
  return NextResponse.json({ rule, backfill }, { status: 201 });
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}
