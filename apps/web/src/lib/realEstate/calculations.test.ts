import test from "node:test";
import assert from "node:assert/strict";

import { calculateFhaAnalysis, calculateMortgagePayment } from "./calculations";

test("calculateMortgagePayment builds a 30-year FHA payment from principal and rate", () => {
  const payment = calculateMortgagePayment({ principal: 250000, annualRate: 0.065, years: 30 });
  assert.ok(payment > 1500 && payment < 1700, `Expected payment around 1581; got ${payment}`);
});

test("calculateFhaAnalysis returns expected financing and cash metrics", () => {
  const result = calculateFhaAnalysis({
    purchasePrice: 285000,
    units: 2,
    annualPropertyTaxes: 4200,
    annualInsurance: 1800,
    interestRate: 0.065,
    mortgageTermYears: 30,
    downPaymentPercent: 0.035,
    annualFhaMip: 0.0085,
    upfrontMipPercent: 0.0175,
    closingCostPercent: 0.045,
    repairBudget: 16000,
    sellerCredit: 4000,
    rentFromOtherUnits: 1850,
    vacancyReserveMonthly: 120,
    maintenanceReserveMonthly: 90,
    capexReserveMonthly: 60,
    ownerPaidUtilities: 80,
    financeUpfrontMip: true,
  });

  assert.equal(result.baseLoanAmount, 275025);
  assert.ok(result.totalFinancedLoan > 279000 && result.totalFinancedLoan < 280000);
  assert.ok(result.totalMonthlyCarryingCost > 2000);
  assert.ok(result.totalEstimatedCashRequired > 39000 && result.totalEstimatedCashRequired < 40000);
  assert.ok(result.breakEvenOccupancy > 1 && result.breakEvenOccupancy < 2);
  assert.ok(result.effectiveMonthlyOwnerHousingCost < result.totalMonthlyCarryingCost);
});
