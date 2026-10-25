import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/access";
import { AdminError } from "@/lib/admin/policy";
import { getSystemTelemetry } from "@/lib/operations/systemTelemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getSystemTelemetry(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof AdminError ? error.status : 503;
    return NextResponse.json({ error: status === 503 ? "System telemetry is temporarily unavailable." : (error as AdminError).message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
