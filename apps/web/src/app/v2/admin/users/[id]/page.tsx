import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminUI";
import { UserAccessForm } from "@/components/admin/UserAccessForm";
import { requireAdminPage } from "@/lib/admin/access";
import { AdminError, activityLabel, canManageUsers } from "@/lib/admin/policy";
import { getAdminUser } from "@/lib/admin/users";
export const dynamic = "force-dynamic";
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage();
  const user = await getAdminUser((await params).id).catch((error) => { if (error instanceof AdminError && error.status === 404) notFound(); throw error; });
  return <AdminShell title="User details">
    <section className="theme-card rounded-2xl p-5"><h2 className="theme-text break-words text-lg font-semibold">{user.name ?? user.email ?? "User"}</h2><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{Object.entries({ Email: user.email ?? "Unavailable", "User ID": user.id, Joined: user.createdAt, Verification: user.verified ? "Verified" : "Unverified", Activity: activityLabel(user.lastActiveAt), "Last active (UTC)": user.lastActiveAt ?? "Unavailable", "Entitlement status": user.entitlementStatus, "Entitlement expiry": user.expiresAt ?? "No expiry" }).map(([key, value]) => <div key={key} className="min-w-0"><dt className="theme-muted text-xs">{key}</dt><dd className="theme-text mt-1 break-words">{value}</dd></div>)}</dl></section>
    <UserAccessForm key={user.id} user={user} canManage={canManageUsers(actor)} ownAccount={actor.id === user.id} />
  </AdminShell>;
}
