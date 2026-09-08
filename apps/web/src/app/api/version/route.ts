import { NextResponse } from "next/server";
import { getBuildInfo, getRuntimeVersion } from "@/lib/buildInfo";
export const dynamic = "force-dynamic";
export function GET() {
  // Keep the per-process version marker consumed by the installed PWA.
  return NextResponse.json({ version: getRuntimeVersion(), build: getBuildInfo() }, { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } });
}
