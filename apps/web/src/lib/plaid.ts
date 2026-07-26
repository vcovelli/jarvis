const PLAID_HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

type PlaidEnvironment = keyof typeof PLAID_HOSTS;

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
    products: parseCsv(process.env.PLAID_PRODUCTS, ["transactions", "investments"]),
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
