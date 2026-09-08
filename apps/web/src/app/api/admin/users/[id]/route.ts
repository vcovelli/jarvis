import { adminResponse, assertAdminMutation } from "@/lib/admin/http";
import { changeAdminUser, getAdminUser } from "@/lib/admin/users";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return adminResponse(async () => ({ user: await getAdminUser((await context.params).id) }));
}
export async function PATCH(request: Request, context: Context) {
  return adminResponse(async (actor) => {
    assertAdminMutation(request);
    return changeAdminUser(actor.id, (await context.params).id, await request.json().catch(() => null));
  });
}
