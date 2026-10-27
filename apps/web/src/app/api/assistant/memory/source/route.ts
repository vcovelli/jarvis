import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enabled, hasSecrets } from "@/lib/memory/policy";
import { privateHeaders } from "@/lib/memory/http";
import { audit } from "@/lib/memory/store";
import { enforceRateLimit } from "@/lib/rateLimit";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(request, "assistant", userId);
  if (limited) return limited;
  if (!enabled())
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const url = new URL(request.url),
    id = url.searchParams.get("id") ?? "",
    type = url.searchParams.get("type") ?? "";
  const source = await prisma.memorySource.findFirst({
    where: {
      userId,
      sourceId: id,
      sourceType: type,
      memory: { userId, status: { not: "deleted" } },
    },
    select: { id: true },
  });
  if (!source)
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  let content: string | null = null,
    conversationId: string | null = null;
  if (type === "user_message") {
    const message = await prisma.assistantMessage.findFirst({
      where: { id, userId, role: "user", conversation: { userId } },
      select: { content: true, conversationId: true },
    });
    content = message?.content ?? null;
    conversationId = message?.conversationId ?? null;
  } else if (type === "legacy_memory")
    content =
      (
        await prisma.assistantMemory.findFirst({
          where: { id, userId },
          select: { value: true },
        })
      )?.value ?? null;
  await audit(prisma, userId, "source_viewed", {
    sourceId: id,
    sourceType: type,
  });
  return NextResponse.json(
    {
      content:
        content && !hasSecrets(content)
          ? content.slice(0, 8000)
          : "Source unavailable or contains protected identifiers.",
      conversationId,
    },
    { headers: privateHeaders },
  );
}
