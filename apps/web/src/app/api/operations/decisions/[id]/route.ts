import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/access";
import { AdminError } from "@/lib/admin/policy";
import { assertAdminMutation } from "@/lib/admin/http";
import { enforceRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { decide } from "@/lib/operations/engine";
import { readOperationsBody } from "@/lib/operations/http";
import { OperationsError } from "@/lib/operations/policy";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdmin();
    assertAdminMutation(request);
    const limited = enforceRateLimit(request, "assistant", actor.id);
    if (limited) return limited;
    const body = await readOperationsBody(request, 8000);
    const { id } = await context.params;
    return NextResponse.json(await decide(prisma, actor.id, id, body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const known =
      error instanceof OperationsError || error instanceof AdminError;
    return NextResponse.json(
      {
        error: known
          ? error.message
          : error instanceof SyntaxError
            ? "Invalid JSON."
            : "Decision service unavailable.",
      },
      {
        status: known ? error.status : error instanceof SyntaxError ? 400 : 503,
      },
    );
  }
}
