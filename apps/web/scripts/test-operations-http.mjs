import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import {
  initialize,
  changeSettings,
  enqueue,
  runNext,
} from "../src/lib/operations/engine.ts";
const dbUrl = new URL(process.env.DATABASE_URL ?? "http://invalid");
const base = process.env.OPERATIONS_TEST_BASE_URL;
if (
  process.env.OPERATIONS_TEST_ISOLATED !== "1" ||
  dbUrl.pathname !== "/jarvis_operations_test" ||
  dbUrl.searchParams.get("host") !== "/tmp/jarvis-operations-test/socket" ||
  base !== "http://127.0.0.1:3317"
)
  throw new Error(
    "Disposable operations database and loopback test server required.",
  );
const db = new PrismaClient();
const prefix = "ops-http-";
const tokens = {};
let assertions = 0;
async function request(actor, path, body, origin = base) {
  return fetch(base + path, {
    redirect: "manual",
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(actor ? { Cookie: `next-auth.session-token=${tokens[actor]}` } : {}),
      ...(body === undefined
        ? {}
        : { Origin: origin, "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function status(actor, path, body, expected, origin) {
  assert.equal((await request(actor, path, body, origin)).status, expected);
  assertions++;
}
try {
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  for (const [name, tier, entitlementStatus] of [
    ["owner", "OWNER", "active"],
    ["other", "OWNER", "active"],
    ["member", "INVITED", "active"],
    ["disabled", "ADMIN", "disabled"],
  ]) {
    const id = prefix + name;
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        entitlement: { create: { tier, status: entitlementStatus } },
      },
    });
    tokens[name] = await encode({
      token: { id, sub: id, email: `${id}@example.test`, sessionVersion: 0 },
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 3600,
    });
  }
  for (const name of [null, "member", "disabled"]) {
    await status(name, "/api/operations", undefined, name ? 403 : 401);
    await status(
      name,
      "/api/operations",
      { operation: "initialize" },
      name ? 403 : 401,
    );
    await status(
      name,
      "/api/operations/decisions/missing",
      { operation: "approve" },
      name ? 403 : 401,
    );
  }
  await status(
    "owner",
    "/api/operations",
    { operation: "initialize" },
    403,
    "https://wrong.example",
  );
  await status("owner", "/api/operations", { operation: "initialize" }, 200);
  await status(
    "owner",
    "/api/operations",
    { operation: "settings", settings: { enabled: true, paused: false } },
    200,
  );
  await status(
    "owner",
    "/api/operations",
    { operation: "settings", settings: { executePayments: true } },
    400,
  );
  await status(
    "owner",
    "/api/operations",
    { operation: "run", domain: "shell" },
    400,
  );
  await enqueue(db, prefix + "owner", "infrastructure");
  await runNext(db, prefix + "owner", async () => ({
    source: "Browser acceptance fixture",
    observedAt: new Date().toISOString(),
    sourceUpdatedAt: new Date().toISOString(),
    metrics: { diskUsedPct: 96 },
    signals: [
      {
        code: "disk",
        title: "Review test disk capacity",
        severity: "critical",
        detail: "Synthetic acceptance fixture, not a live disk alert.",
      },
    ],
    limitations: ["Isolated test data"],
  }));
  const decision = await db.operationsDecision.findFirstOrThrow({
    where: { userId: prefix + "owner" },
  });
  await initialize(db, prefix + "other");
  await changeSettings(db, prefix + "other", { enabled: true, paused: false });
  await status(
    "other",
    `/api/operations/decisions/${decision.id}`,
    { operation: "reject" },
    404,
  );
  await status(
    "owner",
    `/api/operations/decisions/${decision.id}`,
    { operation: "approve", actionHash: "forged" },
    409,
  );
  const text = await (await request("owner", "/api/operations")).text();
  for (const forbidden of [
    "accessTokenEncrypted",
    "passwordHash",
    "leaseToken",
    "NEXTAUTH_SECRET",
  ]) {
    assert.equal(text.includes(forbidden), false);
    assertions++;
  }
  await status(
    "owner",
    "/api/operations",
    { operation: "settings", settings: { paused: true } },
    200,
  );
  await status(
    "owner",
    `/api/operations/decisions/${decision.id}`,
    { operation: "approve", actionHash: decision.actionHash },
    409,
  );
  await status(
    "owner",
    "/api/operations",
    { operation: "settings", settings: { paused: false } },
    200,
  );
  if (process.env.OPERATIONS_PLAYWRIGHT_PATH) {
    const { chromium } = await import(process.env.OPERATIONS_PLAYWRIGHT_PATH);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        timezoneId: "America/New_York",
      });
      await context.addCookies([
        { name: "next-auth.session-token", value: tokens.owner, url: base },
      ]);
      await context.addInitScript(() => {
        localStorage.setItem(
          "jarvis-walkthrough-v2:ops-http-owner:personal",
          JSON.stringify({ version: 2, welcomed: true, guides: {} }),
        );
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/v2/operations");
      await page.getByRole("heading", { name: "Operations Center" }).waitFor();
      await page.getByRole("button", { name: /Decisions \(/ }).click();
      await page
        .getByRole("button", { name: /Review test disk capacity/ })
        .click();
      await page
        .getByRole("heading", { name: "Exact proposed action" })
        .waitFor();
      await page.getByRole("button", { name: "Review approval" }).click();
      await page.getByRole("button", { name: "Approve this recheck" }).click();
      await page
        .getByText("infrastructure · approved", { exact: true })
        .waitFor();
      await page.screenshot({
        path: "/tmp/jarvis-operations-test/mobile-decision.png",
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      assertions++;
      await page
        .getByRole("button", { name: "Preferences", exact: true })
        .click();
      await page
        .getByLabel("Financial goals", { exact: true })
        .fill("Keep a six month liquidity reserve");
      await page.getByRole("button", { name: "Save preferences" }).click();
      await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
      assert.equal(
        (
          await db.operationsProfile.findUniqueOrThrow({
            where: { userId: prefix + "owner" },
          })
        ).preferences.financialGoals,
        "Keep a six month liquidity reserve",
      );
      assertions++;
      await page
        .getByRole("button", { name: "Emergency pause", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Enable observation loop", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await page.screenshot({
        path: "/tmp/jarvis-operations-test/mobile-overview.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      assertions++;
      assert.deepEqual(errors, []);
      assertions++;
    } finally {
      await browser.close();
    }
  }
  // User-level and IP-level rate limiting remains active in the test server.
  let limited = false;
  for (let i = 0; i < 35; i++) {
    const r = await request("owner", "/api/operations", {
      operation: "run",
      domain: "infrastructure",
    });
    if (r.status === 429) {
      limited = true;
      break;
    }
  }
  assert.ok(limited);
  assertions++;
  console.log(
    `PASS: ${assertions} HTTP/browser assertions including auth, CSRF, ownership, approval, pause, mobile layout, preferences, and throttling.`,
  );
} finally {
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
}
