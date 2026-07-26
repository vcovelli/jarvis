import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { PlaidApiError, PlaidConfigError } from "@/lib/plaid";
import { syncAllFinancialConnections, syncFinancialConnection } from "@/lib/financeSync";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : undefined;

  try {
    const results = connectionId
      ? [await syncFinancialConnection(userId, connectionId)]
      : await syncAllFinancialConnections(userId);
    return NextResponse.json({ results, updatedAt: Date.now() });
  } catch (error) {
    if (error instanceof PlaidConfigError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PlaidApiError) {
      return NextResponse.json({ error: error.message, payload: error.payload }, { status: error.status });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
