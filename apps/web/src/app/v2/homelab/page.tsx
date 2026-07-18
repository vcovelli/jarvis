import { HomelabConsoleClient } from "@/app/v2/homelab/HomelabConsoleClient";
import { getFreshHomelabSnapshot } from "@/lib/homelabDocs";

export const dynamic = "force-dynamic";

export default async function HomelabPage() {
  const snapshot = await getFreshHomelabSnapshot();
  return <HomelabConsoleClient initialSnapshot={snapshot} />;
}
