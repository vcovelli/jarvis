import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { listAssistantMemories, upsertAssistantMemory } from "@/lib/assistant/conversations";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") ?? undefined;
  const projectDomain = url.searchParams.get("project") ?? undefined;
  const memories = await listAssistantMemories(userId, domain, projectDomain);
  return NextResponse.json({ memories });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  try {
    const memory = await upsertAssistantMemory({
      userId,
      domain: typeof body?.domain === "string" ? body.domain : "general",
      key: typeof body?.key === "string" ? body.key : "",
      value: typeof body?.value === "string" ? body.value : "",
    });
    return NextResponse.json({ memory });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid memory." }, { status: 400 });
  }
}
