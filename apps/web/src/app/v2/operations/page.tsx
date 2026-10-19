import { requireAdminPage } from "@/lib/admin/access";
import OperationsClient from "./OperationsClient";
export const dynamic = "force-dynamic";
export default async function OperationsPage() {
  await requireAdminPage();
  return <OperationsClient />;
}
