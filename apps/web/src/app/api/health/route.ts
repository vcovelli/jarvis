import { NextResponse } from "next/server";
import { getAppHealth } from "@/lib/health";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(getAppHealth(), { headers: { "Cache-Control": "no-store" } }); }
