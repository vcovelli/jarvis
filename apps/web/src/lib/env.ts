export type RuntimeEnvironment = Record<string, string | undefined>;

export type ConfigCheck = { ok: boolean; required: boolean; message?: string };

export function getCoreConfigChecks(env: RuntimeEnvironment = process.env): Record<string, ConfigCheck> {
  const production = env.NODE_ENV === "production";
  const secret = env.NEXTAUTH_SECRET?.trim() ?? "";
  const authUrl = env.NEXTAUTH_URL?.trim() ?? "";
  let authUrlValid = Boolean(authUrl);
  try {
    if (authUrl) {
      const parsed = new URL(authUrl);
      if (production && parsed.protocol !== "https:") authUrlValid = false;
    }
  } catch {
    authUrlValid = false;
  }
  return {
    database: { ok: Boolean(env.DATABASE_URL?.trim()), required: true, message: "DATABASE_URL is required." },
    authUrl: { ok: authUrlValid, required: true, message: "NEXTAUTH_URL must be a valid absolute URL." },
    authSecret: {
      ok: Boolean(secret) && (!production || secret.length >= 32),
      required: true,
      message: production ? "NEXTAUTH_SECRET must contain at least 32 characters." : "NEXTAUTH_SECRET is required.",
    },
    financeEncryption: {
      ok: Boolean(env.FINANCIAL_DATA_KEY?.trim() || secret),
      required: true,
      message: "FINANCIAL_DATA_KEY or NEXTAUTH_SECRET is required for financial secret encryption.",
    },
    emailDelivery: {
      ok: env.EMAIL_VERIFICATION_REQUIRED?.toLowerCase() !== "true" || Boolean(env.EMAIL_WEBHOOK_URL?.trim() && env.EMAIL_FROM?.trim()),
      required: env.EMAIL_VERIFICATION_REQUIRED?.toLowerCase() === "true",
      message: "EMAIL_WEBHOOK_URL and EMAIL_FROM are required when email verification is enforced.",
    },
    registrationGate: {
      ok: !env.REGISTRATION_MODE
        || (["open", "access_code", "invite", "disabled"].includes(env.REGISTRATION_MODE)
          && (env.REGISTRATION_MODE !== "access_code" || Boolean(env.REGISTRATION_ACCESS_CODE?.trim()))),
      required: Boolean(env.REGISTRATION_MODE),
      message: "REGISTRATION_MODE must be valid and access_code mode requires REGISTRATION_ACCESS_CODE.",
    },
    plaidProduction: {
      ok: env.PLAID_ENV !== "production"
        || Boolean(env.PLAID_CLIENT_ID?.trim() && env.PLAID_SECRET?.trim() && env.FINANCIAL_DATA_KEY?.trim()),
      required: env.PLAID_ENV === "production",
      message: "PLAID_CLIENT_ID, PLAID_SECRET, and FINANCIAL_DATA_KEY are required for production Plaid.",
    },
  };
}

export function getConfigErrors(env: RuntimeEnvironment = process.env) {
  return Object.entries(getCoreConfigChecks(env))
    .filter(([, check]) => check.required && !check.ok)
    .map(([name, check]) => `${name}: ${check.message ?? "invalid"}`);
}

export function assertProductionEnvironment(env: RuntimeEnvironment = process.env) {
  if (env.NODE_ENV !== "production") return;
  const errors = getConfigErrors(env);
  if (errors.length) throw new Error(`[config] invalid production environment: ${errors.join(" ")}`);
}
