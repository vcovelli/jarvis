import { adminResponse } from "@/lib/admin/http";
import { getAdminOverview } from "@/lib/admin/overview";
export const dynamic = "force-dynamic";
export async function GET() { return adminResponse(() => getAdminOverview()); }
