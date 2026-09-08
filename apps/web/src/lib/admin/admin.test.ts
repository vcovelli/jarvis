import assert from "node:assert/strict";
import test from "node:test";
import { administrativeAudit, assertUserChange, canManageUsers, canViewAdmin, LAST_ACTIVE_INTERVAL_MS, needsActivityUpdate, parseUserChange, presentUser, type Actor } from "./policy.ts";
import { presentActivity } from "./activity.ts";
import { featureAllows } from "../featurePolicy.ts";
const actor = (tier: string): Actor => ({ id: "actor", entitlement: { tier, status: "active" } });
const target = { id: "target", entitlement: { tier: "INVITED", status: "active" }, configuredAdmin: false };

test("only active ADMIN and OWNER entitlements can inspect Admin; rollout grants no privilege", () => {
  assert.equal(canViewAdmin(null), false);
  for (const tier of ["FREE", "INVITED", "PRO", "USER", "BETA", "EXPERIMENTAL", "invalid"]) {
    for (const rolloutLevel of ["STABLE", "BETA", "EXPERIMENTAL"]) assert.equal(canViewAdmin({ ...actor(tier), ...{ rolloutLevel } }), false);
  }
  for (const tier of ["ADMIN", "OWNER"]) {
    assert.equal(canViewAdmin(actor(tier)), true);
    assert.equal(canViewAdmin({ id: "a", entitlement: { tier, status: "disabled" } }), false);
    assert.equal(canViewAdmin({ id: "a", entitlement: { tier, status: "active", expiresAt: new Date(0) } }), false);
  }
});
test("only OWNER can change rollout; users and admins cannot promote themselves", () => {
  for (const tier of ["FREE", "INVITED", "PRO", "ADMIN"]) {
    assert.equal(canManageUsers(actor(tier)), false);
    assert.throws(() => assertUserChange(actor(tier), target, { rolloutLevel: "EXPERIMENTAL" }, 1), /Owner access/);
    assert.throws(() => assertUserChange(actor(tier), { ...target, id: "actor" }, { tier: "OWNER" }, 1));
  }
  assert.throws(() => assertUserChange(null, target, { rolloutLevel: "BETA" }, 1), /Sign in/);
  assert.doesNotThrow(() => assertUserChange(actor("OWNER"), target, { rolloutLevel: "BETA" }, 1));
  assert.doesNotThrow(() => assertUserChange(actor("OWNER"), { ...target, id: "actor" }, { rolloutLevel: "EXPERIMENTAL" }, 1));
  assert.throws(() => assertUserChange(actor("OWNER"), { ...target, id: "actor" }, { tier: "FREE" }, 1), /own entitlement/);
});
test("owner safety protects final owner, configured access, and inactive promotions", () => {
  assert.throws(() => assertUserChange(actor("OWNER"), { ...target, entitlement: { tier: "OWNER", status: "active" } }, { tier: "ADMIN" }, 1), /at least one/);
  assert.throws(() => assertUserChange(actor("OWNER"), { ...target, configuredAdmin: true }, { tier: "FREE" }, 1), /server configuration/);
  assert.throws(() => assertUserChange(actor("OWNER"), { ...target, entitlement: { tier: "FREE", status: "disabled" } }, { tier: "OWNER" }, 1), /inactive or expired/);
});
test("expiring entitlements cannot become an owner", () => {
  assert.throws(() => assertUserChange(actor("OWNER"), { ...target, entitlement: { tier: "ADMIN", status: "active", expiresAt: new Date(Date.now() + 86400000) } }, { tier: "OWNER" }, 1), /non-expiring/);
});
test("admin mutation rejects role injection, unknown fields, empty and invalid rollout/tier values", () => {
  for (const value of [null, [], {}, { role: "OWNER" }, { rolloutLevel: "ADMIN" }, { rolloutLevel: null }, { tier: "owner" }, { tier: "ADMIN", userId: "other" }, { passwordHash: "bad" }, { status: "active" }]) assert.throws(() => parseUserChange(value));
  assert.deepEqual(parseUserChange({ rolloutLevel: "BETA", tier: "INVITED" }), { rolloutLevel: "BETA", tier: "INVITED" });
});
test("user output allowlists fields and never returns secrets or entitlement metadata", () => {
  const record = { id: "user", name: "User", email: "user@example.test", emailVerified: null, createdAt: new Date(0), lastActiveAt: null, rolloutLevel: "STABLE" as const, entitlement: null, passwordHash: "SECRET", accounts: [{ token: "SECRET" }], financialConnections: [{ accessTokenEncrypted: "SECRET" }] };
  const result = presentUser(record, { tier: "INVITED", status: "active", ...{ metadata: { apiKey: "SECRET" } } });
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
  assert.deepEqual(Object.keys(result).sort(), ["id", "name", "email", "verified", "createdAt", "lastActiveAt", "rolloutLevel", "tier", "entitlementStatus", "expiresAt", "accessActive", "configuredAdmin"].sort());
});
test("feature stages follow rollout order, while OFF and unknown values fail closed", () => {
  const matrix = { STABLE: [true, false, false, false], BETA: [true, true, false, false], EXPERIMENTAL: [true, true, true, false] };
  for (const [rollout, expected] of Object.entries(matrix)) for (const [i, stage] of ["STABLE", "BETA", "EXPERIMENTAL", "OFF"].entries()) assert.equal(featureAllows(rollout, stage), expected[i]);
  for (const value of [undefined, "OWNER", "ADMIN", "unknown", "__proto__"]) { assert.equal(featureAllows(value, "STABLE"), false); assert.equal(featureAllows("EXPERIMENTAL", value), false); }
});
test("rollout/access audit records actor, target, previous, next; activity drops raw metadata", () => {
  const previous = { tier: "INVITED", rolloutLevel: "STABLE" }, next = { tier: "INVITED", rolloutLevel: "BETA" };
  const audit = administrativeAudit("owner", "user", previous, next);
  assert.deepEqual(audit.metadata, { actorUserId: "owner", targetUserId: "user", previous, next });
  const projected = presentActivity({ ...audit, id: "event", createdAt: new Date(0), metadata: { ...audit.metadata, token: "SECRET", ipAddress: "SECRET", raw: "SECRET" } });
  assert.equal(projected.actorId, "owner"); assert.equal(projected.targetId, "user"); assert.deepEqual(projected.previous, previous); assert.deepEqual(projected.next, next); assert.equal(JSON.stringify(projected).includes("SECRET"), false);
});
test("last active updates at most once per fifteen-minute window", () => {
  const now = new Date(2 * LAST_ACTIVE_INTERVAL_MS);
  assert.equal(needsActivityUpdate(null, now), true);
  assert.equal(needsActivityUpdate(new Date(now.getTime() - LAST_ACTIVE_INTERVAL_MS + 1), now), false);
  assert.equal(needsActivityUpdate(new Date(now.getTime() - LAST_ACTIVE_INTERVAL_MS), now), true);
});
