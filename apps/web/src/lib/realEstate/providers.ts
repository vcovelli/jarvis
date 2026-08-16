import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ListingSearchFilters, PropertyListing } from "@/lib/realEstate/types";
import { DEMO_PROPERTIES } from "@/lib/realEstate/demoData";

const RENTCAST_SALE_LISTINGS_URL = "https://api.rentcast.io/v1/listings/sale";
const DEFAULT_MARKET_STATE = "OH";
const LIVE_RESULT_LIMIT = 80;
const DEFAULT_RENTCAST_MONTHLY_LIMIT = 50;
const DEFAULT_RENTCAST_MONTHLY_RESERVE = 5;
const DEFAULT_RENTCAST_CACHE_TTL_HOURS = 24;
const RENTCAST_USAGE_HISTORY_LIMIT = 200;

type ProviderSource = "demo" | "live";

type RentCastListing = Record<string, unknown> & {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  status?: string;
  price?: number;
  listedDate?: string;
  createdDate?: string;
  lastSeenDate?: string;
  daysOnMarket?: number;
  mlsName?: string;
  mlsNumber?: string;
  listingOffice?: { name?: unknown };
};

type ParsedLocation = {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

type RentCastCacheEntry = {
  timestamp: number;
  properties: PropertyListing[];
};

type RentCastUsageLedger = {
  month: string;
  count: number;
  requests: Array<{
    timestamp: string;
    cacheKeyHash: string;
    search: string;
  }>;
};

type RentCastQuotaSnapshot = {
  allowed: boolean;
  month: string;
  used: number;
  remaining: number;
  monthlyLimit: number;
  monthlyReserve: number;
  hardCap: number;
};

export type ListingRequestMeta = {
  provider: "demo" | "rentcast";
  servedFromCache: boolean;
  liveRequestAttempted: boolean;
  quotaBlocked: boolean;
  cacheTtlHours: number;
  monthlyLimit: number;
  monthlyReserve: number;
  hardCap: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  usageMonth: string;
  resultLimit: number;
};

const rentCastCache = new Map<string, RentCastCacheEntry>();
const rentCastUsageCache = new Map<string, RentCastUsageLedger>();
let rentCastUsageQueue: Promise<RentCastQuotaSnapshot> = Promise.resolve(buildQuotaSnapshot(newUsageLedger()));

export interface ListingProvider {
  source: ProviderSource;
  requestMeta: ListingRequestMeta;
  searchListings(filters: ListingSearchFilters): Promise<PropertyListing[]>;
}

export class DemoListingProvider implements ListingProvider {
  source = "demo" as const;
  requestMeta = buildRequestMeta({ provider: "demo", servedFromCache: false, liveRequestAttempted: false });

  async searchListings(filters: ListingSearchFilters): Promise<PropertyListing[]> {
    return applyListingFilters(DEMO_PROPERTIES, filters).sort((a, b) => a.daysOnMarket - b.daysOnMarket);
  }
}

export class RentCastProvider implements ListingProvider {
  source: ProviderSource = "live";
  requestMeta = buildRequestMeta({ provider: "rentcast", servedFromCache: false, liveRequestAttempted: false });

  constructor(private readonly apiKey?: string) {}

  async searchListings(filters: ListingSearchFilters): Promise<PropertyListing[]> {
    if (!this.apiKey) {
      this.source = "demo";
      return new DemoListingProvider().searchListings(filters);
    }

    const url = buildRentCastUrl(filters);
    const cacheKey = url.toString();
    const cached = await getCachedRentCastListings(cacheKey);
    if (cached) {
      this.requestMeta = buildRequestMeta({
        provider: "rentcast",
        servedFromCache: true,
        liveRequestAttempted: false,
        quota: await getRentCastQuotaSnapshot(),
      });
      return applyListingFilters(cached, filters).sort((a, b) => a.daysOnMarket - b.daysOnMarket);
    }

    const quota = await reserveRentCastRequest(cacheKey, filters);
    if (!quota.allowed) {
      this.source = "demo";
      this.requestMeta = buildRequestMeta({
        provider: "demo",
        servedFromCache: false,
        liveRequestAttempted: false,
        quotaBlocked: true,
        quota,
      });
      return new DemoListingProvider().searchListings(filters);
    }

    try {
      this.requestMeta = buildRequestMeta({ provider: "rentcast", servedFromCache: false, liveRequestAttempted: true, quota });
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-Api-Key": this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`RentCast listings request failed with ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      const listings = Array.isArray(payload) ? payload : [];
      const normalized = listings
        .map((listing) => normalizeRentCastListing(listing as RentCastListing))
        .filter((listing): listing is PropertyListing => Boolean(listing));

      await setCachedRentCastListings(cacheKey, normalized);

      return applyListingFilters(normalized, filters).sort((a, b) => a.daysOnMarket - b.daysOnMarket);
    } catch {
      this.source = "demo";
      this.requestMeta = buildRequestMeta({ provider: "demo", servedFromCache: false, liveRequestAttempted: true, quota });
      return new DemoListingProvider().searchListings(filters);
    }
  }
}

export function createListingProvider(options: { forceDemo?: boolean } = {}): ListingProvider {
  if (options.forceDemo) return new DemoListingProvider();

  const key = process.env.RENTCAST_API_KEY?.trim();
  return key ? new RentCastProvider(key) : new DemoListingProvider();
}


function buildRequestMeta({
  provider,
  servedFromCache,
  liveRequestAttempted,
  quotaBlocked = false,
  quota,
}: {
  provider: "demo" | "rentcast";
  servedFromCache: boolean;
  liveRequestAttempted: boolean;
  quotaBlocked?: boolean;
  quota?: RentCastQuotaSnapshot;
}): ListingRequestMeta {
  const currentQuota = quota ?? buildQuotaSnapshot(newUsageLedger());
  return {
    provider,
    servedFromCache,
    liveRequestAttempted,
    quotaBlocked,
    cacheTtlHours: getRentCastCacheTtlHours(),
    monthlyLimit: currentQuota.monthlyLimit,
    monthlyReserve: currentQuota.monthlyReserve,
    hardCap: currentQuota.hardCap,
    monthlyUsed: currentQuota.used,
    monthlyRemaining: currentQuota.remaining,
    usageMonth: currentQuota.month,
    resultLimit: LIVE_RESULT_LIMIT,
  };
}

function getRentCastMonthlyLimit() {
  const parsed = Number(process.env.RENTCAST_MONTHLY_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RENTCAST_MONTHLY_LIMIT;
}

function getRentCastMonthlyReserve() {
  const parsed = Number(process.env.RENTCAST_MONTHLY_RESERVE);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_RENTCAST_MONTHLY_RESERVE;
}

function getRentCastHardCap() {
  return Math.max(0, getRentCastMonthlyLimit() - getRentCastMonthlyReserve());
}

function getRentCastCacheTtlHours() {
  const parsed = Number(process.env.RENTCAST_CACHE_TTL_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RENTCAST_CACHE_TTL_HOURS;
}

function getRentCastCacheTtlMs() {
  return getRentCastCacheTtlHours() * 60 * 60 * 1000;
}

async function getCachedRentCastListings(cacheKey: string) {
  const memoryCached = validateCacheEntry(rentCastCache.get(cacheKey));
  if (memoryCached) return memoryCached;

  try {
    const fileContents = await readFile(getRentCastCacheFilePath(cacheKey), "utf8");
    const parsed = JSON.parse(fileContents) as RentCastCacheEntry;
    const fileCached = validateCacheEntry(parsed);
    if (!fileCached) return null;

    rentCastCache.set(cacheKey, parsed);
    return fileCached;
  } catch {
    return null;
  }
}

async function setCachedRentCastListings(cacheKey: string, properties: PropertyListing[]) {
  const entry = { timestamp: Date.now(), properties };
  rentCastCache.set(cacheKey, entry);

  const cacheFilePath = getRentCastCacheFilePath(cacheKey);
  await mkdir(path.dirname(cacheFilePath), { recursive: true });
  await writeFile(cacheFilePath, JSON.stringify(entry), "utf8");
}

function validateCacheEntry(entry: RentCastCacheEntry | undefined | null) {
  if (!entry || !Array.isArray(entry.properties)) return null;

  if (Date.now() - entry.timestamp > getRentCastCacheTtlMs()) {
    return null;
  }

  return entry.properties;
}

function getRentCastCacheFilePath(cacheKey: string) {
  const hash = createHash("sha256").update(cacheKey).digest("hex");
  return path.join(process.cwd(), ".rentcast-cache", "listings", `${hash}.json`);
}

async function getRentCastQuotaSnapshot() {
  return buildQuotaSnapshot(await readRentCastUsageLedger());
}

async function reserveRentCastRequest(cacheKey: string, filters: ListingSearchFilters) {
  rentCastUsageQueue = rentCastUsageQueue
    .catch(() => buildFailClosedQuotaSnapshot())
    .then(async () => {
      try {
        const ledger = await readRentCastUsageLedger();
        const before = buildQuotaSnapshot(ledger);

        if (!before.allowed) return before;

        const cacheKeyHash = createHash("sha256").update(cacheKey).digest("hex");
        const updated: RentCastUsageLedger = {
          month: ledger.month,
          count: ledger.count + 1,
          requests: [
            ...ledger.requests,
            {
              timestamp: new Date().toISOString(),
              cacheKeyHash,
              search: summarizeFilters(filters),
            },
          ].slice(-RENTCAST_USAGE_HISTORY_LIMIT),
        };

        await writeRentCastUsageLedger(updated);
        return buildQuotaSnapshot(updated);
      } catch {
        return buildFailClosedQuotaSnapshot();
      }
    });

  return rentCastUsageQueue;
}

async function readRentCastUsageLedger() {
  const month = getRentCastUsageMonth();
  const cached = rentCastUsageCache.get(month);
  if (cached) return cached;

  try {
    const fileContents = await readFile(getRentCastUsageFilePath(month), "utf8");
    const parsed = JSON.parse(fileContents) as RentCastUsageLedger;
    const ledger = parsed.month === month && Number.isFinite(parsed.count) && Array.isArray(parsed.requests)
      ? { ...parsed, count: Math.max(0, Math.floor(parsed.count)) }
      : newUsageLedger(month);
    rentCastUsageCache.set(month, ledger);
    return ledger;
  } catch {
    const ledger = newUsageLedger(month);
    rentCastUsageCache.set(month, ledger);
    return ledger;
  }
}

async function writeRentCastUsageLedger(ledger: RentCastUsageLedger) {
  rentCastUsageCache.set(ledger.month, ledger);
  const usageFilePath = getRentCastUsageFilePath(ledger.month);
  await mkdir(path.dirname(usageFilePath), { recursive: true });
  await writeFile(usageFilePath, JSON.stringify(ledger, null, 2), "utf8");
}

function buildQuotaSnapshot(ledger: RentCastUsageLedger): RentCastQuotaSnapshot {
  const hardCap = getRentCastHardCap();
  const remaining = Math.max(0, hardCap - ledger.count);
  return {
    allowed: remaining > 0,
    month: ledger.month,
    used: ledger.count,
    remaining,
    monthlyLimit: getRentCastMonthlyLimit(),
    monthlyReserve: getRentCastMonthlyReserve(),
    hardCap,
  };
}

function buildFailClosedQuotaSnapshot(): RentCastQuotaSnapshot {
  const month = getRentCastUsageMonth();
  const hardCap = getRentCastHardCap();
  return {
    allowed: false,
    month,
    used: hardCap,
    remaining: 0,
    monthlyLimit: getRentCastMonthlyLimit(),
    monthlyReserve: getRentCastMonthlyReserve(),
    hardCap,
  };
}

function newUsageLedger(month = getRentCastUsageMonth()): RentCastUsageLedger {
  return { month, count: 0, requests: [] };
}

function getRentCastUsageMonth(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getRentCastUsageFilePath(month: string) {
  return path.join(process.cwd(), ".rentcast-cache", "usage", `${month}.json`);
}

function summarizeFilters(filters: ListingSearchFilters) {
  return [
    filters.zipOrCity,
    `${filters.radiusMiles}mi`,
    `${filters.minPrice}-${filters.maxPrice}`,
    filters.unitsMode,
    `${filters.minBedrooms}+bd`,
    `${filters.maxDaysOnMarket}dom`,
  ].join(" | ");
}

function buildRentCastUrl(filters: ListingSearchFilters) {
  const url = new URL(RENTCAST_SALE_LISTINGS_URL);
  const location = parseLocationInput(filters.zipOrCity);

  url.searchParams.set("status", "Active");
  url.searchParams.set("limit", String(LIVE_RESULT_LIMIT));
  url.searchParams.set("includeTotalCount", "false");
  url.searchParams.set("price", `${Math.max(0, filters.minPrice || 0)}:${filters.maxPrice > 0 ? filters.maxPrice : "*"}`);
  url.searchParams.set("bedrooms", `${Math.max(0, filters.minBedrooms || 0)}:*`);
  url.searchParams.set("daysOld", `*:${Math.max(1, filters.maxDaysOnMarket || 120)}`);

  if (filters.unitsMode !== "all") {
    url.searchParams.set("propertyType", "Multi-Family");
  }

  if (location.address) {
    url.searchParams.set("address", location.address);
    url.searchParams.set("radius", String(Math.min(Math.max(filters.radiusMiles, 1), 100)));
  } else if (location.zipCode) {
    url.searchParams.set("zipCode", location.zipCode);
  } else {
    url.searchParams.set("city", location.city ?? "Cleveland");
    url.searchParams.set("state", location.state ?? DEFAULT_MARKET_STATE);
  }

  return url;
}

function normalizeRentCastListing(raw: RentCastListing): PropertyListing | null {
  const price = readNumber(raw.price);
  if (!price || price <= 0) return null;

  const address = readString(raw.addressLine1) ?? readString(raw.formattedAddress)?.split(",")[0]?.trim() ?? "Unknown address";
  const city = readString(raw.city) ?? "Unknown";
  const state = readString(raw.state) ?? DEFAULT_MARKET_STATE;
  const zip = readString(raw.zipCode) ?? readString(raw.zip) ?? "";
  const propertyType = readString(raw.propertyType);
  const bedrooms = readNumber(raw.bedrooms) ?? 0;
  const bathrooms = readNumber(raw.bathrooms) ?? 0;
  const squareFeet = readNumber(raw.squareFootage, raw.livingArea, raw.livingAreaSquareFeet) ?? 0;
  const units = inferUnitCount(raw, propertyType, bedrooms);
  const daysOnMarket = readNumber(raw.daysOnMarket, raw.daysOld) ?? daysBetween(readString(raw.listedDate), new Date());
  const estimatedMarketRent = estimateRentFromListing(raw, price, units, bedrooms, state);
  const listedDate = readString(raw.listedDate, raw.createdDate);
  const lastSeenDate = readString(raw.lastSeenDate, raw.updatedDate, raw.createdDate);
  const id = readString(raw.id) ?? `${address}-${city}-${state}-${zip}`;

  return {
    id: `rentcast-${id}`,
    address,
    city,
    state,
    zip,
    latitude: readNumber(raw.latitude),
    longitude: readNumber(raw.longitude),
    price,
    units,
    bedrooms,
    bathrooms,
    squareFeet,
    lotSize: readNumber(raw.lotSize),
    yearBuilt: readNumber(raw.yearBuilt),
    propertyTaxes: estimateAnnualTaxes(raw, price, state),
    daysOnMarket: Math.max(0, Math.round(daysOnMarket)),
    estimatedMarketRent,
    monthlyPayment: Math.round(price * 0.0052),
    imageUrl: readImageUrl(raw),
    source: "rentcast",
    externalListingId: id,
    listingUrl: readString(raw.listingUrl, raw.url, raw.sourceUrl),
    listingStatus: readString(raw.status),
    listedDate,
    lastSeenDate,
    propertyType,
    mlsName: readString(raw.mlsName),
    mlsNumber: readString(raw.mlsNumber),
    brokerName: readBrokerName(raw),
    notes: "Live sale listing normalized from RentCast. Rent and taxes use listing fields when present, otherwise conservative estimates.",
    isDemo: false,
    status: "normal",
    lastUpdated: lastSeenDate ?? listedDate ?? new Date().toISOString(),
  };
}

function applyListingFilters(properties: PropertyListing[], filters: ListingSearchFilters) {
  const normalized = filters.zipOrCity.trim().toLowerCase();
  const normalizedCity = normalized.split(",")[0]?.trim() ?? normalized;

  return properties.filter((property) => {
    const haystack = `${property.address} ${property.city} ${property.state} ${property.zip}`.toLowerCase();
    const demoMarketMatch =
      property.source === "demo" &&
      property.state === DEFAULT_MARKET_STATE &&
      (normalizedCity === "cleveland" || normalized === "44094");
    const locationMatch =
      normalized.length === 0 ||
      demoMarketMatch ||
      haystack.includes(normalized) ||
      (normalizedCity.length > 0 && haystack.includes(normalizedCity));
    const priceMatch = property.price >= filters.minPrice && property.price <= filters.maxPrice;
    const unitMatch =
      filters.unitsMode === "all" ||
      (filters.unitsMode === "duplex" && property.units === 2) ||
      (filters.unitsMode === "2-4" && property.units >= 2 && property.units <= 4);
    const bedroomsMatch = property.bedrooms >= filters.minBedrooms;
    const domMatch = property.daysOnMarket <= filters.maxDaysOnMarket;
    const propertyStatusMatch = !filters.savedOnly || property.status === "saved";
    const hiddenRejected = filters.hideRejected ? property.status !== "rejected" : true;

    return locationMatch && priceMatch && unitMatch && bedroomsMatch && domMatch && propertyStatusMatch && hiddenRejected;
  });
}

function parseLocationInput(value: string): ParsedLocation {
  const trimmed = value.trim();
  if (!trimmed) return { city: "Cleveland", state: DEFAULT_MARKET_STATE };

  const zipCode = trimmed.match(/\b\d{5}\b/)?.[0];
  const looksLikeAddress = /^\d+\s+/.test(trimmed) && trimmed.includes(",");
  if (looksLikeAddress) return { address: trimmed };
  if (zipCode) return { zipCode };

  const [cityPart, statePart] = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    city: toTitleCase(cityPart || trimmed),
    state: statePart ? statePart.slice(0, 2).toUpperCase() : DEFAULT_MARKET_STATE,
  };
}

function inferUnitCount(raw: RentCastListing, propertyType: string | undefined, bedrooms: number) {
  const explicitUnits = readNumber(raw.units, raw.unitCount, raw.unitsCount, raw.numberOfUnits, raw.totalUnits);
  if (explicitUnits && explicitUnits > 0) return Math.max(1, Math.round(explicitUnits));

  const normalizedType = propertyType?.toLowerCase() ?? "";
  if (normalizedType.includes("duplex")) return 2;
  if (normalizedType.includes("triplex")) return 3;
  if (normalizedType.includes("quad")) return 4;
  if (normalizedType.includes("multi")) return Math.max(2, Math.min(4, Math.round((bedrooms || 4) / 2)));

  return 1;
}

function estimateRentFromListing(raw: RentCastListing, price: number, units: number, bedrooms: number, state: string) {
  const rent = readNumber(raw.estimatedMarketRent, raw.rentEstimate, raw.marketRent, raw.rent, raw.monthlyRent);
  if (rent && rent > 0) return rent;

  const nonOwnerUnits = Math.max(1, units - 1);
  const bedroomRent = nonOwnerUnits * (725 + Math.min(Math.max(bedrooms, 1), 6) * 150);
  const marketRatio = state === "OH" ? 0.0072 : 0.0064;
  return roundToNearest(Math.max(bedroomRent, price * marketRatio), 25);
}

function estimateAnnualTaxes(raw: RentCastListing, price: number, state: string) {
  const taxAssessment = isRecord(raw.taxAssessment) ? raw.taxAssessment : null;
  const explicitTaxes = readNumber(
    raw.propertyTaxes,
    raw.annualPropertyTaxes,
    raw.taxAnnualAmount,
    raw.taxAmount,
    taxAssessment?.propertyTaxes,
  );

  if (explicitTaxes && explicitTaxes > 0) return explicitTaxes;

  const assumedRate = state === "OH" ? 0.0175 : 0.0135;
  return roundToNearest(price * assumedRate, 25);
}

function readImageUrl(raw: RentCastListing) {
  const direct = readString(raw.imageUrl, raw.primaryImageUrl, raw.thumbnailUrl);
  if (direct) return direct;

  const photos = raw.photos;
  if (!Array.isArray(photos) || photos.length === 0) return undefined;

  const firstPhoto = photos[0];
  if (typeof firstPhoto === "string") return firstPhoto;
  if (isRecord(firstPhoto)) return readString(firstPhoto.url, firstPhoto.href, firstPhoto.imageUrl);

  return undefined;
}

function readBrokerName(raw: RentCastListing) {
  if (isRecord(raw.listingOffice)) {
    return readString(raw.listingOffice.name);
  }
  return readString(raw.brokerName, raw.listingOfficeName);
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function daysBetween(dateValue: string | undefined, end: Date) {
  if (!dateValue) return 0;
  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
}

function roundToNearest(value: number, increment: number) {
  return Math.round(value / increment) * increment;
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
