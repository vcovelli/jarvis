import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { validateRegistrationAccess } from "./registration.ts";

const originalDisabled = process.env.REGISTRATION_DISABLED;
const originalAccessCode = process.env.REGISTRATION_ACCESS_CODE;
const originalMode = process.env.REGISTRATION_MODE;

afterEach(() => {
  process.env.REGISTRATION_DISABLED = originalDisabled;
  process.env.REGISTRATION_ACCESS_CODE = originalAccessCode;
  process.env.REGISTRATION_MODE = originalMode;
});

test("allows registration when no gate is configured", () => {
  delete process.env.REGISTRATION_DISABLED;
  delete process.env.REGISTRATION_ACCESS_CODE;
  delete process.env.REGISTRATION_MODE;

  assert.deepEqual(validateRegistrationAccess(undefined), { allowed: true, mode: "open" });
});

test("blocks registration when disabled", () => {
  process.env.REGISTRATION_DISABLED = "true";
  delete process.env.REGISTRATION_ACCESS_CODE;

  assert.equal(validateRegistrationAccess(undefined).allowed, false);
});

test("requires the configured access code", () => {
  process.env.REGISTRATION_DISABLED = "false";
  process.env.REGISTRATION_ACCESS_CODE = "paid-preview";
  delete process.env.REGISTRATION_MODE;

  assert.equal(validateRegistrationAccess("wrong").allowed, false);
  assert.deepEqual(validateRegistrationAccess("paid-preview"), { allowed: true, mode: "access_code" });
});

test("supports invitation-only registration", () => {
  process.env.REGISTRATION_MODE = "invite";
  process.env.REGISTRATION_DISABLED = "false";
  assert.deepEqual(validateRegistrationAccess("one-time-invite"), { allowed: true, mode: "invite" });
});
