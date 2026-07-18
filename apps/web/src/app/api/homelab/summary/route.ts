import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getFreshHomelabSnapshot } from "@/lib/homelabDocs";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getFreshHomelabSnapshot();
  const activeServices = snapshot.services.filter((service) => service.status === "active").length;

  return NextResponse.json(
    {
      generatedAt: snapshot.generatedAt,
      services: {
        active: activeServices,
        total: snapshot.services.length,
      },
      storage: snapshot.system.rootFilesystem,
      attention: snapshot.attention.slice(0, 3),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
