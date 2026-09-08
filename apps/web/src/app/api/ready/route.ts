import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/health";
export const dynamic = "force-dynamic";
export async function GET() {
  const result = await getReadiness();
  return NextResponse.json(result, { status: result.status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
