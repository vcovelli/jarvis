import test from "node:test";
import assert from "node:assert/strict";
import { providerBudgetAllows, type BudgetLimits } from "./budget.ts";

const limits: BudgetLimits = { perRequestUsd: 1, dailyUsd: 10, monthlyUsd: 100 };
const unused = { dayUsedUsd: 0, monthUsedUsd: 0 };

test("provider and user request caps constrain the shared budget", () => {
  assert.equal(providerBudgetAllows(1, limits, unused, limits, unused, 1), true);
  assert.equal(providerBudgetAllows(1, limits, unused, { ...limits, perRequestUsd: 0.5 }, unused, 1), false);
  assert.equal(providerBudgetAllows(1, limits, unused, limits, unused, 0.5), false);
  assert.equal(providerBudgetAllows(1, { ...limits, perRequestUsd: 0.5 }, unused, limits, unused, 1), false);
});

test("daily and monthly exhaustion apply independently to global and provider usage", () => {
  for (const usage of [{ dayUsedUsd: 10, monthUsedUsd: 10 }, { dayUsedUsd: 0, monthUsedUsd: 100 }]) {
    assert.equal(providerBudgetAllows(1, limits, usage, limits, unused, 1), false);
    assert.equal(providerBudgetAllows(1, limits, unused, limits, usage, 1), false);
  }
  assert.equal(providerBudgetAllows(1, limits, { dayUsedUsd: 9, monthUsedUsd: 99 }, limits, unused, 1), true);
});

test("invalid reserves, request limits, configured limits and usage fail closed", () => {
  for (const invalid of [-1, NaN, Infinity, -Infinity]) {
    assert.equal(providerBudgetAllows(invalid, limits, unused, limits, unused, 1), false);
    assert.equal(providerBudgetAllows(1, limits, unused, limits, unused, invalid), false);
    for (const key of ["perRequestUsd", "dailyUsd", "monthlyUsd"] as const) {
      const invalidLimits = { ...limits, [key]: invalid };
      assert.equal(providerBudgetAllows(1, invalidLimits, unused, limits, unused, 1), false);
      assert.equal(providerBudgetAllows(1, limits, unused, invalidLimits, unused, 1), false);
    }
    for (const key of ["dayUsedUsd", "monthUsedUsd"] as const) {
      const invalidUsage = { ...unused, [key]: invalid };
      assert.equal(providerBudgetAllows(1, limits, invalidUsage, limits, unused, 1), false);
      assert.equal(providerBudgetAllows(1, limits, unused, limits, invalidUsage, 1), false);
    }
  }
});

test("unordered configured limits are rejected even when a request fits", () => {
  for (const invalid of [{ ...limits, perRequestUsd: 11 }, { ...limits, dailyUsd: 101 }]) {
    assert.equal(providerBudgetAllows(0, invalid, unused, limits, unused, 0), false);
    assert.equal(providerBudgetAllows(0, limits, unused, invalid, unused, 0), false);
  }
});

test("zero-cost local work fits an unused zero budget", () => {
  const zero = { perRequestUsd: 0, dailyUsd: 0, monthlyUsd: 0 };
  assert.equal(providerBudgetAllows(0, zero, unused, zero, unused, 0), true);
  assert.equal(providerBudgetAllows(0.01, zero, unused, zero, unused, 1), false);
});
