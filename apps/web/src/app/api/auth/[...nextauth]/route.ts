import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";

const handler = NextAuth(authOptions);

export { handler as GET };

export async function POST(request: Request) {
  if (new URL(request.url).pathname.endsWith("/callback/credentials")) {
    const limited = enforceRateLimit(request, "login");
    if (limited) return limited;
  }
  return handler(request);
}
