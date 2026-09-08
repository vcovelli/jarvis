import Link from "next/link";
import { AdminShell, UserCards } from "@/components/admin/AdminUI";
import { requireAdminPage } from "@/lib/admin/access";
import { listAdminUsers } from "@/lib/admin/users";
export const dynamic = "force-dynamic";
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdminPage();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const result = await listAdminUsers(q, Number(query.page ?? 1));
  const href = (page: number) => `/v2/admin/users?${new URLSearchParams({ q, page: String(page) })}`;
  return <AdminShell title="Users">
    <form action="/v2/admin/users" className="flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Search users</span><input name="q" defaultValue={q} maxLength={120} placeholder="Email, name, or user ID" className="theme-input w-full rounded-xl px-4 py-3 text-base" /></label><button className="theme-button-primary rounded-xl px-4 py-3 text-sm">Search</button></form>
    <p className="theme-muted text-sm">{result.total} users · Select a user to view access and rollout.</p><UserCards users={result.users} />
    <div className="theme-muted flex flex-wrap items-center justify-between gap-3 text-sm">{result.page > 1 && <Link className="theme-button-secondary rounded-xl px-4 py-3" href={href(result.page - 1)}>Previous</Link>}<span>Page {result.page} of {result.pages}</span>{result.page < result.pages && <Link className="theme-button-secondary rounded-xl px-4 py-3" href={href(result.page + 1)}>Next</Link>}</div>
  </AdminShell>;
}
