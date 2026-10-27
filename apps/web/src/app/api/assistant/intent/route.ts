import { NextResponse } from "next/server";
import { readMemoryBody, memoryFailure } from "@/lib/memory/http";
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

  let body;
  try { body = await readMemoryBody(request, 64000); } catch (error) { return memoryFailure(error); }
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input || input.length > 8000) {
    return NextResponse.json({ error: "Missing assistant input." }, { status: 400 });
  }

  const resolved = await resolveAssistantIntent({
    userId,
    input,
    context: body?.context,
  });

  return NextResponse.json({ result: resolved.result, used: resolved.used });
}
