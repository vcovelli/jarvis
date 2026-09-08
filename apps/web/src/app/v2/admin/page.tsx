import Link from "next/link";
import { AdminShell, ActivityList, StatusPill } from "@/components/admin/AdminUI";
import { RefreshAdmin } from "@/components/admin/RefreshAdmin";
import { requireAdminPage } from "@/lib/admin/access";
import { getAdminActivity, getAdminOverview } from "@/lib/admin/overview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Jarvis Control" };
export default async function AdminPage() {
  await requireAdminPage();
  const [overview, activity] = await Promise.all([getAdminOverview(), getAdminActivity()]);
  const alerts = overview.services.filter((service) => service.status === "Degraded" || (service.status === "Unavailable" && ["Database", "OpenClaw", "Homelab", "Finance Sync"].includes(service.name)));
  return <AdminShell title="System overview">
    <section className="theme-surface rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="theme-text text-xl font-semibold">{overview.readiness.status === "ready" ? "System healthy" : "System needs attention"}</h2><RefreshAdmin /></div>
      <p className="theme-text mt-2 text-sm">v{overview.build.version ?? "Unavailable"} · {overview.build.environment}</p>
      <p className="theme-muted mt-2 text-xs">Deployment {overview.readiness.status === "ready" ? "ready" : "not ready"} · Process uptime {Math.floor(overview.uptimeSeconds / 60)} min</p>
      <p className="theme-muted mt-1 text-xs">Commit {overview.build.commit?.slice(0, 12) ?? "Unavailable"} · Built {overview.build.builtAt ?? "Unavailable"}</p>
      <p className="theme-muted mt-2 text-xs">Checked {new Date(overview.checkedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>
    </section>
    <section className="theme-card rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="theme-muted text-sm">Users</h2><p className="theme-text mt-1 text-3xl font-semibold">{overview.users.total}</p></div><p className="theme-muted text-sm">{overview.users.active} active in the last 30 min</p></div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">{(["STABLE", "BETA", "EXPERIMENTAL"] as const).map((level) => <p key={level} className="theme-text"><span className="theme-muted text-xs">{level}</span> {overview.users[level]}</p>)}</div>
    </section>
    {(alerts.length > 0 || !overview.readiness.checks.configuration) && <section className="theme-card rounded-2xl p-4"><h2 className="theme-text font-semibold">Needs attention</h2>{!overview.readiness.checks.configuration && <p className="theme-muted mt-2 text-sm">Required server configuration is incomplete.</p>}{alerts.map((alert) => <p key={alert.name} className="theme-muted mt-2 text-sm">{alert.name}: {alert.detail}</p>)}</section>}
    <section><div className="mb-3 flex items-center justify-between gap-2"><h2 className="theme-text text-lg font-semibold">Recent activity</h2><Link href="/v2/admin/activity" className="theme-text py-3 text-sm underline">View activity</Link></div><ActivityList activity={activity.slice(0, 10)} compact /></section>
    <Link href="/v2/admin/users" className="theme-button-primary rounded-2xl px-5 py-4 text-center text-sm font-semibold">Manage users</Link>
    <details className="theme-surface rounded-2xl p-4" open><summary className="theme-text cursor-pointer py-2 font-semibold">Services & integrations</summary><div className="mt-3 grid gap-3 lg:grid-cols-2">{overview.services.map((service) => <article key={service.name} className="theme-card rounded-xl p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="theme-text text-sm font-semibold">{service.name}</h3><StatusPill status={service.status} /></div><p className="theme-muted mt-2 text-xs leading-5">{service.detail}</p></article>)}</div></details>
  </AdminShell>;
}
