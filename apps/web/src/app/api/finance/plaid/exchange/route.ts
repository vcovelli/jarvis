import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  callPlaid,
  getPlaidSetup,
  parsePlaidConnectionType,
  PlaidApiError,
  PlaidConfigError,
  PlaidLinkSessionError,
  readPlaidLinkSession,
} from "@/lib/plaid";
import { encryptSecret } from "@/lib/serverCrypto";
import { syncFinancialConnection } from "@/lib/financeSync";
import { enforceRateLimit } from "@/lib/rateLimit";

type ExchangeResponse = {
  access_token: string;
  item_id: string;
};

type PlaidMetadata = {
  institution?: {
    institution_id?: string;
    name?: string;
  };
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceRateLimit(request, "plaidLink", userId);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const publicToken = typeof body?.publicToken === "string" ? body.publicToken : "";
  const linkSession = typeof body?.linkSession === "string" ? body.linkSession : "";
  const requestedConnectionType = body?.connectionType === undefined
    ? null
    : parsePlaidConnectionType(body.connectionType);
  const metadata = body?.metadata as PlaidMetadata | undefined;
  if (!publicToken) {
    return NextResponse.json({ error: "Missing Plaid public token." }, { status: 400 });
  }
  if (!linkSession) {
    return NextResponse.json({ error: "Missing Plaid link session." }, { status: 400 });
  }
  if (body?.connectionType !== undefined && !requestedConnectionType) {
    return NextResponse.json({ error: "Invalid Plaid connection type." }, { status: 400 });
  }

  const setup = getPlaidSetup();
  try {
    const plaidLinkSession = readPlaidLinkSession(linkSession, userId);
    if (requestedConnectionType && requestedConnectionType !== plaidLinkSession.connectionType) {
      return NextResponse.json({ error: "Plaid connection type does not match link session." }, { status: 400 });
    }

    const exchange = await callPlaid<ExchangeResponse>("/item/public_token/exchange", {
      public_token: publicToken,
    });
    const connection = await prisma.financialConnection.upsert({
      where: {
        userId_provider_itemId: {
          userId,
          provider: "plaid",
          itemId: exchange.item_id,
        },
      },
      create: {
        userId,
        provider: "plaid",
        itemId: exchange.item_id,
        accessTokenEncrypted: encryptSecret(exchange.access_token),
        institutionId: metadata?.institution?.institution_id,
        institutionName: metadata?.institution?.name,
        products: plaidLinkSession.products,
        status: "active",
      },
      update: {
        accessTokenEncrypted: encryptSecret(exchange.access_token),
        institutionId: metadata?.institution?.institution_id,
        institutionName: metadata?.institution?.name,
        products: plaidLinkSession.products,
        status: "active",
      },
    });

    const sync = await syncFinancialConnection(userId, connection.id);
    await writeAuditLog({
      action: "finance.plaid_connection_added",
      userId,
      request,
      metadata: { connectionId: connection.id, institutionId: connection.institutionId, products: connection.products },
    });
    return NextResponse.json({
      connectionId: connection.id,
      connectionType: plaidLinkSession.connectionType,
      products: plaidLinkSession.products,
      sync,
    });
  } catch (error) {
    if (error instanceof PlaidLinkSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PlaidConfigError) {
      return NextResponse.json({ error: error.message, setup }, { status: error.status });
    }
    if (error instanceof PlaidApiError) {
      await writeAuditLog({ action: "finance.plaid_connection_add", outcome: "failure", userId, request, metadata: { providerStatus: error.status } });
      console.error("[plaid] connection_add_failed", { userId, providerStatus: error.status, errorType: error.name });
      return NextResponse.json({ error: "The finance provider could not connect this account." }, { status: error.status });
    }
    throw error;
  }
}
