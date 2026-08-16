export type FhaAnalysisInput = {
  purchasePrice: number;
  units: number;
  annualPropertyTaxes: number;
  annualInsurance: number;
  interestRate: number;
  mortgageTermYears: number;
  downPaymentPercent: number;
  annualFhaMip: number;
  upfrontMipPercent: number;
  closingCostPercent: number;
  repairBudget: number;
  sellerCredit: number;
  rentFromOtherUnits: number;
  vacancyReserveMonthly: number;
  maintenanceReserveMonthly: number;
  capexReserveMonthly: number;
  ownerPaidUtilities: number;
  financeUpfrontMip: boolean;
};

export type FhaAnalysisResult = {
  baseLoanAmount: number;
  downPayment: number;
  upfrontMip: number;
  financedUpfrontMip: number;
  totalFinancedLoan: number;
  principalAndInterest: number;
  propertyTaxes: number;
  insurance: number;
  fhaMortgageInsurance: number;
  totalMonthlyCarryingCost: number;
  grossMonthlyRent: number;
  vacancyAllowance: number;
  maintenanceAndCapex: number;
  netEffectiveRent: number;
  effectiveMonthlyOwnerHousingCost: number;
  closingCosts: number;
  totalEstimatedCashRequired: number;
  pricePerUnit: number;
  grossRentMultiplier: number;
  rentToPriceRatio: number;
  breakEvenOccupancy: number;
  laterMoveOutCashFlowMonthly: number;
};

