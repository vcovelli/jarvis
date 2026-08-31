import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { snapshotNetWorth } from "@/lib/finance/analytics";
import { prisma } from "@/lib/prisma";

const POSITION_KINDS = new Set(["asset", "liability"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const positions = await prisma.manualFinancialPosition.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { kind: "asc" }, { value: "desc" }],
    include: {
      valuations: {
        orderBy: { valuationDate: "desc" },
        take: 12,
      },
    },
  });
  return NextResponse.json({ positions });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid manual position payload." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const name = getString(input.name);
  const kind = getString(input.kind) || "asset";
  const value = Number(input.value);
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!POSITION_KINDS.has(kind)) return NextResponse.json({ error: "Kind must be asset or liability." }, { status: 400 });
  if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "Value must be a positive number." }, { status: 400 });

  const type = getString(input.type) || (kind === "asset" ? "manual_asset" : "manual_liability");
  const role = getString(input.role) || (kind === "asset" ? "other_asset" : "other_liability");
  const valuationDate = parseDate(input.valuationDate) ?? new Date();
  const isoCurrencyCode = getString(input.isoCurrencyCode)?.toUpperCase() || "USD";
  const notes = getString(input.notes);

  const position = await prisma.$transaction(async (tx) => {
    const created = await tx.manualFinancialPosition.create({
      data: {
        userId,
        kind,
        type,
        role,
        name,
        value,
        isoCurrencyCode,
        valuationDate,
        valuationMethod: getString(input.valuationMethod) || "manual",
        notes,
        acquisitionCost: getNumber(input.acquisitionCost),
        acquisitionDate: parseDate(input.acquisitionDate),
      },
    });
    await tx.manualFinancialPositionValuation.create({
      data: {
        userId,
        positionId: created.id,
        value,
        valuationDate,
        valuationMethod: created.valuationMethod,
        source: "manual",
        notes,
      },
    });
    return created;
  });

  await snapshotNetWorth(userId, "manual");
  return NextResponse.json({ position }, { status: 201 });
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
