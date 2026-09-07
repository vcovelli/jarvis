import { createHash, createPublicKey, verify, type JsonWebKey as NodeJsonWebKey } from "node:crypto";

import { callPlaid } from "@/lib/plaid";
import { constantTimeEqual } from "@/lib/tokenSecurity";

type PlaidVerificationKey = NodeJsonWebKey & { created_at?: number; expired_at?: number };
type VerificationKeyResponse = { key?: PlaidVerificationKey };
type JwtHeader = { alg?: string; kid?: string };
type JwtPayload = { iat?: number; request_body_sha256?: string };

const keyCache = new Map<string, { key: PlaidVerificationKey; cachedAt: number }>();

export async function verifyPlaidWebhook(rawBody: string, verificationJwt: string | null) {
  if (!verificationJwt) return { valid: false as const, error: "Missing Plaid-Verification header." };
  const parts = verificationJwt.split(".");
  if (parts.length !== 3) return { valid: false as const, error: "Malformed verification JWT." };
  const header = decodeJwtPart<JwtHeader>(parts[0]);
  const payload = decodeJwtPart<JwtPayload>(parts[1]);
  if (!header || header.alg !== "ES256" || !header.kid || !payload?.request_body_sha256 || !payload.iat) {
    return { valid: false as const, error: "Invalid verification JWT claims." };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.iat > nowSeconds + 30 || nowSeconds - payload.iat > 5 * 60) {
    return { valid: false as const, error: "Verification JWT is outside the allowed time window." };
  }

  const key = await getVerificationKey(header.kid);
  if (!key || key.alg !== "ES256" || key.kty !== "EC" || key.crv !== "P-256") {
    return { valid: false as const, error: "Plaid verification key is invalid." };
  }
  if (key.expired_at && key.expired_at <= nowSeconds) return { valid: false as const, error: "Plaid verification key is expired." };

  const signature = base64UrlToBuffer(parts[2]);
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const publicKey = createPublicKey({ key, format: "jwk" });
  if (!verify("sha256", signed, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature)) {
    return { valid: false as const, error: "Plaid webhook signature is invalid." };
  }

  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  if (!constantTimeEqual(bodyHash, payload.request_body_sha256)) {
    return { valid: false as const, error: "Plaid webhook body hash does not match." };
  }
  return {
    valid: true as const,
    // Plaid may sign a retry with a fresh JWT. The verified exact body hash is
    // stable across retries and is therefore the durable idempotency key.
    eventKey: bodyHash,
    bodyHash,
  };
}

async function getVerificationKey(kid: string) {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.cachedAt < 60 * 60_000) return cached.key;
  const response = await callPlaid<VerificationKeyResponse>("/webhook_verification_key/get", { key_id: kid });
  if (!response.key) return null;
  keyCache.set(kid, { key: response.key, cachedAt: Date.now() });
  return response.key;
}

function decodeJwtPart<T>(part: string): T | null {
  try {
    return JSON.parse(base64UrlToBuffer(part).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function base64UrlToBuffer(value: string) {
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64");
}