export function calculateMortgagePayment(input: {
  principal: number;
  annualRate: number;
  years: number;
}): number {
  const principal = Number(input.principal) || 0;
  const annualRate = Number(input.annualRate) || 0;
  const years = Number(input.years) || 1;

  if (principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const monthCount = years * 12;

  if (monthlyRate <= 0) {
    return principal / monthCount;
  }

  const factor = (monthlyRate * Math.pow(1 + monthlyRate, monthCount)) / (Math.pow(1 + monthlyRate, monthCount) - 1);
  return principal * factor;
}

export function calculateFhaAnalysis(input: FhaAnalysisInput): FhaAnalysisResult {
  const purchasePrice = Number(input.purchasePrice) || 0;
  const units = Math.max(1, Number(input.units) || 1);
  const annualPropertyTaxes = Number(input.annualPropertyTaxes) || 0;
  const annualInsurance = Number(input.annualInsurance) || 0;
  const interestRate = Number(input.interestRate) || 0;
  const mortgageTermYears = Math.max(1, Number(input.mortgageTermYears) || 30);
  const downPaymentPercent = Number(input.downPaymentPercent) || 0;
  const annualFhaMip = Number(input.annualFhaMip) || 0;
  const upfrontMipPercent = Number(input.upfrontMipPercent) || 0;
  const closingCostPercent = Number(input.closingCostPercent) || 0;
  const repairBudget = Number(input.repairBudget) || 0;
  const sellerCredit = Number(input.sellerCredit) || 0;
  const rentFromOtherUnits = Number(input.rentFromOtherUnits) || 0;
  const vacancyReserveMonthly = Number(input.vacancyReserveMonthly) || 0;
  const maintenanceReserveMonthly = Number(input.maintenanceReserveMonthly) || 0;
  const capexReserveMonthly = Number(input.capexReserveMonthly) || 0;
  const ownerPaidUtilities = Number(input.ownerPaidUtilities) || 0;
  const financeUpfrontMip = Boolean(input.financeUpfrontMip);

  const downPayment = purchasePrice * downPaymentPercent;
  const baseLoanAmount = purchasePrice - downPayment;

  const upfrontMip = baseLoanAmount * upfrontMipPercent;
  const financedUpfrontMip = financeUpfrontMip ? upfrontMip : 0;
  const totalFinancedLoan = baseLoanAmount + financedUpfrontMip;

  const principalAndInterest = calculateMortgagePayment({
    principal: totalFinancedLoan,
    annualRate: interestRate,
    years: mortgageTermYears,
  });

  const propertyTaxes = annualPropertyTaxes / 12;
  const insurance = annualInsurance / 12;
  const fhaMortgageInsurance = (baseLoanAmount * annualFhaMip) / 12;

  const totalMonthlyCarryingCost =
    principalAndInterest + propertyTaxes + insurance + fhaMortgageInsurance + ownerPaidUtilities;

  const grossMonthlyRent = rentFromOtherUnits;
  const vacancyAllowance = vacancyReserveMonthly;
  const maintenanceAndCapex = maintenanceReserveMonthly + capexReserveMonthly;

  const netEffectiveRent = Math.max(0, grossMonthlyRent - vacancyAllowance - maintenanceAndCapex);
  const effectiveMonthlyOwnerHousingCost = totalMonthlyCarryingCost - netEffectiveRent;

  const closingCosts = purchasePrice * closingCostPercent;
  const totalEstimatedCashRequired =
    downPayment + closingCosts + repairBudget + Math.max(0, financedUpfrontMip - sellerCredit);

  const pricePerUnit = purchasePrice / units;
  const grossRentMultiplier = purchasePrice / Math.max(grossMonthlyRent, 1);
  const rentToPriceRatio = grossMonthlyRent / purchasePrice;

  const breakEvenOccupancy = totalMonthlyCarryingCost / Math.max(grossMonthlyRent, 1);

  const laterMoveOutCashFlowMonthly =
    grossMonthlyRent - totalMonthlyCarryingCost - vacancyAllowance - maintenanceAndCapex;

  return {
    baseLoanAmount: roundMoney(baseLoanAmount),
    downPayment: roundMoney(downPayment),
    upfrontMip: roundMoney(upfrontMip),
    financedUpfrontMip: roundMoney(financedUpfrontMip),
    totalFinancedLoan: roundMoney(totalFinancedLoan),
    principalAndInterest: roundMoney(principalAndInterest),
    propertyTaxes: roundMoney(propertyTaxes),
    insurance: roundMoney(insurance),
    fhaMortgageInsurance: roundMoney(fhaMortgageInsurance),
    totalMonthlyCarryingCost: roundMoney(totalMonthlyCarryingCost),
    grossMonthlyRent: roundMoney(grossMonthlyRent),
    vacancyAllowance: roundMoney(vacancyAllowance),
    maintenanceAndCapex: roundMoney(maintenanceAndCapex),
    netEffectiveRent: roundMoney(netEffectiveRent),
    effectiveMonthlyOwnerHousingCost: roundMoney(effectiveMonthlyOwnerHousingCost),
    closingCosts: roundMoney(closingCosts),
    totalEstimatedCashRequired: roundMoney(totalEstimatedCashRequired),
    pricePerUnit: roundMoney(pricePerUnit),
    grossRentMultiplier: roundMoney(grossRentMultiplier),
    rentToPriceRatio: roundMoney(rentToPriceRatio),
    breakEvenOccupancy: roundDollarFraction(breakEvenOccupancy),
    laterMoveOutCashFlowMonthly: roundMoney(laterMoveOutCashFlowMonthly),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundDollarFraction(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function scorePropertyDeal(input: {
  purchasePrice: number;
  estimatedCashRequired: number;
  currentAvailableCash: number;
  emergencyReserve: number;
  effectiveMonthlyHousingCost: number;
  maxEffectiveMonthlyHousingCost: number;
  rentToPriceRatio: number;
  pricePerUnit: number;
  repairBurden: number;
  daysOnMarket: number;
  projectedMonthlyCashFlowAfterMoveOut: number;
  annualTaxes?: number;
}): number {
  const affordabilityComponent = getScoreBand(
    Math.min(100, 100 - Math.max(0, (input.estimatedCashRequired - input.currentAvailableCash) / 20000) * 100),
    0,
    100,
  );

  const costComponent = getScoreBand(
    100 - Math.max(0, (input.effectiveMonthlyHousingCost - input.maxEffectiveMonthlyHousingCost) / 500) * 100,
    0,
    100,
  );

  const rentValueComponent = getScoreBand((input.rentToPriceRatio * 1000) * 100, 0, 100);
  const unitPriceComponent = getScoreBand(100 - (input.pricePerUnit / 200000) * 100, 0, 100);
  const repairComponent = getScoreBand(100 - (input.repairBurden / 20000) * 100, 0, 100);
  const daysOnMarketComponent = getScoreBand(100 - Math.min(100, input.daysOnMarket / 5), 0, 100);
  const reserveComponent = getScoreBand(
    100 - Math.max(0, (input.emergencyReserve - input.estimatedCashRequired) / 5000) * 100,
    0,
    100,
  );
  const cashFlowComponent = getScoreBand(
    50 + Math.min(50, input.projectedMonthlyCashFlowAfterMoveOut / 2),
    0,
    100,
  );

  const total =
    affordabilityComponent * 0.22 +
    costComponent * 0.15 +
    rentValueComponent * 0.15 +
    unitPriceComponent * 0.12 +
    repairComponent * 0.08 +
    daysOnMarketComponent * 0.08 +
    reserveComponent * 0.1 +
    cashFlowComponent * 0.1;

  return clamp(Math.round(total), 0, 100);
}

function getScoreBand(value: number, min: number, max: number) {
  return clamp(value, min, max);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
