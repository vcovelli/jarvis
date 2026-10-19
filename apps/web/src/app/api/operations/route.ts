import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/access";
import { AdminError } from "@/lib/admin/policy";
import { assertAdminMutation } from "@/lib/admin/http";
import { enforceRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import {
  changeSettings,
  enqueue,
  initialize,
  snapshot,
} from "@/lib/operations/engine";
import { readOperationsBody } from "@/lib/operations/http";
import { object, OperationsError, type Domain } from "@/lib/operations/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof OperationsError || error instanceof AdminError
          ? error.message
          : "Operations unavailable. Verify the migration and database connection.",
    },
    {
      status:
        error instanceof OperationsError || error instanceof AdminError
          ? error.status
          : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export async function GET() {
  try {
    const actor = await requireAdmin();
    return NextResponse.json(await snapshot(prisma, actor.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    assertAdminMutation(request);
    const limited = enforceRateLimit(request, "assistant", actor.id);
    if (limited) return limited;
    const body = object(await readOperationsBody(request));
    if (body.operation === "initialize") await initialize(prisma, actor.id);
    else if (body.operation === "settings")
      await changeSettings(prisma, actor.id, body.settings);
    else if (body.operation === "run")
      await enqueue(prisma, actor.id, body.domain as Domain);
    else if (body.operation === "read") {
      if (typeof body.notificationId !== "string")
        throw new OperationsError("Notification ID required.");
      await prisma.operationsNotification.updateMany({
        where: { id: body.notificationId, userId: actor.id },
        data: { readAt: new Date() },
      });
    } else throw new OperationsError("Unknown operation.");
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(
      error instanceof SyntaxError
        ? new OperationsError("Invalid JSON.")
        : error,
    );
  }
}
