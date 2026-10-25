import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.pathname !== "/jarvis_power_test" || url.searchParams.get("host") !== "/tmp/jarvis-power-test/socket") throw new Error("Disposable agent-workspace database required");
const base = "http://127.0.0.1:3318", db = new PrismaClient();
const { chromium, webkit } = await import(process.env.OPERATIONS_PLAYWRIGHT_PATH);
const tokens = {};
const request = (user, path, body) => fetch(base + path, { method: body ? "POST" : "GET", headers: { ...(user ? { cookie: `next-auth.session-token=${tokens[user]}` } : {}), ...(body ? { "Content-Type": "application/json", Origin: base } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
await mkdir("/tmp/jarvis-power-test/agents", { recursive: true });
try {
  for (const [name, tier] of [["owner", "OWNER"], ["other", "OWNER"], ["member", "INVITED"]]) {
    const id = `agent-ui-${name}`;
    await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, entitlement: { create: { tier, status: "active" } } } });
    tokens[name] = await encode({ token: { id, sub: id, sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET });
  }
  assert.equal((await request(null, "/api/operations")).status, 401);
  assert.equal((await request("member", "/api/operations")).status, 403);
  assert.equal((await request("owner", "/api/operations", { operation: "initialize" })).status, 200);
  assert.equal((await request("owner", "/api/operations", { operation: "settings", settings: { enabled: true, paused: false } })).status, 200);
  for (const name of ["approve", "deny", "expired"]) {
    const id = `agent-ui-${name}`, expiresAt = new Date(Date.now() + (name === "expired" ? -60000 : 3600000));
    const action = { kind: "observe.recheck", domain: "infrastructure", decisionId: id };
    const actionHash = createHash("sha256").update(JSON.stringify([action.kind, action.domain, action.decisionId, expiresAt.toISOString()])).digest("hex");
    await db.operationsDecision.create({ data: { id, userId: "agent-ui-owner", observationId: "agent-ui-observation", domain: "infrastructure", severity: "warning", title: `Review ${name} fixture`, action, actionHash, expiresAt, brief: { whyItMatters: "Synthetic test observation", recommendation: "Recheck system usage", confidence: "Measured", source: "Test fixture", sourceUpdatedAt: new Date().toISOString(), expectedUpside: "Fresh evidence", costOfDoingNothing: "Stale information", cost: "Within cap", authorization: "Exact recheck", forecast: "New observation", evidence: [], assumptions: [], uncertainty: [], downside: "Read-only collection", alternatives: [] } } });
    await db.operationsNotification.create({ data: { userId: "agent-ui-owner", dedupeKey: id, severity: "warning", source: "infrastructure", title: `Review ${name} fixture`, decisionId: id, availableAt: new Date(name === "expired" ? Date.now() + 3600000 : Date.now() - 1000) } });
  }
  await request("other", "/api/operations", { operation: "initialize" });
  assert.equal((await request("other", "/api/operations/decisions/agent-ui-approve", { operation: "approve", actionHash: "bad" })).status, 404);
  assert.equal((await request("owner", "/api/operations/decisions/agent-ui-approve", { operation: "approve", actionHash: "bad" })).status, 409);
  for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await type.launch({ headless: true, ...(engine === "webkit" && process.env.NAV_WEBKIT_EXECUTABLE ? { executablePath: process.env.NAV_WEBKIT_EXECUTABLE } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      await context.addCookies([{ name: "next-auth.session-token", value: tokens.owner, url: base }]);
      await context.addInitScript(() => localStorage.setItem("jarvis-walkthrough-v2:agent-ui-owner:personal", JSON.stringify({ version: 2, welcomed: true, guides: {} })));
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(base + "/v2/operations");
      await page.getByText("Power steady. Battery ready.", { exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/jarvis-power-test/agents/${engine}-system.png` });
      for (const view of ["power", "compute", "continuity", "overview"]) {
        await page.getByLabel("System view", { exact: true }).selectOption(view);
        if (view === "compute") await page.getByRole("region", { name: "NVIDIA GPU status" }).waitFor();
        if (view === "continuity") await page.getByRole("heading", { name: "Protection & continuity" }).waitFor();
      }
      await page.getByRole("button", { name: "Open agent workspace", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "Your control room" });
      await dialog.waitFor();
      await dialog.getByText("Notification inbox", { exact: false }).click();
      assert.equal(await dialog.getByText("Review expired fixture", { exact: true }).count(), 0, "Quiet-hour notification is withheld and expired decision not pending");
      await dialog.getByLabel("Operations view").selectOption("Activity");
      await dialog.getByRole("heading", { name: "Workflow doctor" }).waitFor();
      await dialog.getByLabel("Operations view").selectOption("Preferences");
      await dialog.getByLabel("Notification timezone").fill("America/Chicago");
      await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
      assert.equal(await dialog.getByLabel("Notification timezone").inputValue(), "America/Chicago", "Polling must preserve unsaved settings");
      await dialog.getByRole("button", { name: "Save preferences" }).click();
      await dialog.getByText("Saved. Any queued work", { exact: false }).waitFor();
      assert.equal((await db.operationsProfile.findUnique({ where: { userId: "agent-ui-owner" } })).preferences.timezone, "America/Chicago");
      await dialog.getByLabel("Operations view").selectOption("Decisions");
      if (engine === "chromium") {
        await dialog.getByRole("button").filter({ hasText: "Review approve fixture" }).click();
        await dialog.getByRole("button", { name: "Review approval", exact: true }).click();
        const changedExpiry = new Date(Date.now() + 7200000);
        const changedHash = createHash("sha256").update(JSON.stringify(["observe.recheck", "infrastructure", "agent-ui-approve", changedExpiry.toISOString()])).digest("hex");
        await db.operationsDecision.update({ where: { id: "agent-ui-approve" }, data: { expiresAt: changedExpiry, actionHash: changedHash } });
        const refreshed = page.waitForResponse(r => r.url().endsWith("/api/operations") && r.request().method() === "GET");
        await dialog.getByRole("button", { name: "Refresh", exact: true }).click(); await refreshed;
        await dialog.getByRole("button", { name: "Approve this recheck", exact: true }).waitFor({ state: "hidden" });
        await dialog.getByRole("button", { name: "Review approval", exact: true }).click();
        await dialog.getByRole("button", { name: "Approve this recheck", exact: true }).click();
        await dialog.getByText("Saved. Any queued work", { exact: false }).waitFor();
        assert.equal(await db.operationsApproval.count({ where: { decisionId: "agent-ui-approve" } }), 1);
        assert.equal(await dialog.getByRole("button", { name: "Review approval", exact: true }).count(), 0);
        await dialog.getByRole("button", { name: "Back to inbox" }).click();
        await dialog.getByRole("button").filter({ hasText: "Review deny fixture" }).click();
        await dialog.getByRole("button", { name: "Deny", exact: true }).click();
        await dialog.getByText("Saved. Any queued work", { exact: false }).waitFor();
        assert.equal((await db.operationsDecision.findUnique({ where: { id: "agent-ui-deny" } })).status, "rejected");
      }
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("button", { name: "Open agent workspace", exact: true }).first().evaluate(el => el === document.activeElement), true);
      await page.goto(base + "/v2/assistant");
      await page.getByRole("textbox", { name: "Message Jarvis" }).waitFor();
      await page.getByRole("button", { name: "Chat settings" }).click();
      const chatSettings = page.getByRole("region", { name: "Chat settings" });
      await chatSettings.getByRole("checkbox").uncheck();
      const composer = page.getByRole("textbox", { name: "Message Jarvis" });
      await composer.fill("Test draft"); await composer.press("Enter");
      assert.equal(await composer.inputValue(), "Test draft\n");
      await chatSettings.getByRole("button", { name: "Workflow doctor" }).click();
      await dialog.getByRole("heading", { name: "Workflow doctor" }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Chat settings" }).click();
      await page.screenshot({ path: `/tmp/jarvis-power-test/agents/${engine}-assistant.png` });
      // Never dispatch a real model request in UI tests.
      await page.route("**/api/assistant/message", route => route.fulfill({ json: { mode: "message", message: "Fixture reply" } }));
      await composer.fill("UI test"); await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("Fixture reply", { exact: true }).waitFor();
      for (const width of [768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await composer.isVisible(), true);
        await page.getByRole("button", { name: /^Agents(?: · \d+)?$/ }).click();
        await dialog.waitFor();
        await dialog.getByLabel("Operations view").selectOption("Preferences");
        assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false, `${engine} dialog fits ${width}`);
        await dialog.getByRole("button", { name: "Close agent workspace" }).focus(); await page.keyboard.press("Shift+Tab");
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, "Modal traps keyboard focus");
        await page.screenshot({ path: `/tmp/jarvis-power-test/agents/${engine}-settings-${width}.png` });
        await page.keyboard.press("Escape");
      }
      await page.getByRole("button", { name: "Open more navigation" }).click();
      const menu = page.getByRole("dialog", { name: "All pages", exact: true });
      await menu.getByRole("button", { name: "Open agent workspace" }).click();
      await menu.waitFor({ state: "hidden" });
      await dialog.waitFor();
      await page.keyboard.press("Tab");
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
      await page.keyboard.press("Escape");
      await page.screenshot({ path: `/tmp/jarvis-power-test/agents/${engine}-assistant-mobile.png` });
      await page.setViewportSize({ width: 740, height: 390 });
      assert.equal(await composer.isVisible(), true);
      await page.reload();
      await page.getByRole("button", { name: "Chat settings" }).click();
      assert.equal(await page.getByRole("checkbox", { name: "Enter sends a message" }).isChecked(), false);
      await page.getByRole("button", { name: "Chat settings" }).click();
      await page.getByRole("button", { name: "Chats", exact: true }).click();
      const chats = page.getByRole("dialog", { name: "Conversations", exact: true });
      await chats.waitFor();
      await page.keyboard.press("Escape"); await chats.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: /^Agents(?: · \d+)?$/ }).click();
      await dialog.getByLabel("Operations view").selectOption("Activity");
      await page.route("**/api/operations", route => route.fulfill({ status: 503, json: { error: "Fixture outage" } }));
      await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
      await dialog.getByRole("alert").filter({ hasText: "Fixture outage" }).waitFor();
      assert.equal(await dialog.getByRole("button", { name: "Emergency pause" }).isEnabled(), true);
      await page.unroute("**/api/operations");
      await page.route("**/api/operations", route => route.fulfill({ status: 403, json: { error: "Forbidden" } }));
      await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("button", { name: /^Agents(?: · \d+)?$/ }).count(), 0);
      assert.deepEqual(errors, []);
      const member = await browser.newContext();
      await member.addCookies([{ name: "next-auth.session-token", value: tokens.member, url: base }]);
      await member.addInitScript(() => localStorage.setItem("jarvis-walkthrough-v2:agent-ui-member:personal", JSON.stringify({ version: 2, welcomed: true, guides: {} })));
      const memberPage = await member.newPage(); await memberPage.goto(base + "/v2/assistant");
      await memberPage.getByRole("textbox", { name: "Message Jarvis" }).waitFor();
      assert.equal(await memberPage.getByRole("button", { name: "Open agent workspace" }).count(), 0);
      console.log(`PASS ${engine}: system views, shared inbox, quiet delivery, settings, doctor, approvals, keyboard, responsive chat, and entitlement isolation`);
    } finally { await browser.close(); }
  }
} finally {
  await db.user.deleteMany({ where: { id: { startsWith: "agent-ui-" } } });
  await db.$disconnect();
}
