import test from "node:test";
import assert from "node:assert/strict";
import { parseBackup, parsePower } from "./power.ts";

const sample = "ups.status: OL\nbattery.charge: 100\nbattery.runtime: 4302\nups.load: 9\nups.realpower.nominal: 900\ninput.voltage: 121\nups.serial: private-serial";
test("UPS watts are honestly estimated from load and rated real power", () => {
  const p = parsePower(sample);
  assert.equal(p.state, "online"); assert.equal(p.watts, 81); assert.equal(p.wattsSource, "estimated");
  assert.equal(p.runtimeSeconds, 4302); assert.ok(!JSON.stringify(p).includes("private-serial"));
});
test("measured zero watts is valid; apparent VA is never treated as watts", () => {
  assert.equal(parsePower(sample + "\nups.realpower: 0").wattsSource, "measured");
  assert.equal(parsePower("ups.status: OL\nups.load: 9\nups.power.nominal: 1500").watts, null);
});
test("on-battery, low reserve, replace-battery, bypass and outage states are visible", () => {
  assert.equal(parsePower(sample.replace("OL", "OB")).state, "battery");
  for (const status of ["OB LB", "OL OFF", "OL OVER", "FSD"]) assert.equal(parsePower(sample.replace("OL", status)).state, "critical");
  for (const status of ["OL RB", "OL BYPASS", "OL ALARM", "OL CAL"]) assert.equal(parsePower(sample.replace("OL", status)).state, "warning");
  assert.equal(parsePower(sample.replace("OL", "OB").replace("4302", "60")).state, "critical");
});
test("missing, stale, disconnected and malformed data never become green or zero", () => {
  for (const value of [null, "", "ERR DATA-STALE", "ups.status: NOCOMM"]) {
    const p = parsePower(value); assert.equal(p.state, "unknown"); assert.equal(p.chargePercent, null); assert.equal(p.watts, null);
  }
  const p = parsePower("ups.status: OL\nbattery.charge: 101\nbattery.runtime: NaN\nups.load: -1");
  assert.equal(p.state, "warning"); assert.equal(p.chargePercent, null); assert.equal(p.watts, null);
});
test("missing backup exit timestamp does not prove a successful backup", () => {
  assert.equal(parseBackup("backup", "Result=success\nExecMainStatus=0\nExecMainExitTimestamp=").state, "unknown");
  const now = Date.parse("2026-10-25T20:00:00Z");
  assert.equal(parseBackup("backup", "Result=success\nExecMainStatus=0\nExecMainExitTimestamp=Sun 2026-10-25 03:31:25 UTC", now).state, "success");
  assert.equal(parseBackup("backup", "Result=success\nExecMainStatus=0\nExecMainExitTimestamp=Fri 2026-10-23 03:31:25 UTC", now).state, "stale");
  assert.equal(parseBackup("backup", "Result=exit-code", now).state, "failed");
  assert.equal(parseBackup("backup", "ActiveState=activating", now).state, "running");
});
