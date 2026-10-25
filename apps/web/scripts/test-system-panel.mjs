import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { mkdir, writeFile } from "node:fs/promises";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.pathname !== "/jarvis_power_test" || url.searchParams.get("host") !== "/tmp/jarvis-power-test/socket") throw new Error("Isolated power-panel database required");
const base = "http://127.0.0.1:3318";
const db = new PrismaClient();
const tokens = {};
let browser;
try {
  for (const [name, tier] of [["owner", "OWNER"], ["member", "INVITED"]]) {
    const id = `power-test-${name}`;
    await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, entitlement: { create: { tier, status: "active" } } } });
    tokens[name] = await encode({ token: { id, sub: id, sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET });
  }
  const request = (name) => fetch(base + "/api/operations/system", { headers: name ? { cookie: `next-auth.session-token=${tokens[name]}` } : {} });
  assert.equal((await request()).status, 401);
  assert.equal((await request("member")).status, 403);
  const response = await request("owner");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const live = await response.json();
  assert.equal(live.host, "covelli-server");
  assert.equal(live.power.available, true);
  assert.equal(live.power.wattsSource, "estimated");
  assert.equal(live.power.watts, Math.round(live.power.loadPercent * live.power.nominalWatts / 100));
  assert.ok(!JSON.stringify(live).includes("serial"));
  assert.equal(live.gpu.available, true);
  assert.ok(live.gpu.devices.length > 0);
  assert.equal(typeof live.gpu.devices[0].powerWatts, "number");
  assert.ok(!JSON.stringify(live.gpu).includes("GPU-"));
  const { chromium } = await import(process.env.OPERATIONS_PLAYWRIGHT_PATH);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: "America/New_York" });
  await context.addCookies([{ name: "next-auth.session-token", value: tokens.owner, url: base }]);
  await context.addInitScript(() => localStorage.setItem("jarvis-walkthrough-v2:power-test-owner:personal", JSON.stringify({ version: 2, welcomed: true, guides: {} })));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/v2/operations");
  await page.getByText("Power steady. Battery ready.", { exact: true }).waitFor();
  const section = page.locator('section[aria-labelledby="server-status-title"]');
  const gpuSection = page.getByRole("region", { name: "NVIDIA GPU status" });
  await gpuSection.getByText(live.gpu.devices[0].name, { exact: true }).waitFor();
  await mkdir("/tmp/jarvis-power-test/screenshots", { recursive: true });
  await page.getByRole("button", { name: "CPU", exact: true }).click();
  await section.screenshot({ path: "/tmp/jarvis-power-test/screenshots/desktop.png" });
  await gpuSection.screenshot({ path: "/tmp/jarvis-power-test/screenshots/gpu-desktop.png", animations: "disabled" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    if (await section.evaluate(el => el.scrollWidth > el.clientWidth)) {
      await section.screenshot({ path: `/tmp/jarvis-power-test/screenshots/overflow-${width}.png` });
      console.log(await section.evaluate(el => [...el.querySelectorAll('*')].filter(c => c.getBoundingClientRect().right > el.getBoundingClientRect().right).map(c => ({ tag: c.tagName, cls: c.className, width: c.getBoundingClientRect().width }))));
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No document overflow at ${width}px`);
    assert.equal(await section.evaluate(el => el.scrollWidth > el.clientWidth), false, `No panel overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.screenshot({ path: "/tmp/jarvis-power-test/screenshots/mobile.png" });
  await gpuSection.screenshot({ path: "/tmp/jarvis-power-test/screenshots/gpu-mobile.png", animations: "disabled" });
  await page.getByText("UPS details & what these readings mean", { exact: false }).click();
  await page.getByText("Power covers everything connected to the UPS", { exact: false }).waitFor();
  // Exercise outage and failure visuals without sending commands to the real UPS.
  let scenario = structuredClone(live);
  await page.route("**/api/operations/system", route => route.fulfill({ json: scenario }));
  scenario.gpu.devices[0] = { ...scenario.gpu.devices[0], utilizationPercent: 72, processCount: 1, processes: [{ pid: 1234, name: "local-model-worker", memoryMiB: 4096 }] };
  await page.getByRole("button", { name: "Refresh server status" }).click();
  await gpuSection.getByText("local-model-worker", { exact: false }).waitFor();
  await gpuSection.getByText("Active", { exact: true }).waitFor();
  scenario.gpu = { available: false, devices: [] };
  await page.getByRole("button", { name: "Refresh server status" }).click();
  await gpuSection.getByText("GPU telemetry unavailable.", { exact: false }).waitFor();
  assert.equal(await gpuSection.getByText("Idle", { exact: true }).count(), 0);
  scenario.gpu = structuredClone(live.gpu);
  scenario.power = { ...live.power, state: "battery", label: "Running on battery", flags: ["OB"], alerts: ["Utility power lost. Equipment is running on battery."] };
  await page.getByRole("button", { name: "Refresh server status" }).click();
  await page.getByText("Your battery is carrying the load.", { exact: true }).waitFor();
  scenario.generatedAt = new Date(Date.now() - 120000).toISOString();
  await page.getByRole("button", { name: "Refresh server status" }).click();
  await page.getByText("Readings are stale", { exact: true }).waitFor();
  await gpuSection.getByText("Unconfirmed", { exact: true }).waitFor();
  await page.unroute("**/api/operations/system");
  await page.route("**/api/operations/system", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.getByRole("button", { name: "Refresh server status" }).click();
  await page.getByText("Connection interrupted", { exact: true }).waitFor();
  await section.screenshot({ path: "/tmp/jarvis-power-test/screenshots/unavailable.png" });
  await page.unroute("**/api/operations/system");
  await page.route("**/api/operations/system", route => route.fulfill({ status: 403, json: { error: "Forbidden" } }));
  await page.getByRole("button", { name: "Refresh server status" }).click();
  await page.getByText("Sign in with an administrator account", { exact: false }).waitFor();
  assert.equal(await section.getByRole("meter", { name: "UPS load", exact: true }).getAttribute("aria-valuenow"), null);
  assert.equal(await gpuSection.getByRole("meter").count(), 0);
  assert.deepEqual(errors, []);
  await writeFile("/tmp/jarvis-power-test/verification.json", JSON.stringify({ auth: "401/403/200 verified", liveUps: true, estimateCorrect: true, widths: [1440, 390, 320], outage: "passed", stale: "passed", unavailable: "passed", revokedAccess: "passed", browserErrors: errors }, null, 2));
  console.log("PASS: authorization, live UPS/GPU data, GPU processes/unavailable/stale states, desktop/mobile, outage, failed refresh, and revoked access.");
} finally {
  await browser?.close();
  await db.user.deleteMany({ where: { id: { startsWith: "power-test-" } } });
  await db.$disconnect();
}
