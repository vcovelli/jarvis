import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  callPlaid,
  createPlaidLinkSession,
  getPlaidProductsForConnectionType,
  getPlaidSetup,
  parsePlaidConnectionType,
  PlaidApiError,
  PlaidConfigError,
} from "@/lib/plaid";

type LinkTokenResponse = {
  link_token: string;
  expiration: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const connectionType = parsePlaidConnectionType(body?.connectionType);
  if (!connectionType) {
    return NextResponse.json({ error: "Invalid Plaid connection type." }, { status: 400 });
  }

  const setup = getPlaidSetup();
  if (!setup.configured) {
    return NextResponse.json({ error: "Plaid is not configured.", setup }, { status: 501 });
  }

  const products = getPlaidProductsForConnectionType(connectionType);

  try {
    const data = await callPlaid<LinkTokenResponse>("/link/token/create", {
      client_name: "Jarvis",
      user: { client_user_id: userId },
      products,
      country_codes: setup.countryCodes,
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });
    const linkSession = createPlaidLinkSession({
      userId,
      connectionType,
      products,
      expiresAt: data.expiration,
    });
    return NextResponse.json({
      linkToken: data.link_token,
      expiration: data.expiration,
      connectionType,
      products,
      linkSession,
      setup,
    });
  } catch (error) {
    if (error instanceof PlaidConfigError) {
      return NextResponse.json({ error: error.message, setup }, { status: error.status });
    }
    if (error instanceof PlaidApiError) {
      return NextResponse.json({ error: error.message, payload: error.payload }, { status: error.status });
    }
    throw error;
  }
}
