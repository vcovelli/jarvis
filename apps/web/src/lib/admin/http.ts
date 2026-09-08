import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin } from "./access";
import { AdminError, type Actor } from "./policy";

export async function adminResponse(work: (actor: Actor) => Promise<unknown>) {
  try {
    const actor = await requireAdmin();
    return NextResponse.json(await work(actor), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdminError ? error.message : "Admin service unavailable." }, {
      status: error instanceof AdminError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
export function assertAdminMutation(request: Request) {
  // Cookie-authenticated writes must originate from the configured application.
  const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  if (request.headers.get("origin") !== expected || !request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError(403, "Same-origin JSON request required.");
}
