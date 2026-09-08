import { adminResponse } from "@/lib/admin/http";
import { listAdminUsers } from "@/lib/admin/users";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return adminResponse(() => { const params = new URL(request.url).searchParams; return listAdminUsers(params.get("q") ?? "", Number(params.get("page") ?? 1)); });
}
