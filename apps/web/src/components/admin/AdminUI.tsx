import Link from "next/link";
import type { ReactNode } from "react";
import { activityLabel, type AdminUser } from "@/lib/admin/policy";
import type { AdminActivity } from "@/lib/admin/activity";

export function AdminNav() {
  return <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
    <Link className="theme-button-secondary rounded-xl px-4 py-3 text-sm" href="/v2/admin">Overview</Link>
    <Link className="theme-button-secondary rounded-xl px-4 py-3 text-sm" href="/v2/admin/users">Users</Link>
    <Link className="theme-button-secondary rounded-xl px-4 py-3 text-sm" href="/v2/admin/activity">Activity</Link>
  </nav>;
}
export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 pb-5">
    <header><p className="theme-kicker text-xs font-semibold tracking-widest">JARVIS / CONTROL</p><h1 className="theme-text mt-2 text-3xl font-semibold">{title}</h1></header>
    <AdminNav />{children}
  </div>;
}
export function StatusPill({ status }: { status: string }) {
  return <span className="theme-pill inline-flex max-w-full items-center rounded-full px-3 py-1.5 text-xs font-semibold" data-admin-status={status}>{status}</span>;
}
export function UserCards({ users }: { users: AdminUser[] }) {
  return <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)]">
    <div className="theme-muted hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] gap-3 px-4 py-3 text-xs lg:grid"><span>User</span><span>Entitlement</span><span>Rollout</span><span>Activity</span></div>
    {users.map((user) => <Link key={user.id} href={`/v2/admin/users/${encodeURIComponent(user.id)}`} className="theme-card flex min-w-0 flex-col gap-3 px-4 py-4 lg:grid lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] lg:items-center">
      <div className="min-w-0"><p className="theme-text break-words text-sm font-semibold">{user.email ?? user.name ?? user.id}</p><p className="theme-muted mt-1 break-words text-xs">{user.name || "No name"} · {user.verified ? "Verified" : "Unverified"}</p><p className="theme-muted mt-1 text-xs">Joined {new Date(user.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</p></div>
      <div><StatusPill status={user.tier} />{!user.accessActive && <p className="theme-muted mt-1 text-xs">{user.entitlementStatus === "active" ? "Expired" : user.entitlementStatus}</p>}</div>
      <div><StatusPill status={user.rolloutLevel} /></div><p className="theme-muted text-xs">{activityLabel(user.lastActiveAt)}</p>
    </Link>)}
    {!users.length && <p className="theme-muted p-5 text-sm">No users match this search.</p>}
  </div>;
}
export function ActivityList({ activity, compact = false }: { activity: AdminActivity[]; compact?: boolean }) {
  return <div className="theme-card divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
    {activity.map((event, index) => <article key={event.id} className={(compact && index >= 5 ? "hidden lg:block " : "") + "p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="theme-text text-sm font-semibold">{event.action}</p><StatusPill status={event.outcome} /></div>
      <p className="theme-muted mt-2 text-xs">{new Date(event.createdAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>
      {event.actorId && <p className="theme-muted mt-1 break-all text-xs">Actor: {event.actorId}</p>}
      {event.targetId && <p className="theme-muted mt-1 break-all text-xs">User: {event.targetId}</p>}
      {event.previous && event.next && <p className="theme-text mt-2 text-xs">{event.previous.tier} / {event.previous.rolloutLevel} → {event.next.tier} / {event.next.rolloutLevel}</p>}
    </article>)}
    {!activity.length && <p className="theme-muted p-4 text-sm">No recent important activity.</p>}
  </div>;
}
