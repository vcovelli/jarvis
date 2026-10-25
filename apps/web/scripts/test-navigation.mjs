import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { mkdir } from "node:fs/promises";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.pathname !== "/jarvis_power_test" || url.searchParams.get("host") !== "/tmp/jarvis-power-test/socket") throw new Error("Disposable navigation database required");
const base = "http://127.0.0.1:3318";
const db = new PrismaClient();
const tokens = {};
const { chromium, webkit } = await import(process.env.OPERATIONS_PLAYWRIGHT_PATH);
await mkdir("/tmp/jarvis-power-test/navigation", { recursive: true });
try {
  for (const [name, tier] of [["owner", "OWNER"], ["member", "INVITED"]]) {
    const id = `nav-test-${name}`;
    await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, entitlement: { create: { tier, status: "active" } } } });
    tokens[name] = await encode({ token: { id, sub: id, sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET });
  }
  for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await browserType.launch({ headless: true, ...(engine === "webkit" && process.env.NAV_WEBKIT_EXECUTABLE ? { executablePath: process.env.NAV_WEBKIT_EXECUTABLE } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await context.addCookies([{ name: "next-auth.session-token", value: tokens.owner, url: base }]);
      await context.addInitScript(() => localStorage.setItem("jarvis-walkthrough-v2:nav-test-owner:personal", JSON.stringify({ version: 2, welcomed: true, guides: {} })));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(base + "/v2/operations");
      const sidebar = page.getByRole("complementary", { name: "Sidebar" });
      await sidebar.getByRole("link", { name: "Operations", exact: true }).waitFor();
      assert.equal(await sidebar.getByText("Console", { exact: true }).count(), 0);
      assert.equal(Math.round((await sidebar.boundingBox()).width), 224);
      assert.equal(await sidebar.getByRole("link", { name: "Operations", exact: true }).getAttribute("aria-current"), "page");
      await sidebar.getByRole("searchbox", { name: "Find a page" }).fill("gpu");
      assert.equal(await sidebar.getByRole("navigation", { name: "Main navigation" }).getByRole("link").count(), 1);
      await sidebar.getByRole("searchbox").fill("no-such-page");
      await sidebar.getByText("No matching pages.").waitFor();
      await sidebar.getByRole("searchbox").fill("");
      await page.screenshot({ path: `/tmp/jarvis-power-test/navigation/${engine}-desktop.png` });
      await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
      await page.waitForFunction(() => document.querySelector('.jarvis-desktop-sidebar').getBoundingClientRect().width === 64);
      await sidebar.getByRole("link", { name: "Operations", exact: true }).waitFor();
      await page.reload();
      await sidebar.getByRole("button", { name: "Expand sidebar" }).waitFor();
      assert.equal(Math.round((await sidebar.boundingBox()).width), 64);
      await page.screenshot({ path: `/tmp/jarvis-power-test/navigation/${engine}-rail.png` });
      await sidebar.getByRole("button", { name: "Show all pages" }).click();
      await sidebar.getByRole("button", { name: "Show quick settings controls" }).click();
      await sidebar.getByRole("button", { name: "Light", exact: true }).click();
      await page.screenshot({ path: `/tmp/jarvis-power-test/navigation/${engine}-light.png` });
      await sidebar.getByRole("button", { name: "Dark", exact: true }).click();
      await sidebar.getByRole("button", { name: "Hide quick settings controls" }).click();
      for (const width of [1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine}: overflow at ${width}`);
        if (width >= 1024) { assert.equal(await sidebar.isVisible(), true); continue; }
        assert.equal(await sidebar.isVisible(), false);
        const bar = page.getByRole("navigation", { name: "Primary mobile navigation" });
        await bar.waitFor();
        for (const button of await bar.locator('a, button').all()) assert.ok((await button.boundingBox()).height >= 44);
        const more = bar.getByRole("button", { name: "Open more navigation" });
        await more.focus(); await more.click();
        const drawer = page.getByRole("dialog", { name: "All pages" });
        await drawer.waitFor();
        assert.ok((await drawer.boundingBox()).width <= width);
        assert.equal(await drawer.evaluate(el => el.scrollWidth > el.clientWidth), false);
        await drawer.getByRole("button", { name: "Close", exact: true }).focus();
        await page.keyboard.press("Shift+Tab");
        assert.equal(await drawer.evaluate(el => el.contains(document.activeElement)), true);
        await drawer.getByRole("searchbox").fill("gpu");
        assert.equal(await drawer.getByRole("navigation").getByRole("link").count(), 1);
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        assert.equal(await more.evaluate(el => el === document.activeElement), true);
        await more.click();
        await drawer.getByRole("searchbox").fill("settings");
        await drawer.getByRole("navigation").getByRole("link", { name: "Settings", exact: true }).click();
        await page.waitForURL("**/v2/settings");
        await drawer.waitFor({ state: "hidden" });
        await more.click();
        await drawer.getByRole("searchbox").fill("operations");
        await drawer.getByRole("link", { name: "Operations", exact: true }).click();
        await page.waitForURL("**/v2/operations");
        if (width === 390) {
          await page.screenshot({ path: `/tmp/jarvis-power-test/navigation/${engine}-mobile.png` });
          await more.click();
          await page.screenshot({ path: `/tmp/jarvis-power-test/navigation/${engine}-drawer.png` });
          await page.getByRole("button", { name: "Close menu", exact: true }).click();
        }
      }
      await page.setViewportSize({ width: 740, height: 390 });
      await page.getByRole("button", { name: "Open more navigation" }).click();
      await page.getByRole("dialog").getByRole("searchbox").fill("account");
      await page.getByRole("dialog").getByRole("link", { name: "Account", exact: true }).click();
      await page.waitForURL("**/v2/account");
      await page.getByRole("button", { name: "Open more navigation" }).click();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.waitForFunction(() => !document.body.classList.contains("scroll-locked"));
      assert.equal(await page.evaluate(() => document.body.classList.contains("scroll-locked")), false);
      await context.clearCookies();
      await context.addCookies([{ name: "next-auth.session-token", value: tokens.member, url: base }]);
      await page.goto(base + "/v2/settings");
      await sidebar.getByRole("navigation", { name: "Main navigation" }).waitFor();
      assert.equal(await sidebar.getByRole("link", { name: "Operations", exact: true }).count(), 0);
      assert.equal(await sidebar.getByRole("link", { name: "Admin", exact: true }).count(), 0);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine}: desktop/rail persistence, search, active links, themes, touch targets, 320/390/768/1024/1440 widths, landscape, focus trap, Escape, route transitions, resize and member access.`);
    } finally { await browser.close(); }
  }
} finally {
  await db.user.deleteMany({ where: { id: { startsWith: "nav-test-" } } });
  await db.$disconnect();
}
