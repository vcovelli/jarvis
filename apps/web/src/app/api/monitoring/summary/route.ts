import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getMonitoringSummary } from "@/lib/prometheus";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getMonitoringSummary();
  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
    },
  });
}
