import { loadLocalEnv } from "./load-env.mjs";

loadLocalEnv();

const forceProduction = process.argv.includes("--production");
const production = forceProduction || process.env.NODE_ENV === "production";
const errors = [];
const required = ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET"];
for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required`);
}
try {
  if (process.env.NEXTAUTH_URL) {
    const authUrl = new URL(process.env.NEXTAUTH_URL);
    if (production && authUrl.protocol !== "https:") errors.push("NEXTAUTH_URL must use HTTPS in production");
  }
} catch {
  errors.push("NEXTAUTH_URL must be an absolute URL");
}
if (production && (process.env.NEXTAUTH_SECRET?.length ?? 0) < 32) errors.push("NEXTAUTH_SECRET must be at least 32 characters in production");
if (!process.env.FINANCIAL_DATA_KEY && !process.env.NEXTAUTH_SECRET) errors.push("FINANCIAL_DATA_KEY or NEXTAUTH_SECRET is required");
if (process.env.EMAIL_VERIFICATION_REQUIRED === "true" && (!process.env.EMAIL_WEBHOOK_URL || !process.env.EMAIL_FROM)) {
  errors.push("EMAIL_WEBHOOK_URL and EMAIL_FROM are required when email verification is enforced");
}
if (process.env.REGISTRATION_MODE === "access_code" && !process.env.REGISTRATION_ACCESS_CODE) errors.push("REGISTRATION_ACCESS_CODE is required in access_code mode");
if (process.env.REGISTRATION_MODE && !["open", "access_code", "invite", "disabled"].includes(process.env.REGISTRATION_MODE)) {
  errors.push("REGISTRATION_MODE must be open, access_code, invite, or disabled");
}
if (process.env.PLAID_ENV === "production" && (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET || !process.env.FINANCIAL_DATA_KEY)) {
  errors.push("PLAID_CLIENT_ID, PLAID_SECRET, and FINANCIAL_DATA_KEY are required for production Plaid");
}
if (errors.length) {
  for (const error of errors) console.error(`[config] ${error}`);
  process.exit(1);
}
console.log(`[config] ${production ? "production" : "development"} environment is valid`);
