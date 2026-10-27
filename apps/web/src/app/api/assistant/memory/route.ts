import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  listAssistantMemories,
  upsertAssistantMemory,
} from "@/lib/assistant/conversations";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enabled, MemoryError, serverAccess } from "@/lib/memory/policy";
import { listMemories } from "@/lib/memory/retrieval";
import { deleteMemory, saveManual } from "@/lib/memory/store";
import {
  memoryFailure,
  privateHeaders,
  readMemoryBody,
} from "@/lib/memory/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(request, "assistant", userId);
  if (limited) return limited;
  try {
    const url = new URL(request.url),
      domain = url.searchParams.get("domain") ?? undefined,
      project = url.searchParams.get("project") ?? undefined;
    if (!enabled())
      return NextResponse.json(
        {
          engine: 1,
          memories: await listAssistantMemories(userId, domain, project),
        },
        { headers: privateHeaders },
      );
    const scopes = ["general", domain, project].filter((s): s is string =>
      Boolean(s),
    );
    return NextResponse.json(
      {
        engine: 2,
        ...(await listMemories(
          prisma,
          serverAccess(userId, "assistant", scopes),
          {
            query: url.searchParams.get("q") ?? undefined,
            after: url.searchParams.get("after") ?? undefined,
            history: url.searchParams.get("history") === "true",
            conflicts: url.searchParams.get("conflicts") === "true",
          },
        )),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return memoryFailure(error);
  }
}
async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(request, "assistant", userId);
  if (limited) return limited;
  try {
    const body = await readMemoryBody(request);
    if (!enabled()) {
      if (method !== "POST")
        throw new MemoryError("Memory V2 is not enabled.", 409);
      const memory = await upsertAssistantMemory({
        userId,
        domain: typeof body.domain === "string" ? body.domain : "general",
        key: typeof body.key === "string" ? body.key : "",
        value: typeof body.value === "string" ? body.value : "",
      });
      return NextResponse.json({ memory }, { headers: privateHeaders });
    }
    const access = serverAccess(userId, "assistant", [], "manage");
    if (
      method !== "POST" &&
      (typeof body.id !== "string" || body.id.length > 100)
    )
      throw new MemoryError("Memory ID required.");
    const result =
      method === "DELETE"
        ? await deleteMemory(prisma, access, body.id as string)
        : {
            memory: await saveManual(prisma, access, {
              title: body.key,
              content: body.value,
              domain: body.domain ?? "general",
              correctId: method === "PATCH" ? (body.id as string) : undefined,
            }),
          };
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    return memoryFailure(error);
  }
}
export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
