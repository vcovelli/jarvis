import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type SecurityTokenType = "password_reset" | "email_verification";
export type SecurityTokenRecord = {
  type: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isUsableToken(record: SecurityTokenRecord, rawToken: string, type: SecurityTokenType, now = new Date()) {
  return record.type === type
    && record.consumedAt === null
    && record.expiresAt.getTime() > now.getTime()
    && constantTimeEqual(record.tokenHash, hashOpaqueToken(rawToken));
}

export function consumeTokenRecord(record: SecurityTokenRecord, rawToken: string, type: SecurityTokenType, now = new Date()) {
  return isUsableToken(record, rawToken, type, now) ? { ...record, consumedAt: now } : null;
}
