import assert from "node:assert/strict";
import test from "node:test";

import { consumeTokenRecord, createOpaqueToken, hashOpaqueToken, isUsableToken } from "./tokenSecurity.ts";

test("password-reset token is hashed, expires, and cannot be reused", () => {
  const raw = createOpaqueToken();
  const now = new Date("2026-09-07T00:00:00Z");
  const record = { type: "password_reset", tokenHash: hashOpaqueToken(raw), expiresAt: new Date(now.getTime() + 1000), consumedAt: null };
  assert.equal(isUsableToken(record, raw, "password_reset", now), true);
  const consumed = consumeTokenRecord(record, raw, "password_reset", now);
  assert.ok(consumed?.consumedAt);
  assert.equal(consumeTokenRecord(consumed!, raw, "password_reset", now), null);
  assert.equal(isUsableToken(record, raw, "password_reset", new Date(now.getTime() + 1001)), false);
});

test("email-verification tokens cannot be used as password-reset tokens", () => {
  const raw = createOpaqueToken();
  const record = { type: "email_verification", tokenHash: hashOpaqueToken(raw), expiresAt: new Date(Date.now() + 1000), consumedAt: null };
  assert.equal(isUsableToken(record, raw, "email_verification"), true);
  assert.equal(isUsableToken(record, raw, "password_reset"), false);
});
