import { NextResponse } from "next/server";

import { getClientIp, opaqueIdentifier } from "./requestSecurity";
import { MemoryRateLimitStore, type RateLimitConfig, type RateLimitStore } from "./rateLimitStore";

export { MemoryRateLimitStore } from "./rateLimitStore";
export type { RateLimitConfig, RateLimitResult, RateLimitStore } from "./rateLimitStore";

export type RateLimitProfile =
  | "login"
  | "registration"
  | "passwordChange"
  | "passwordResetRequest"
  | "passwordResetComplete"
  | "emailVerification"
  | "assistant"
  | "transcription"
  | "financeSync"
  | "plaidLink"
  | "realEstateLive"
  | "internalJob";

const defaults: Record<RateLimitProfile, RateLimitConfig> = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  registration: { limit: 5, windowMs: 60 * 60_000 },
  passwordChange: { limit: 5, windowMs: 15 * 60_000 },
  passwordResetRequest: { limit: 5, windowMs: 60 * 60_000 },
  passwordResetComplete: { limit: 8, windowMs: 60 * 60_000 },
  emailVerification: { limit: 10, windowMs: 60 * 60_000 },
  assistant: { limit: 30, windowMs: 60_000 },
  transcription: { limit: 10, windowMs: 10 * 60_000 },
  financeSync: { limit: 6, windowMs: 10 * 60_000 },
  plaidLink: { limit: 10, windowMs: 10 * 60_000 },
  realEstateLive: { limit: 10, windowMs: 60 * 60_000 },
  internalJob: { limit: 5, windowMs: 60_000 },
};

const globalRateLimit = globalThis as unknown as { jarvisRateLimitStore?: MemoryRateLimitStore };
const defaultStore = globalRateLimit.jarvisRateLimitStore ?? new MemoryRateLimitStore();
if (process.env.NODE_ENV !== "production") globalRateLimit.jarvisRateLimitStore = defaultStore;

function envName(profile: RateLimitProfile) {
  return profile.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

export function getRateLimitConfig(profile: RateLimitProfile): RateLimitConfig {
  const prefix = `RATE_LIMIT_${envName(profile)}`;
  const limit = Number(process.env[`${prefix}_MAX`]);
  const windowSeconds = Number(process.env[`${prefix}_WINDOW_SECONDS`]);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : defaults[profile].limit,
    windowMs: Number.isFinite(windowSeconds) && windowSeconds > 0 ? Math.floor(windowSeconds * 1000) : defaults[profile].windowMs,
  };
}

export function consumeRateLimit(profile: RateLimitProfile, identifier: string, store: RateLimitStore = defaultStore, now = Date.now()) {
  return store.consume(`${profile}:${opaqueIdentifier(identifier)}`, getRateLimitConfig(profile), now);
}

export function enforceRateLimit(request: Request, profile: RateLimitProfile, userId?: string) {
  if (process.env.NODE_ENV !== "production" && process.env.RATE_LIMIT_DISABLED?.toLowerCase() === "true") return null;
  const identifiers = [`ip:${getClientIp(request)}`];
  if (userId) identifiers.push(`user:${userId}`);
  for (const identifier of identifiers) {
    const result = consumeRateLimit(profile, identifier);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
          },
        },
      );
    }
  }
  return null;
}
