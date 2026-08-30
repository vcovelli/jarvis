import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getAssistantConversation, projectAssistantConversation, updateAssistantConversation } from "@/lib/assistant/conversations";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await context.params;
  const result = await getAssistantConversation(userId, conversationId);
  if (!result) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await context.params;
  const body = await request.json().catch(() => null);
  const conversation = await updateAssistantConversation({
    userId,
    conversationId,
    title: typeof body?.title === "string" ? body.title : undefined,
    domain: typeof body?.domain === "string" ? body.domain : undefined,
    description: typeof body?.description === "string" ? body.description : body?.description === null ? null : undefined,
    pinned: typeof body?.pinned === "boolean" ? body.pinned : undefined,
    archived: typeof body?.archived === "boolean" ? body.archived : undefined,
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ conversation: projectAssistantConversation(conversation) });
}
