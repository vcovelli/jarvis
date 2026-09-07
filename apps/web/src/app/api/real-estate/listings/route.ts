import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { createListingProvider } from "@/lib/realEstate/providers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = {
    zipOrCity: searchParams.get("zipOrCity") ?? "44094",
    radiusMiles: Number(searchParams.get("radiusMiles") ?? "10"),
    minPrice: Number(searchParams.get("minPrice") ?? "150000"),
    maxPrice: Number(searchParams.get("maxPrice") ?? "500000"),
    unitsMode: (searchParams.get("unitsMode") as "duplex" | "2-4" | "all") ?? "duplex",
    minBedrooms: Number(searchParams.get("minBedrooms") ?? "2"),
    maxDaysOnMarket: Number(searchParams.get("maxDaysOnMarket") ?? "120"),
    maxCashNeeded: Number(searchParams.get("maxCashNeeded") ?? "50000"),
    savedOnly: searchParams.get("savedOnly") === "true",
    hideRejected: searchParams.get("hideRejected") === "true",
  };

  const liveRequested = searchParams.get("provider") === "live";
  if (liveRequested) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized live listing request." }, { status: 401 });
    }
    const limited = enforceRateLimit(request, "realEstateLive", session.user.id);
    if (limited) return limited;
  }

  const provider = createListingProvider({
    forceDemo: !liveRequested,
  });
  const properties = await provider.searchListings(filters);

  return NextResponse.json({
    source: provider.source,
    properties,
    isDemoData: provider.source === "demo",
    generatedAt: new Date().toISOString(),
    request: provider.requestMeta,
  });
}
