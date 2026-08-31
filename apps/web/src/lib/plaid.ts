import { decryptSecret, encryptSecret } from "@/lib/serverCrypto";

const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

const PLAID_CONNECTION_PRODUCTS = {
  bank: ["transactions"],
  investment: ["transactions", "investments"],
} as const;

const PLAID_LINK_SESSION_VERSION = "v1";

type PlaidEnvironment = keyof typeof PLAID_HOSTS;
export type PlaidConnectionType = keyof typeof PLAID_CONNECTION_PRODUCTS;

type PlaidLinkSession = {
  version: typeof PLAID_LINK_SESSION_VERSION;
  userId: string;
  connectionType: PlaidConnectionType;
  products: string[];
  expiresAt: string;
};

export class PlaidConfigError extends Error {
  status = 501;
}

export class PlaidApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
  }
}

export class PlaidLinkSessionError extends Error {
  status = 400;
}

export function parsePlaidConnectionType(value: unknown): PlaidConnectionType | null {
  return value === "bank" || value === "investment" ? value : null;
}

export function getPlaidProductsForConnectionType(connectionType: PlaidConnectionType) {
  return [...PLAID_CONNECTION_PRODUCTS[connectionType]];
}

export function getSupportedPlaidProducts() {
  return Array.from(new Set(Object.values(PLAID_CONNECTION_PRODUCTS).flat()));
}

function getPlaidEnvironment(): PlaidEnvironment {
  const value = process.env.PLAID_ENV?.toLowerCase();
  if (value === "development" || value === "production") return value;
  return "sandbox";
}

function parseCsv(value: string | undefined, fallback: string[]) {
  const parsed = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed?.length ? parsed : fallback;
}

export function getPlaidSetup() {
  const environment = getPlaidEnvironment();
  const missing = [
    ["PLAID_CLIENT_ID", process.env.PLAID_CLIENT_ID],
    ["PLAID_SECRET", process.env.PLAID_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    configured: missing.length === 0,
    environment,
    host: PLAID_HOSTS[environment],
    products: getSupportedPlaidProducts(),
    connectionTypes: Object.keys(PLAID_CONNECTION_PRODUCTS) as PlaidConnectionType[],
    countryCodes: parseCsv(process.env.PLAID_COUNTRY_CODES, ["US"]),
    missing,
  };
}

function getPlaidCredentials() {
  const setup = getPlaidSetup();
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!setup.configured || !clientId || !secret) {
    throw new PlaidConfigError(`Plaid is not configured. Missing: ${setup.missing.join(", ")}`);
  }
  return { ...setup, clientId, secret };
}

export function createPlaidLinkSession({
  userId,
  connectionType,
  products,
  expiresAt,
}: {
  userId: string;
  connectionType: PlaidConnectionType;
  products: string[];
  expiresAt: string;
}) {
  const session: PlaidLinkSession = {
    version: PLAID_LINK_SESSION_VERSION,
    userId,
    connectionType,
    products,
    expiresAt,
  };
  return encryptSecret(JSON.stringify(session));
}

export function readPlaidLinkSession(payload: string, userId: string) {
  let session: unknown;
  try {
    session = JSON.parse(decryptSecret(payload));
  } catch {
    throw new PlaidLinkSessionError("Invalid Plaid link session.");
  }

  if (!session || typeof session !== "object") {
    throw new PlaidLinkSessionError("Invalid Plaid link session.");
  }

  const record = session as Record<string, unknown>;
  const connectionType = parsePlaidConnectionType(record.connectionType);
  const products = Array.isArray(record.products)
    ? record.products.filter((product): product is string => typeof product === "string")
    : [];
  const expectedProducts = connectionType ? getPlaidProductsForConnectionType(connectionType) : [];
  const expiresAt = typeof record.expiresAt === "string" ? record.expiresAt : "";
  const expiresAtMs = new Date(expiresAt).getTime();

  if (
    record.version !== PLAID_LINK_SESSION_VERSION ||
    record.userId !== userId ||
    !connectionType ||
    products.length !== (Array.isArray(record.products) ? record.products.length : -1) ||
    !sameProducts(products, expectedProducts) ||
    Number.isNaN(expiresAtMs)
  ) {
    throw new PlaidLinkSessionError("Invalid Plaid link session.");
  }

  if (expiresAtMs <= Date.now()) {
    throw new PlaidLinkSessionError("Expired Plaid link session.");
  }

  return {
    connectionType,
    products,
    expiresAt,
  };
}

function sameProducts(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

export async function callPlaid<T>(path: string, body: Record<string, unknown>) {
  const config = getPlaidCredentials();
  const response = await fetch(`${config.host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      ...body,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data?.error_message === "string"
        ? data.error_message
        : `Plaid request failed with ${response.status}`;
    throw new PlaidApiError(message, response.status, data);
  }
  return data as T;
}
