import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";

const handler = NextAuth(authOptions);

export { handler as GET };

type AuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

export async function POST(request: NextRequest, context: AuthRouteContext) {
  if (request.nextUrl.pathname.endsWith("/callback/credentials")) {
    const limited = enforceRateLimit(request, "login");
    if (limited) return limited;
  }
  return handler(request, context);
}
