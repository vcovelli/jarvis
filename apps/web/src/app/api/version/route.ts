import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const runtime = globalThis as typeof globalThis & {
  jarvisRuntimeVersion?: string;
};

const runtimeVersion =
  runtime.jarvisRuntimeVersion ?? randomUUID();

runtime.jarvisRuntimeVersion = runtimeVersion;

export function GET() {
  return NextResponse.json(
    { version: runtimeVersion },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
}
