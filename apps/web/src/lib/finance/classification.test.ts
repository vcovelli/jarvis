import assert from "node:assert/strict";
import test from "node:test";

import { classifyTransaction, inferAccountRole, normalizeMerchantName } from "./classification.ts";

test("classifies payroll deposits as income", () => {
  const result = classifyTransaction({ name: "ACME PAYROLL DIRECT DEP", amount: -4200, category: ["Income"] });

  assert.equal(result.eventType, "income");
  assert.equal(result.countsAsIncome, true);
  assert.equal(result.countsAsSpend, false);
  assert.equal(result.cashFlowAmount, 4200);
});


test("classifies Plaid transfer payroll from a savings account as income", () => {
  const result = classifyTransaction(
    {
      name: "LINCOLN ELECTRIC PAYROLL PPD ID: 9111111101",
      amount: -2031.79,
      category: ["Transfer", "Payroll"],
    },
    { account: { type: "depository", subtype: "savings", name: "CHASE SAVINGS" } },
  );

  assert.equal(result.eventType, "income");
  assert.equal(result.primaryCategory, "income");
  assert.equal(result.subcategory, "payroll");
  assert.equal(result.countsAsIncome, true);
  assert.equal(result.countsAsTransfer, false);
  assert.equal(result.cashFlowAmount, 2031.79);
});

test("excludes credit card payments from spend and cashflow", () => {
  const result = classifyTransaction(
    { name: "AMEX AUTOPAY PAYMENT - THANK YOU", amount: 650, category: ["Transfer"] },
    { account: { type: "depository", subtype: "checking", name: "Checking" } },
  );

  assert.equal(result.eventType, "credit_card_payment");
  assert.equal(result.countsAsSpend, false);
  assert.equal(result.countsAsTransfer, true);
  assert.equal(result.cashFlowAmount, 0);
});

test("treats brokerage ACH movement as an investment contribution", () => {
  const result = classifyTransaction(
    { name: "ACH CHARLES SCHWAB BROKERAGE TRANSFER", amount: 1000, category: ["Transfer"] },
    { account: { type: "depository", subtype: "checking", name: "Checking" } },
  );

  assert.equal(result.eventType, "investment_contribution");
  assert.equal(result.countsAsSavings, true);
  assert.equal(result.countsAsInvestmentContribution, true);
  assert.equal(result.cashFlowAmount, 0);
});


test("treats Schwab MoneyLink from savings as an investment contribution", () => {
  const result = classifyTransaction(
    {
      name: "SCHWAB BROKERAGE MONEYLINK 586224030226127 WEB ID: 9005586224",
      amount: 1000,
      category: ["Service", "Financial", "Stock Brokers"],
    },
    { account: { type: "depository", subtype: "savings", name: "CHASE SAVINGS" } },
  );

  assert.equal(result.eventType, "investment_contribution");
  assert.equal(result.countsAsSpend, false);
  assert.equal(result.countsAsSavings, true);
  assert.equal(result.countsAsInvestmentContribution, true);
  assert.equal(result.countsAsTransfer, true);
  assert.equal(result.cashFlowAmount, 0);
});

test("maps Plaid personal finance categories into the spend taxonomy", () => {
  const result = classifyTransaction({
    name: "TST COFFEE BAR",
    merchantName: "Coffee Bar",
    amount: 7.25,
    category: ["Food and Drink"],
    personalFinanceCategoryPrimary: "FOOD_AND_DRINK",
    personalFinanceCategoryDetailed: "FOOD_AND_DRINK_RESTAURANT",
  });

  assert.equal(result.eventType, "expense");
  assert.equal(result.primaryCategory, "food_dining");
  assert.equal(result.countsAsSpend, true);
});


test("maps legacy Plaid recreation and shop categories without review", () => {
  const recreation = classifyTransaction({
    name: "WICKLIFFE LANES",
    amount: 24.5,
    category: ["Recreation", "Arts and Entertainment"],
  });
  const groceries = classifyTransaction({
    name: "PRODUCE PLACE",
    amount: 42.75,
    category: ["Shops", "Supermarkets and Groceries"],
  });

  assert.equal(recreation.eventType, "expense");
  assert.equal(recreation.primaryCategory, "entertainment");
  assert.equal(recreation.needsReview, false);
  assert.equal(groceries.eventType, "expense");
  assert.equal(groceries.primaryCategory, "groceries");
  assert.equal(groceries.needsReview, false);
});

test("normalizes noisy merchant names and infers account roles", () => {
  assert.equal(normalizeMerchantName("SQ *RAISING CANES #1234"), "Raising Cane's");
  assert.equal(inferAccountRole({ type: "investment", subtype: "401k", name: "Employer 401K" }), "retirement_401k");
});
