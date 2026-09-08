// Run only against an isolated test database and a local Next.js test server.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { loadLocalEnv } from "./load-env.mjs";
loadLocalEnv();
const db = new URL(process.env.DATABASE_URL || "http://invalid");
const base = process.env.ADMIN_TEST_BASE_URL;
if (process.env.ADMIN_TEST_ISOLATED !== "1" || !base || !["127.0.0.1", "localhost"].includes(db.hostname) || db.pathname !== "/jarvis_admin_test" || !["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Use only the disposable jarvis_admin_test database and a local test server with ADMIN_TEST_ISOLATED=1.");
const prisma = new PrismaClient();
const password = "Isolated-test-password-123";
const ids = Object.fromEntries(["owner", "owner2", "admin", "stable", "beta", "experimental", "target", "expired", "disabled", "configured"].map((name) => [name, `admin-test-${name}`]));
let checks = 0;
const tokens = {};
async function request(name, path, options = {}) {
  const response = await fetch(base + path, { redirect: "manual", ...options, headers: { ...(name ? { Cookie: `next-auth.session-token=${tokens[name]}` } : {}), ...options.headers } });
  checks++;
  return response;
}
async function patch(name, target, body, origin = base) {
  return request(name, `/api/admin/users/${ids[target]}`, { method: "PATCH", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
try {
  await prisma.user.deleteMany({ where: { id: { startsWith: "admin-test-" } } });
  const hash = await bcrypt.hash(password, 4);
  for (const [name, id] of Object.entries(ids)) {
    await prisma.user.create({ data: { id, email: `${name}@example.test`, name: `Test ${name}`, passwordHash: hash,
      rolloutLevel: name === "beta" ? "BETA" : name === "experimental" ? "EXPERIMENTAL" : "STABLE",
      entitlement: { create: { tier: ["admin", "expired", "disabled"].includes(name) ? "ADMIN" : "INVITED", status: name === "disabled" ? "disabled" : "active", expiresAt: name === "expired" ? new Date(0) : null, metadata: { apiKey: "PRIVATE_METADATA_MARKER" } } },
    } });
    tokens[name] = await encode({ token: { id, sub: id, email: `${name}@example.test`, sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 });
  }
  execFileSync(process.execPath, ["scripts/bootstrap-owner.mjs", `--user-id=${ids.owner}`], { stdio: "pipe" });
  assert.equal((await prisma.entitlement.findUnique({ where: { userId: ids.owner } })).tier, "OWNER");
  assert.throws(() => execFileSync(process.execPath, ["scripts/bootstrap-owner.mjs", `--user-id=${ids.owner2}`], { stdio: "pipe" }));
  console.log("PASS: first-owner bootstrap is explicit and cannot run twice.");
  const paths = ["/api/admin/overview", "/api/admin/users", "/api/admin/activity", `/api/admin/users/${ids.target}`];
  for (const path of paths) {
    assert.equal((await request(null, path)).status, 401, path);
    for (const name of ["stable", "beta", "experimental", "expired", "disabled"]) assert.equal((await request(name, path)).status, 403, `${name} ${path}`);
    for (const name of ["admin", "owner"]) assert.equal((await request(name, path)).status, 200, `${name} ${path}`);
  }
  for (const name of [null, "stable", "beta", "experimental", "admin"]) {
    assert.equal((await patch(name, "target", { rolloutLevel: "EXPERIMENTAL" })).status, name ? 403 : 401);
    assert.equal((await patch(name, name || "target", { tier: "OWNER" })).status, name ? 403 : 401);
  }
  assert.equal((await patch("owner", "owner", { tier: "ADMIN" })).status, 403);
  assert.equal((await patch("owner", "target", { role: "OWNER" })).status, 400);
  assert.equal((await patch("owner", "target", { rolloutLevel: "ADMIN" })).status, 400);
  assert.equal((await patch("owner", "target", { rolloutLevel: "BETA", actorId: ids.owner })).status, 400);
  assert.equal((await patch("owner", "target", { rolloutLevel: "BETA" }, "https://wrong.example")).status, 403);
  assert.equal((await patch("owner", "target", { rolloutLevel: "BETA" })).status, 200);
  const changed = await prisma.user.findUnique({ where: { id: ids.target } });
  assert.equal(changed.rolloutLevel, "BETA");
  const audit = await prisma.auditLog.findFirst({ where: { action: "admin.user_access_changed", userId: ids.owner }, orderBy: { createdAt: "desc" } });
  assert.deepEqual(audit.metadata, { actorUserId: ids.owner, targetUserId: ids.target, previous: { tier: "INVITED", rolloutLevel: "STABLE" }, next: { tier: "INVITED", rolloutLevel: "BETA" } });
  if (process.env.JARVIS_ADMIN_EMAILS?.includes("configured@example.test")) {
    assert.equal((await request("configured", "/api/admin/overview")).status, 200);
    assert.equal((await patch("owner", "configured", { tier: "FREE" })).status, 409);
    assert.equal((await patch("configured", "target", { rolloutLevel: "EXPERIMENTAL" })).status, 403);
    const forgedEmail = await encode({ token: { id: ids.stable, sub: ids.stable, email: "configured@example.test", sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET, maxAge: 3600 });
    const spoof = await fetch(base + "/api/admin/overview", { headers: { Cookie: `next-auth.session-token=${forgedEmail}` } });
    assert.equal(spoof.status, 403);
    checks += 1;
  }
  // Force audit failure in the disposable DB: the access change must roll back.
  await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_admin_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'admin.user_access_changed' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_admin_test_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_admin_test_audit()`);
  assert.equal((await patch("owner", "target", { rolloutLevel: "EXPERIMENTAL" })).status, 503);
  assert.equal((await prisma.user.findUnique({ where: { id: ids.target } })).rolloutLevel, "BETA");
  await prisma.$executeRawUnsafe('DROP TRIGGER reject_admin_test_audit ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION reject_admin_test_audit()');
  console.log("PASS: API authorization, escalation/CSRF validation, rollout writes, and atomic audit rollback.");
  for (const path of ["/api/admin/users", `/api/admin/users/${ids.owner}`, "/api/admin/activity", "/api/admin/overview"]) {
    const text = await (await request("owner", path)).text();
    for (const forbidden of [hash, "PRIVATE_METADATA_MARKER", "passwordHash", "accessTokenEncrypted", "tokenHash", "ipAddress", "userAgent", "stack"]) assert.equal(text.includes(forbidden), false, `${path} leaked ${forbidden}`);
  }
  await request("target", "/api/auth/session");
  const activeAt = (await prisma.user.findUnique({ where: { id: ids.target } })).lastActiveAt;
  assert.ok(activeAt);
  await request("target", "/api/auth/session");
  assert.equal((await prisma.user.findUnique({ where: { id: ids.target } })).lastActiveAt.getTime(), activeAt.getTime());
  assert.equal((await request("owner", "/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })).status, 409);
  assert.equal((await patch("owner", "owner2", { tier: "OWNER" })).status, 200);
  // Both users can view Admin before revocation, but writes reauthorize under a lock.
  const concurrent = await Promise.all([patch("owner", "owner2", { tier: "ADMIN" }), patch("owner2", "owner", { tier: "ADMIN" })]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 403]);
  assert.equal(await prisma.entitlement.count({ where: { tier: "OWNER", status: "active" } }), 1);
  // Restore deterministic UI fixtures through the surviving owner's authorized API.
  const survivor = (await prisma.entitlement.findFirst({ where: { tier: "OWNER" } })).userId === ids.owner ? "owner" : "owner2";
  const other = survivor === "owner" ? "owner2" : "owner";
  assert.equal((await patch(survivor, other, { tier: "OWNER" })).status, 200);
  assert.equal((await patch("owner", "owner", { rolloutLevel: "EXPERIMENTAL" })).status, 200);
  await prisma.auditLog.create({ data: { action: "auth.registration", userId: ids.target } });
  const history = await prisma.auditLog.findFirst({ where: { userId: ids.target } });
  await prisma.user.delete({ where: { id: ids.target } });
  assert.equal((await prisma.auditLog.findUnique({ where: { id: history.id } })).userId, null);
  console.log(`PASS: ${checks} real HTTP checks, sensitive-field allowlists, throttled last activity, owner deletion/concurrency safety, and retained audit history.`);
} finally {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS reject_admin_test_audit ON "AuditLog"').catch(() => {});
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS reject_admin_test_audit()').catch(() => {});
  await prisma.$disconnect();
}
