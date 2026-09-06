export type RegistrationAccessResult =
  | { allowed: true }
  | { allowed: false; status: 403; error: string };

function envFlagEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function validateRegistrationAccess(accessCode: unknown): RegistrationAccessResult {
  if (envFlagEnabled(process.env.REGISTRATION_DISABLED)) {
    return { allowed: false, status: 403, error: "Registration is currently closed." };
  }

  const requiredCode = process.env.REGISTRATION_ACCESS_CODE?.trim();
  if (!requiredCode) {
    return { allowed: true };
  }

  const providedCode = String(accessCode ?? "").trim();
  if (providedCode !== requiredCode) {
    return { allowed: false, status: 403, error: "A valid access code is required." };
  }

  return { allowed: true };
}
