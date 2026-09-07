import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { resolveAssistantIntent } from "@/lib/assistant/serverIntent";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceRateLimit(request, "assistant", userId);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input) {
    return NextResponse.json({ error: "Missing assistant input." }, { status: 400 });
  }

  const resolved = await resolveAssistantIntent({
    userId,
    input,
    context: body?.context,
  });

  return NextResponse.json({ result: resolved.result, used: resolved.used });
}
