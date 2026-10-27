import { adminResponse } from "@/lib/admin/http";
import { prisma } from "@/lib/prisma";
import { diagnostics } from "@/lib/memory/jobs";
import { enabled } from "@/lib/memory/policy";
export const dynamic = "force-dynamic";
export async function GET() {
  return adminResponse(async (actor) =>
    enabled() ? diagnostics(prisma, actor.id) : { enabled: false },
  );
}
