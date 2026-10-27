import { budgetAllows } from "../operations/policy.ts";

export type BudgetLimits = {
  perRequestUsd: number;
  dailyUsd: number;
  monthlyUsd: number;
};
export type BudgetUsage = { dayUsedUsd: number; monthUsedUsd: number };

function validLimits(limits: BudgetLimits): boolean {
  return (
    [limits.perRequestUsd, limits.dailyUsd, limits.monthlyUsd].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) &&
    limits.perRequestUsd <= limits.dailyUsd &&
    limits.dailyUsd <= limits.monthlyUsd
  );
}

/**
 * Boolean policy check only: this does not reserve funds and is not concurrency-safe.
 * Live calls must check and reserve atomically through the existing Operations ledger.
 */
export function providerBudgetAllows(
  reserveUsd: number,
  globalLimits: BudgetLimits,
  globalUsage: BudgetUsage,
  providerLimits: BudgetLimits,
  providerUsage: BudgetUsage,
  requestMaxUsd: number,
): boolean {
  return (
    Number.isFinite(requestMaxUsd) &&
    requestMaxUsd >= 0 &&
    reserveUsd <= requestMaxUsd &&
    validLimits(globalLimits) &&
    validLimits(providerLimits) &&
    budgetAllows(
      reserveUsd,
      globalLimits.perRequestUsd,
      globalUsage.dayUsedUsd,
      globalLimits.dailyUsd,
      globalUsage.monthUsedUsd,
      globalLimits.monthlyUsd,
    ) &&
    budgetAllows(
      reserveUsd,
      providerLimits.perRequestUsd,
      providerUsage.dayUsedUsd,
      providerLimits.dailyUsd,
      providerUsage.monthUsedUsd,
      providerLimits.monthlyUsd,
    )
  );
}
