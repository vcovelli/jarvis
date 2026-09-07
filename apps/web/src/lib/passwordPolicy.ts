export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: unknown) {
  const value = typeof password === "string" ? password : "";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { valid: false as const, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (value.length > 256) {
    return { valid: false as const, error: "Password is too long." };
  }
  return { valid: true as const, value };
}
