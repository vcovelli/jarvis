import "server-only";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getUserEntitlement } from "@/lib/entitlements";
import { AdminError, canViewAdmin, type Actor } from "./policy";

export async function requireAdmin(): Promise<Actor> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new AdminError(401, "Sign in required.");
  const actor = { id: session.user.id, entitlement: await getUserEntitlement(session.user.id) };
  if (!canViewAdmin(actor)) throw new AdminError(403, "Admin access required.");
  return actor;
}
export async function requireAdminPage() {
  try { return await requireAdmin(); } catch (error) {
    if (error instanceof AdminError && error.status === 401) redirect("/login");
    if (error instanceof AdminError && error.status === 403) notFound();
    throw error;
  }
}
