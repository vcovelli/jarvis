export type PropertyStatus = "saved" | "rejected" | "compare" | "normal";

export type ListingSource = "demo" | "rentcast" | "manual";

export type PropertyListing = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  price: number;
  units: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyTaxes: number;
  daysOnMarket: number;
  estimatedMarketRent: number;
  monthlyPayment: number;
  imageUrl?: string;
  source: ListingSource;
  externalListingId?: string;
  listingUrl?: string;
  listingStatus?: string;
  listedDate?: string;
  lastSeenDate?: string;
  propertyType?: string;
  mlsName?: string;
  mlsNumber?: string;
  brokerName?: string;
  schoolDistrict?: string;
  notes?: string;
  isDemo?: boolean;
  status?: PropertyStatus;
  lastUpdated?: string;
};

export type ListingSearchFilters = {
  zipOrCity: string;
  radiusMiles: number;
  minPrice: number;
  maxPrice: number;
  unitsMode: "duplex" | "2-4" | "all";
  minBedrooms: number;
  maxDaysOnMarket: number;
  maxCashNeeded: number;
  savedOnly: boolean;
  hideRejected: boolean;
};

export type PropertyFilters = ListingSearchFilters;

export type PropertySortKey =
  | "dealScore"
  | "purchasePrice"
  | "effectiveMonthlyHousingCost"
  | "estimatedCashRequired"
  | "daysOnMarket"
  | "pricePerUnit"
  | "rentToPriceRatio"
  | "moveOutCashFlow";

export type PropertyAssumptions = {
  interestRate: number;
  annualInsurance: number;
  annualFhaMip: number;
  upfrontMipPercent: number;
  closingCostPercent: number;
  repairBudget: number;
  vacancyReserveMonthly: number;
  maintenanceReserveMonthly: number;
  capexReserveMonthly: number;
  ownerPaidUtilities: number;
  sellerCredit: number;
  financeUpfrontMip: boolean;
  maxEffectiveMonthlyHousingCost: number;
  cashAvailable: number;
  emergencyReserve: number;
  expectedBonus: number;
  useProjectedBonus: boolean;
};

export type PropertyAnalysis = {
  id: string;
  propertyId: string;
  assumptions: PropertyAssumptions;
  analysis: ReturnType<typeof import('@/lib/realEstate/calculations').calculateFhaAnalysis>;
  dealScore: number;
  scoreReasons: string[];
  createdAt: string;
  updatedAt: string;
  notes?: string;
};
