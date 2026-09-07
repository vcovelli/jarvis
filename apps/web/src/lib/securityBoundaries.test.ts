import assert from "node:assert/strict";
import test from "node:test";

import { getAuthenticatedUserId, ownedWhere } from "./authBoundary.ts";
import { entitlementAllows } from "./entitlementPolicy.ts";
import { getCoreConfigChecks } from "./env.ts";
import { sanitizePortableExport } from "./exportSecurity.ts";

test("account deletion, export, and finance auth reject missing sessions", () => {
  assert.equal(getAuthenticatedUserId(null), null);
  assert.equal(getAuthenticatedUserId({ user: null }), null);
  assert.equal(getAuthenticatedUserId({ user: { id: "user-a" } }), "user-a");
});

test("Plaid connection lookups require both connection and authenticated owner", () => {
  assert.deepEqual(ownedWhere("user-a", "connection-b"), { id: "connection-b", userId: "user-a" });
  assert.notDeepEqual(ownedWhere("user-b", "connection-b"), ownedWhere("user-a", "connection-b"));
});

test("portable export excludes credentials, raw provider data, and secrets", () => {
  const result = sanitizePortableExport({ id: "u1", passwordHash: "bad", accessTokenEncrypted: "bad", raw: { account_id: "provider" }, nested: { apiKey: "bad", safe: "ok" } });
  assert.deepEqual(result, { id: "u1", nested: { safe: "ok" } });
});

test("entitlement defaults preserve invited access and enforce status/expiry", () => {
  assert.equal(entitlementAllows({ tier: undefined, status: "active" }, "INVITED"), true);
  assert.equal(entitlementAllows({ tier: "FREE", status: "active" }, "PRO"), false);
  assert.equal(entitlementAllows({ tier: "ADMIN", status: "disabled" }, "FREE"), false);
  assert.equal(entitlementAllows({ tier: "PRO", status: "active", expiresAt: new Date(0) }, "FREE"), false);
});

test("readiness configuration reports missing required values without values", () => {
  const missing = getCoreConfigChecks({ NODE_ENV: "production" });
  assert.equal(missing.database.ok, false);
  assert.equal(missing.authSecret.ok, false);
  const ready = getCoreConfigChecks({ NODE_ENV: "production", DATABASE_URL: "postgres://db", NEXTAUTH_URL: "https://jarvis.example", NEXTAUTH_SECRET: "x".repeat(32) });
  assert.equal(Object.values(ready).every((item) => item.ok), true);
});
