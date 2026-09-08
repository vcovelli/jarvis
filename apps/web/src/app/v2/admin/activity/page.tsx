import { AdminShell, ActivityList } from "@/components/admin/AdminUI";
import { requireAdminPage } from "@/lib/admin/access";
import { getAdminActivity } from "@/lib/admin/overview";
export const dynamic = "force-dynamic";
export default async function AdminActivityPage() {
  await requireAdminPage();
  return <AdminShell title="Recent activity"><p className="theme-muted text-sm">The latest 40 important account, security, sync, and administrative events.</p><ActivityList activity={await getAdminActivity()} /></AdminShell>;
}
