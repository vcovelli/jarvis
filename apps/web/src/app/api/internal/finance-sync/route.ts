import { NextResponse } from "next/server";

import { runScheduledFinanceSync } from "@/lib/financeJobs";
import { enforceRateLimit } from "@/lib/rateLimit";
import { constantTimeEqual } from "@/lib/tokenSecurity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "internalJob");
  if (limited) return limited;
  const configured = process.env.INTERNAL_JOB_SECRET?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!configured || !provided || !constantTimeEqual(configured, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledFinanceSync();
  return NextResponse.json(result, { status: result.started ? 200 : 409 });
}
