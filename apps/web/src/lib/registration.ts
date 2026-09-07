import { constantTimeEqual, hashOpaqueToken } from "./tokenSecurity.ts";

export type RegistrationMode = "open" | "access_code" | "invite" | "disabled";
export type RegistrationAccessResult =
  | { allowed: true; mode: RegistrationMode }
  | { allowed: false; status: 403; error: string; mode: RegistrationMode };

function envFlagEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function getRegistrationMode(env: NodeJS.ProcessEnv = process.env): RegistrationMode {
  if (envFlagEnabled(env.REGISTRATION_DISABLED)) return "disabled";
  const configured = env.REGISTRATION_MODE?.trim().toLowerCase();
  if (configured === "disabled" || configured === "invite" || configured === "access_code" || configured === "open") {
    return configured;
  }
  return env.REGISTRATION_ACCESS_CODE?.trim() ? "access_code" : "open";
}

export function validateRegistrationAccess(accessCode: unknown, env: NodeJS.ProcessEnv = process.env): RegistrationAccessResult {
  const mode = getRegistrationMode(env);
  if (mode === "disabled") return { allowed: false, status: 403, error: "Registration is currently closed.", mode };
  if (mode === "invite") return { allowed: true, mode };
  if (mode !== "access_code") return { allowed: true, mode };

  const requiredCode = env.REGISTRATION_ACCESS_CODE?.trim() ?? "";
  const providedCode = String(accessCode ?? "").trim();
  if (!requiredCode || !providedCode || !constantTimeEqual(hashOpaqueToken(providedCode), hashOpaqueToken(requiredCode))) {
    return { allowed: false, status: 403, error: "A valid access code is required.", mode };
  }
  return { allowed: true, mode };
}
