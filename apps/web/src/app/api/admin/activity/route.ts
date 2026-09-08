import { adminResponse } from "@/lib/admin/http";
import { getAdminActivity } from "@/lib/admin/overview";
export const dynamic = "force-dynamic";
export async function GET() { return adminResponse(async () => ({ activity: await getAdminActivity() })); }
