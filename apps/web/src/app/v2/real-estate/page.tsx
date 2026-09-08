"use client";

import { useEffect, useMemo, useState } from "react";

import { MobileSectionNav } from "@/components/MobileSectionNav";

import { calculateFhaAnalysis, scorePropertyDeal } from "@/lib/realEstate/calculations";
import { BASE_ASSUMPTIONS } from "@/lib/realEstate/demoData";
import { formatDays, formatMoney, formatNumber, formatPercent } from "@/lib/realEstate/formatters";
import type { ListingSearchFilters, PropertyAssumptions, PropertyListing, PropertySortKey, PropertyStatus } from "@/lib/realEstate/types";

const STATUS_STORAGE_KEY = "jarvis-real-estate-status-overrides";

const DEFAULT_FILTERS: ListingSearchFilters = {
  zipOrCity: "Cleveland, OH",
  radiusMiles: 15,
  minPrice: 150000,
  maxPrice: 500000,
  unitsMode: "2-4" as const,
  minBedrooms: 2,
  maxDaysOnMarket: 120,
  maxCashNeeded: 50000,
  savedOnly: false,
  hideRejected: true,
};

const MANUAL_FORM_DEFAULTS = {
  address: "",
  city: "Cleveland",
  state: "OH",
  zip: "44113",
  price: 285000,
  units: 2,
  bedrooms: 4,
  bathrooms: 2,
  squareFeet: 1480,
  propertyTaxes: 4200,
  daysOnMarket: 18,
  estimatedMarketRent: 2100,
};

const defaultAssumptions: PropertyAssumptions = {
  ...BASE_ASSUMPTIONS,
};

type ListingRequestInfo = {
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

type ListingApiResponse = {
  source: "demo" | "live";
  isDemoData: boolean;
  generatedAt?: string;
  request?: ListingRequestInfo;
  properties: PropertyListing[];
};

type ScanProfile = {
  cashDelta: number;
  ownerCostDelta: number;
  tone: "good" | "watch" | "bad" | "neutral";
  nextAction: string;
  flags: string[];
};

type RealEstateMobileView = "scanner" | "filters" | "analysis" | "map";
type EnrichedProperty = PropertyListing & {
  analysis: ReturnType<typeof calculateFhaAnalysis>;
  dealScore: number;
  reasons: string[];
  scan: ScanProfile;
};

export default function RealEstatePage() {
  const [filters, setFilters] = useState<ListingSearchFilters>(DEFAULT_FILTERS);
  const [searchFilters, setSearchFilters] = useState<ListingSearchFilters>(DEFAULT_FILTERS);
  const [scanVersion, setScanVersion] = useState(0);
  const [liveListingsEnabled, setLiveListingsEnabled] = useState(false);
  const [sortBy, setSortBy] = useState<PropertySortKey>("dealScore");
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, PropertyStatus>>({});
  const [statusesHydrated, setStatusesHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"demo" | "live">("demo");
  const [mobileView, setMobileView] = useState<RealEstateMobileView>("scanner");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [requestInfo, setRequestInfo] = useState<ListingRequestInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualForm, setManualForm] = useState(MANUAL_FORM_DEFAULTS);
  const [assumptions, setAssumptions] = useState<PropertyAssumptions>(defaultAssumptions);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STATUS_STORAGE_KEY);
      if (stored) {
        setStatusOverrides(JSON.parse(stored) as Record<string, PropertyStatus>);
      }
    } catch {
      setStatusOverrides({});
    } finally {
      setStatusesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!statusesHydrated) return;
    window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statusOverrides));
  }, [statusOverrides, statusesHydrated]);

  useEffect(() => {
    const controller = new AbortController();
    const loadProperties = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          zipOrCity: searchFilters.zipOrCity,
          radiusMiles: String(searchFilters.radiusMiles),
          minPrice: String(searchFilters.minPrice),
          maxPrice: String(searchFilters.maxPrice),
          unitsMode: searchFilters.unitsMode,
          minBedrooms: String(searchFilters.minBedrooms),
          maxDaysOnMarket: String(searchFilters.maxDaysOnMarket),
          maxCashNeeded: String(searchFilters.maxCashNeeded),
          savedOnly: "false",
          hideRejected: "false",
          provider: liveListingsEnabled ? "live" : "demo",
        });

        const response = await fetch(`/api/real-estate/listings?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load real-estate listings.");
        const payload = (await response.json()) as ListingApiResponse;
        setSource(payload.source);
        setGeneratedAt(payload.generatedAt ?? new Date().toISOString());
        setRequestInfo(payload.request ?? null);
        setProperties(payload.properties);
        setSelectedId((current) => {
          if (current && payload.properties.some((property) => property.id === current)) return current;
          return payload.properties[0]?.id ?? null;
        });
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load listings.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadProperties();
    return () => controller.abort();
  }, [liveListingsEnabled, scanVersion, searchFilters.zipOrCity, searchFilters.radiusMiles, searchFilters.minPrice, searchFilters.maxPrice, searchFilters.unitsMode, searchFilters.minBedrooms, searchFilters.maxDaysOnMarket, searchFilters.maxCashNeeded]);

  const hasPendingSearchChanges = useMemo(() => hasSearchFilterChanges(filters, searchFilters), [filters, searchFilters]);
  const rentCastBudgetLabel = requestInfo
    ? `${requestInfo.monthlyUsed}/${requestInfo.hardCap} used, ${requestInfo.monthlyRemaining} left`
    : "0/45 used, 45 left";
  const rentCastPolicyLabel = requestInfo
    ? `${requestInfo.monthlyReserve} reserved of ${requestInfo.monthlyLimit}, ${requestInfo.cacheTtlHours}h cache`
    : "5 reserved of 50, 24h cache";
  const requestLabel = requestInfo?.quotaBlocked
    ? "Quota locked"
    : requestInfo?.servedFromCache
      ? "Cached result"
      : requestInfo?.liveRequestAttempted
        ? "Live call used"
        : "No live call";

  const runLiveScan = () => {
    setLiveListingsEnabled(true);
    setSearchFilters({ ...filters });
    setScanVersion((current) => current + 1);
  };

  const buyingPower = assumptions.useProjectedBonus
    ? assumptions.cashAvailable + assumptions.expectedBonus
    : assumptions.cashAvailable;

  const statusMergedProperties = useMemo(
    () =>
      properties.map((property) => ({
        ...property,
        status: statusOverrides[property.id] ?? property.status ?? "normal",
      })),
    [properties, statusOverrides],
  );

  const enrichedProperties = useMemo(
    () =>
      statusMergedProperties.map((property) => {
        const analysis = calculateFhaAnalysis({
          purchasePrice: property.price,
          units: property.units,
          annualPropertyTaxes: property.propertyTaxes,
          annualInsurance: assumptions.annualInsurance,
          interestRate: assumptions.interestRate,
          mortgageTermYears: 30,
          downPaymentPercent: 0.035,
          annualFhaMip: assumptions.annualFhaMip,
          upfrontMipPercent: assumptions.upfrontMipPercent,
          closingCostPercent: assumptions.closingCostPercent,
          repairBudget: assumptions.repairBudget,
          sellerCredit: assumptions.sellerCredit,
          rentFromOtherUnits: property.estimatedMarketRent,
          vacancyReserveMonthly: assumptions.vacancyReserveMonthly,
          maintenanceReserveMonthly: assumptions.maintenanceReserveMonthly,
          capexReserveMonthly: assumptions.capexReserveMonthly,
          ownerPaidUtilities: assumptions.ownerPaidUtilities,
          financeUpfrontMip: assumptions.financeUpfrontMip,
        });

        const dealScore = scorePropertyDeal({
          purchasePrice: property.price,
          estimatedCashRequired: analysis.totalEstimatedCashRequired,
          currentAvailableCash: buyingPower,
          emergencyReserve: assumptions.emergencyReserve,
          effectiveMonthlyHousingCost: analysis.effectiveMonthlyOwnerHousingCost,
          maxEffectiveMonthlyHousingCost: assumptions.maxEffectiveMonthlyHousingCost,
          rentToPriceRatio: analysis.rentToPriceRatio,
          pricePerUnit: analysis.pricePerUnit,
          repairBurden: assumptions.repairBudget,
          daysOnMarket: property.daysOnMarket,
          projectedMonthlyCashFlowAfterMoveOut: analysis.laterMoveOutCashFlowMonthly,
        });

        const scan = buildScanProfile({ property, analysis, dealScore, buyingPower, assumptions });

        return {
          ...property,
          analysis,
          dealScore,
          scan,
          reasons: buildDealReasons({
            property,
            analysis,
            dealScore,
            assumptions,
            buyingPower,
          }),
        };
      }),
    [assumptions, buyingPower, statusMergedProperties],
  );

  const filteredProperties = useMemo(
    () =>
      enrichedProperties.filter((property) => {
        const cashMatch = filters.maxCashNeeded <= 0 || property.analysis.totalEstimatedCashRequired <= filters.maxCashNeeded;
        const savedMatch = !filters.savedOnly || property.status === "saved";
        const rejectedMatch = !filters.hideRejected || property.status !== "rejected";
        return cashMatch && savedMatch && rejectedMatch;
      }),
    [enrichedProperties, filters.hideRejected, filters.maxCashNeeded, filters.savedOnly],
  );

  const sortedProperties = useMemo(() => {
    const list = [...filteredProperties];
    list.sort((left, right) => {
      switch (sortBy) {
        case "purchasePrice":
          return left.price - right.price;
        case "effectiveMonthlyHousingCost":
          return left.analysis.effectiveMonthlyOwnerHousingCost - right.analysis.effectiveMonthlyOwnerHousingCost;
        case "estimatedCashRequired":
          return left.analysis.totalEstimatedCashRequired - right.analysis.totalEstimatedCashRequired;
        case "daysOnMarket":
          return left.daysOnMarket - right.daysOnMarket;
        case "pricePerUnit":
          return left.analysis.pricePerUnit - right.analysis.pricePerUnit;
        case "rentToPriceRatio":
          return right.analysis.rentToPriceRatio - left.analysis.rentToPriceRatio;
        case "moveOutCashFlow":
          return right.analysis.laterMoveOutCashFlowMonthly - left.analysis.laterMoveOutCashFlowMonthly;
        default:
          return right.dealScore - left.dealScore;
      }
    });
    return list;
  }, [filteredProperties, sortBy]);

  useEffect(() => {
    if (sortedProperties.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !sortedProperties.some((property) => property.id === selectedId)) {
      setSelectedId(sortedProperties[0].id);
    }
  }, [selectedId, sortedProperties]);

  const selectedProperty = sortedProperties.find((property) => property.id === selectedId) ?? sortedProperties[0] ?? null;
  const summary = useMemo(() => buildSummary(sortedProperties, buyingPower), [buyingPower, sortedProperties]);
  const selectedMapUrl = selectedProperty ? buildMapUrl(selectedProperty) : null;

  const handleSaveToggle = (propertyId: string, status: PropertyStatus) => {
    setStatusOverrides((current) => ({ ...current, [propertyId]: status }));
    setProperties((current) =>
      current.map((property) =>
        property.id === propertyId
          ? { ...property, status }
          : property,
      ),
    );
  };

  const handleManualAdd = () => {
    const units = Number(manualForm.units) || 1;
    const nextProperty: PropertyListing = {
      id: `manual-${Date.now()}`,
      address: manualForm.address || "Manual lead",
      city: manualForm.city,
      state: manualForm.state,
      zip: manualForm.zip,
      price: Number(manualForm.price),
      units,
      bedrooms: Number(manualForm.bedrooms),
      bathrooms: Number(manualForm.bathrooms),
      squareFeet: Number(manualForm.squareFeet),
      propertyTaxes: Number(manualForm.propertyTaxes),
      daysOnMarket: Number(manualForm.daysOnMarket),
      estimatedMarketRent: Number(manualForm.estimatedMarketRent),
      monthlyPayment: Number(manualForm.price) * 0.0052,
      source: "manual",
      propertyType: units === 2 ? "Duplex" : `${units} unit`,
      listingStatus: "Manual lead",
      isDemo: false,
      status: "saved",
      lastUpdated: new Date().toISOString(),
    };

    setProperties((current) => [nextProperty, ...current]);
    setStatusOverrides((current) => ({ ...current, [nextProperty.id]: "saved" }));
    setSelectedId(nextProperty.id);
    setManualEntryOpen(false);
    setManualForm(MANUAL_FORM_DEFAULTS);
    setMobileView("scanner");
  };

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <section className="glass-panel mobile-card-padding mobile-compact-header rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/80">Jarvis real estate</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-4xl">Deal scanner</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300 lg:hidden">
              Ranked FHA opportunities, buying-power fit, and the next property worth reviewing.
            </p>
            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-zinc-300 lg:block">
              Live RentCast inventory when configured, with demo fallback. Listings are ranked by FHA cash, owner cost, rent strength, speed, and exit cash flow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            <StatusPill label={source === "demo" ? "Demo fallback" : "Live listings"} tone={source === "demo" ? "warn" : "good"} />
            <span className="hidden sm:contents">
            <StatusPill label="FHA 3.5% down" tone="neutral" />
            <StatusPill label={requestLabel} tone={requestInfo?.quotaBlocked ? "warn" : requestInfo?.liveRequestAttempted && !requestInfo.servedFromCache ? "warn" : "neutral"} />
            <StatusPill label={rentCastBudgetLabel} tone={requestInfo?.monthlyRemaining === 0 ? "warn" : "neutral"} />
            <StatusPill label={rentCastPolicyLabel} tone="neutral" />
            <StatusPill label={generatedAt ? `Updated ${formatDateTime(generatedAt)}` : "Scanning"} tone="neutral" />
            </span>
            <button type="button" onClick={() => { setMobileView("filters"); setManualEntryOpen((current) => !current); }} className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20">Manual entry</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-4 xl:grid-cols-5">
          <MetricCard label="Visible leads" value={`${summary.propertiesCount}`} detail={`${summary.hotLeadCount} hot, ${summary.watchLeadCount} watch`} />
          <MetricCard label="Median price" value={formatMoney(summary.medianPrice)} detail={`${formatDays(summary.averageDaysOnMarket)} avg DOM`} />
          <MetricCard label="Avg cash needed" value={formatMoney(summary.averageCashRequired)} detail={`${summary.underCashCount} fit buying power`} />
          <MetricCard label="Best move-out" value={formatMoney(summary.bestMoveOutCashFlow)} detail={`${summary.positiveCashFlowCount} positive`} />
          <MetricCard label="Buying power" value={formatMoney(buyingPower)} detail={assumptions.useProjectedBonus ? "Cash + projected bonus" : "Current cash"} />
        </div>
      </section>
      <MobileSectionNav
        label="Real estate sections"
        value={mobileView}
        onChange={setMobileView}
        options={[
          { value: "scanner", label: "Leads", badge: summary.propertiesCount },
          { value: "filters", label: "Filters" },
          { value: "analysis", label: "Analysis" },
          { value: "map", label: "Map" },
        ]}
      />

      <section data-guide="property-filters" className={(mobileView === "filters" ? "" : "hidden lg:block ") + "glass-panel mobile-card-padding rounded-3xl border border-white/10 bg-white/5 p-5"}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Search board</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Market filters</h2>
            <p className="mt-1 text-sm text-zinc-400">Edits filter the current board locally. Run scan submits one live RentCast search only when the server quota allows it.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickButton label="Hot leads" onClick={() => setSortBy("dealScore")} />
            <QuickButton label="Under cash" onClick={() => setFilters((current) => ({ ...current, maxCashNeeded: Math.max(0, buyingPower) }))} />
            <QuickButton label="Fresh" onClick={() => setFilters((current) => ({ ...current, maxDaysOnMarket: 30 }))} />
            <QuickButton label="2-4 units" onClick={() => setFilters((current) => ({ ...current, unitsMode: "2-4" }))} />
            <QuickButton label="Reset" onClick={() => setFilters(DEFAULT_FILTERS)} />
            <button type="button" onClick={runLiveScan} disabled={loading} className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200/70 hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Scanning" : requestInfo?.monthlyRemaining === 0 ? "Quota locked" : hasPendingSearchChanges ? "Run live scan" : "Refresh scan"}</button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="min-w-0 text-xs text-zinc-400 xl:col-span-2">
            <span className="mb-2 block uppercase tracking-[0.25em]">ZIP / city</span>
            <input value={filters.zipOrCity} onChange={(event) => setFilters((current) => ({ ...current, zipOrCity: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none ring-0 placeholder:text-zinc-500" />
          </label>
          <NumberFilter label="Radius" value={filters.radiusMiles} min={1} max={100} onChange={(value) => setFilters((current) => ({ ...current, radiusMiles: value || 1 }))} />
          <NumberFilter label="Min price" value={filters.minPrice} onChange={(value) => setFilters((current) => ({ ...current, minPrice: value || 0 }))} />
          <NumberFilter label="Max price" value={filters.maxPrice} onChange={(value) => setFilters((current) => ({ ...current, maxPrice: value || 500000 }))} />
          <label className="text-xs text-zinc-400">
            <span className="mb-2 block uppercase tracking-[0.25em]">Units</span>
            <select value={filters.unitsMode} onChange={(event) => setFilters((current) => ({ ...current, unitsMode: event.target.value as typeof filters.unitsMode }))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white">
              <option value="duplex">Duplex</option>
              <option value="2-4">2-4 units</option>
              <option value="all">All</option>
            </select>
          </label>
          <NumberFilter label="Min beds" value={filters.minBedrooms} min={0} onChange={(value) => setFilters((current) => ({ ...current, minBedrooms: value || 0 }))} />
          <NumberFilter label="Max DOM" value={filters.maxDaysOnMarket} min={1} onChange={(value) => setFilters((current) => ({ ...current, maxDaysOnMarket: value || 120 }))} />
          <NumberFilter label="Max cash" value={filters.maxCashNeeded} min={0} onChange={(value) => setFilters((current) => ({ ...current, maxCashNeeded: value || 0 }))} />
          <ToggleFilter id="savedOnly" label="Saved only" checked={filters.savedOnly} onChange={(checked) => setFilters((current) => ({ ...current, savedOnly: checked }))} />
          <ToggleFilter id="hideRejected" label="Hide rejected" checked={filters.hideRejected} onChange={(checked) => setFilters((current) => ({ ...current, hideRejected: checked }))} />
          <label className="text-xs text-zinc-400 xl:col-span-2">
            <span className="mb-2 block uppercase tracking-[0.25em]">Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as PropertySortKey)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white">
              <option value="dealScore">Deal score</option>
              <option value="purchasePrice">Purchase price</option>
              <option value="effectiveMonthlyHousingCost">Effective owner cost</option>
              <option value="estimatedCashRequired">Cash required</option>
              <option value="rentToPriceRatio">Rent to price</option>
              <option value="moveOutCashFlow">Move-out cash flow</option>
              <option value="daysOnMarket">Days on market</option>
              <option value="pricePerUnit">Price per unit</option>
            </select>
          </label>
        </div>
      </section>

      {manualEntryOpen && (
        <section className="glass-panel mobile-card-padding rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Manual property entry</h2>
            <button type="button" onClick={() => setManualEntryOpen(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-white/30">Close</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ManualInput placeholder="Address" value={manualForm.address} onChange={(value) => setManualForm((current) => ({ ...current, address: value }))} />
            <ManualInput placeholder="City" value={manualForm.city} onChange={(value) => setManualForm((current) => ({ ...current, city: value }))} />
            <ManualInput placeholder="State" value={manualForm.state} onChange={(value) => setManualForm((current) => ({ ...current, state: value }))} />
            <ManualInput placeholder="ZIP" value={manualForm.zip} onChange={(value) => setManualForm((current) => ({ ...current, zip: value }))} />
            <ManualNumberInput placeholder="Price" value={manualForm.price} onChange={(value) => setManualForm((current) => ({ ...current, price: value }))} />
            <ManualNumberInput placeholder="Units" value={manualForm.units} onChange={(value) => setManualForm((current) => ({ ...current, units: value }))} />
            <ManualNumberInput placeholder="Bedrooms" value={manualForm.bedrooms} onChange={(value) => setManualForm((current) => ({ ...current, bedrooms: value }))} />
            <ManualNumberInput placeholder="Bathrooms" value={manualForm.bathrooms} onChange={(value) => setManualForm((current) => ({ ...current, bathrooms: value }))} />
            <ManualNumberInput placeholder="Sq ft" value={manualForm.squareFeet} onChange={(value) => setManualForm((current) => ({ ...current, squareFeet: value }))} />
            <ManualNumberInput placeholder="Taxes" value={manualForm.propertyTaxes} onChange={(value) => setManualForm((current) => ({ ...current, propertyTaxes: value }))} />
            <ManualNumberInput placeholder="DOM" value={manualForm.daysOnMarket} onChange={(value) => setManualForm((current) => ({ ...current, daysOnMarket: value }))} />
            <ManualNumberInput placeholder="Rent" value={manualForm.estimatedMarketRent} onChange={(value) => setManualForm((current) => ({ ...current, estimatedMarketRent: value }))} />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={handleManualAdd} className="rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 py-2.5 font-semibold text-slate-950 transition hover:scale-[1.01]">Add property</button>
          </div>
        </section>
      )}

      {error ? (
        <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      ) : null}

      <div className={(mobileView === "scanner" || mobileView === "analysis" || mobileView === "map" ? "grid " : "hidden lg:grid ") + "gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] xl:gap-6"}>
        <section className={(mobileView === "scanner" || mobileView === "map" ? "" : "hidden ") + "space-y-4 lg:block"}>
          <div className={(mobileView === "map" ? "" : "hidden ") + "lg:block"}><PropertyMap properties={sortedProperties} selectedProperty={selectedProperty} onSelect={setSelectedId} /></div>

          <div className={(mobileView === "scanner" ? "" : "hidden ") + "space-y-4 lg:block"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Lead queue</p>
              <h2 data-guide="property-leads" className="mt-1 text-xl font-semibold text-white">Ranked opportunities</h2>
            </div>
            <p className="text-sm text-zinc-400">{loading ? "Loading inventory" : `${sortedProperties.length} visible of ${enrichedProperties.length} scanned`} {liveListingsEnabled ? "from live mode" : "from demo preview"}</p>
          </div>

          {loading ? (
            <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">Loading multifamily inventory...</div>
          ) : sortedProperties.length === 0 ? (
            <div className="glass-panel rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-zinc-300">No listings match these filters yet.</div>
          ) : (
            sortedProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                selected={selectedProperty?.id === property.id}
                onAnalyze={() => { setSelectedId(property.id); setMobileView("analysis"); }}
                onStatusChange={handleSaveToggle}
              />
            ))
          )}
          </div>
        </section>

        <aside data-guide="property-analysis" className={(mobileView === "analysis" ? "" : "hidden ") + "space-y-4 lg:block xl:sticky xl:top-6 xl:self-start"}>
          {selectedProperty ? (
            <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/80">Underwrite</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{selectedProperty.address}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{selectedProperty.city}, {selectedProperty.state} {selectedProperty.zip}</p>
                </div>
                <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getRatingClasses(selectedProperty.dealScore)}`}>{getRating(selectedProperty.dealScore)}</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Deal score" value={`${selectedProperty.dealScore}`} detail={selectedProperty.scan.nextAction} />
                <MetricCard label="Cash gap" value={formatSignedMoney(selectedProperty.scan.cashDelta)} detail={selectedProperty.scan.cashDelta >= 0 ? "Covered" : "Needs more cash"} />
                <MetricCard label="Owner cost" value={formatMoney(selectedProperty.analysis.effectiveMonthlyOwnerHousingCost)} detail={formatSignedMoney(selectedProperty.scan.ownerCostDelta)} />
                <MetricCard label="Move-out CF" value={formatMoney(selectedProperty.analysis.laterMoveOutCashFlowMonthly)} detail="Monthly after reserves" />
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Score explanation</p>
                  <ScoreMeter score={selectedProperty.dealScore} />
                </div>
                <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                  {selectedProperty.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-300" />{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Listing intel</p>
                <div className="mt-3 grid gap-2 text-sm text-zinc-300">
                  <DetailRow label="List price" value={formatMoney(selectedProperty.price)} />
                  <DetailRow label="Price / sf" value={formatPricePerSquareFoot(selectedProperty)} />
                  <DetailRow label="Price / unit" value={formatMoney(selectedProperty.analysis.pricePerUnit)} />
                  <DetailRow label="Rent ratio" value={formatPercent(selectedProperty.analysis.rentToPriceRatio)} />
                  <DetailRow label="Break-even" value={formatPercent(selectedProperty.analysis.breakEvenOccupancy)} />
                  <DetailRow label="Property type" value={selectedProperty.propertyType ?? `${selectedProperty.units} unit`} />
                  <DetailRow label="Year / lot" value={`${selectedProperty.yearBuilt ?? "n/a"} / ${selectedProperty.lotSize ? `${formatNumber(selectedProperty.lotSize)} sf` : "n/a"}`} />
                  <DetailRow label="MLS" value={selectedProperty.mlsNumber ? `${selectedProperty.mlsName ?? "MLS"} ${selectedProperty.mlsNumber}` : "n/a"} />
                  <DetailRow label="Last seen" value={formatDateTime(selectedProperty.lastSeenDate ?? selectedProperty.lastUpdated)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedMapUrl ? <a href={selectedMapUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-cyan-300/50 hover:text-cyan-100">Open map</a> : null}
                  {selectedProperty.listingUrl ? <a href={selectedProperty.listingUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-cyan-300/50 hover:text-cyan-100">Open listing</a> : null}
                  <button type="button" onClick={() => handleSaveToggle(selectedProperty.id, selectedProperty.status === "saved" ? "normal" : "saved")} className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100">{selectedProperty.status === "saved" ? "Saved" : "Save"}</button>
                  <button type="button" onClick={() => handleSaveToggle(selectedProperty.id, selectedProperty.status === "rejected" ? "normal" : "rejected")} className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm font-semibold text-rose-100">{selectedProperty.status === "rejected" ? "Rejected" : "Reject"}</button>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Financing assumptions</p>
                  <div className="mt-3 grid gap-3">
                    <NumberField label="Interest rate" value={assumptions.interestRate} onChange={(value) => setAssumptions((current) => ({ ...current, interestRate: value }))} step={0.001} formatter={formatPercent} />
                    <NumberField label="Insurance / year" value={assumptions.annualInsurance} onChange={(value) => setAssumptions((current) => ({ ...current, annualInsurance: value }))} formatter={formatMoney} />
                    <NumberField label="FHA MIP / year" value={assumptions.annualFhaMip} onChange={(value) => setAssumptions((current) => ({ ...current, annualFhaMip: value }))} step={0.0005} formatter={formatPercent} />
                    <NumberField label="Closing cost %" value={assumptions.closingCostPercent} onChange={(value) => setAssumptions((current) => ({ ...current, closingCostPercent: value }))} step={0.005} formatter={formatPercent} />
                    <NumberField label="Repair budget" value={assumptions.repairBudget} onChange={(value) => setAssumptions((current) => ({ ...current, repairBudget: value }))} formatter={formatMoney} />
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Readiness panel</p>
                  <div className="mt-3 grid gap-3">
                    <NumberField label="Cash available" value={assumptions.cashAvailable} onChange={(value) => setAssumptions((current) => ({ ...current, cashAvailable: value }))} formatter={formatMoney} />
                    <NumberField label="Emergency reserve" value={assumptions.emergencyReserve} onChange={(value) => setAssumptions((current) => ({ ...current, emergencyReserve: value }))} formatter={formatMoney} />
                    <NumberField label="Maximum effective monthly housing cost" value={assumptions.maxEffectiveMonthlyHousingCost} onChange={(value) => setAssumptions((current) => ({ ...current, maxEffectiveMonthlyHousingCost: value }))} formatter={formatMoney} />
                    <NumberField label="Expected bonus" value={assumptions.expectedBonus} onChange={(value) => setAssumptions((current) => ({ ...current, expectedBonus: value }))} formatter={formatMoney} />
                    <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-300">
                      <span>Use projected bonus</span>
                      <input type="checkbox" checked={assumptions.useProjectedBonus} onChange={(event) => setAssumptions((current) => ({ ...current, useProjectedBonus: event.target.checked }))} />
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Results</p>
                  <div className="mt-3 space-y-2 text-sm text-zinc-300">
                    <DetailRow label="Base loan" value={formatMoney(selectedProperty.analysis.baseLoanAmount)} />
                    <DetailRow label="Cash required" value={formatMoney(selectedProperty.analysis.totalEstimatedCashRequired)} />
                    <DetailRow label="Monthly owner cost" value={formatMoney(selectedProperty.analysis.effectiveMonthlyOwnerHousingCost)} />
                    <DetailRow label="Gross rent" value={formatMoney(selectedProperty.analysis.grossMonthlyRent)} />
                    <DetailRow label="Later move-out cash flow" value={formatMoney(selectedProperty.analysis.laterMoveOutCashFlowMonthly)} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-zinc-300">Select a listing to analyze the deal.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PropertyMap({
  properties,
  selectedProperty,
  onSelect,
}: {
  properties: EnrichedProperty[];
  selectedProperty: EnrichedProperty | null;
  onSelect: (propertyId: string) => void;
}) {
  const mappedProperties = properties.filter((property) => hasCoordinates(property));
  const bounds = buildMapBounds(mappedProperties);

  return (
    <section className="glass-panel overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Market map</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Geographic scan</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-emerald-100">Strong</span>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-amber-100">Watch</span>
          <span className="rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-rose-100">Pass</span>
        </div>
      </div>
      <div className="relative h-[360px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(45,212,191,0.25),transparent_24%),radial-gradient(circle_at_80%_70%,rgba(251,191,36,0.14),transparent_25%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.96))]" />
        <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(148,163,184,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.11)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="absolute left-[6%] top-[22%] h-px w-[86%] rotate-[-8deg] bg-cyan-100/15" />
        <div className="absolute left-[14%] top-[62%] h-px w-[76%] rotate-[5deg] bg-emerald-100/15" />
        <div className="absolute left-[48%] top-[8%] h-[88%] w-px rotate-[12deg] bg-white/10" />
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/5" />

        {mappedProperties.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-zinc-400">Latitude and longitude from live or demo listings will render here.</div>
        ) : (
          mappedProperties.map((property) => {
            const position = getMapPosition(property, bounds);
            const style = getScoreStyle(property.dealScore);
            const selected = selectedProperty?.id === property.id;
            return (
              <button
                key={property.id}
                type="button"
                onClick={() => onSelect(property.id)}
                style={{ left: position.left, top: position.top }}
                title={`${property.address} - ${formatMoney(property.price)} - score ${property.dealScore}`}
                className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-lg transition hover:z-20 hover:scale-110 ${style.pin} ${selected ? "ring-4 ring-cyan-200/40" : ""}`}
              >
                {formatShortMoney(property.price)}
              </button>
            );
          })
        )}

        {selectedProperty ? (
          <div className="absolute bottom-4 left-4 right-4 z-30 rounded-2xl border border-white/10 bg-black/70 p-3 backdrop-blur md:right-auto md:w-[360px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{selectedProperty.address}</p>
                <p className="text-xs text-zinc-400">{selectedProperty.city}, {selectedProperty.state} - {formatMoney(selectedProperty.analysis.effectiveMonthlyOwnerHousingCost)} owner cost</p>
              </div>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-100">{selectedProperty.dealScore}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PropertyCard({
  property,
  selected,
  onAnalyze,
  onStatusChange,
}: {
  property: EnrichedProperty;
  selected: boolean;
  onAnalyze: () => void;
  onStatusChange: (propertyId: string, status: PropertyStatus) => void;
}) {
  const scoreStyle = getScoreStyle(property.dealScore);

  return (
    <article className={`glass-panel rounded-3xl border p-4 transition-all ${selected ? "border-cyan-400/60 bg-cyan-500/5 shadow-[0_0_35px_rgba(34,211,238,0.15)]" : "border-white/10 bg-white/5"}`}>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div
          className="h-40 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900 bg-cover bg-center lg:w-52"
          style={property.imageUrl ? { backgroundImage: `url(${property.imageUrl})` } : undefined}
          aria-label={property.address}
        >
          {!property.imageUrl && (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#164e63,#111827)] text-sm uppercase tracking-[0.4em] text-zinc-400">Lead</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-white">{property.address}</p>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${scoreStyle.badge}`}>{property.scan.nextAction}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">{property.city}, {property.state} {property.zip} - {property.propertyType ?? `${property.units} unit`}</p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Deal score</p>
              <p className="text-3xl font-semibold text-white">{property.dealScore}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{property.units} unit</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{property.bedrooms} bd / {property.bathrooms} ba</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{formatNumber(property.squareFeet)} sf</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{formatDays(property.daysOnMarket)}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{getSourceLabel(property.source)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <InfoBadge label="List" value={formatMoney(property.price)} />
            <InfoBadge label="Owner cost" value={formatMoney(property.analysis.effectiveMonthlyOwnerHousingCost)} tone={property.scan.ownerCostDelta >= 0 ? "good" : "bad"} />
            <InfoBadge label="Cash" value={formatMoney(property.analysis.totalEstimatedCashRequired)} tone={property.scan.cashDelta >= 0 ? "good" : "bad"} />
            <InfoBadge label="Rent" value={formatMoney(property.estimatedMarketRent)} />
            <InfoBadge label="RTP" value={formatPercent(property.analysis.rentToPriceRatio)} />
            <InfoBadge label="Move-out" value={formatMoney(property.analysis.laterMoveOutCashFlowMonthly)} tone={property.analysis.laterMoveOutCashFlowMonthly >= 0 ? "good" : "bad"} />
          </div>

          <div className="flex flex-wrap gap-2">
            {property.scan.flags.map((flag) => (
              <span key={flag} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-zinc-300">{flag}</span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onAnalyze} className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20">Analyze</button>
            <button type="button" onClick={() => onStatusChange(property.id, property.status === "saved" ? "normal" : "saved")} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-emerald-300/40 hover:text-emerald-100">{property.status === "saved" ? "Saved" : "Save"}</button>
            <button type="button" onClick={() => onStatusChange(property.id, property.status === "rejected" ? "normal" : "rejected")} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-rose-300/40 hover:text-rose-100">{property.status === "rejected" ? "Rejected" : "Reject"}</button>
            <button type="button" onClick={() => onStatusChange(property.id, property.status === "compare" ? "normal" : "compare")} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-amber-300/40 hover:text-amber-100">{property.status === "compare" ? "Compared" : "Compare"}</button>
            {property.listingUrl ? <a href={property.listingUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 transition hover:border-cyan-300/40 hover:text-cyan-100">Listing</a> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  const classes =
    tone === "good"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-white/10 bg-white/5 text-white/80";
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.25em] ${classes}`}>{label}</span>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3.5">
      <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function InfoBadge({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const toneClasses = tone === "good" ? "text-emerald-100" : tone === "bad" ? "text-rose-100" : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p className={`mt-1 text-sm font-medium ${toneClasses}`}>{value}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  formatter,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  formatter: (value: number) => string;
  step?: number;
}) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-300">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-zinc-500">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full bg-transparent text-base font-medium text-white outline-none"
      />
      <span className="mt-1 block text-xs text-zinc-400">{formatter(value)}</span>
    </label>
  );
}

function NumberFilter({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <label className="text-xs text-zinc-400">
      <span className="mb-2 block uppercase tracking-[0.25em]">{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white" />
    </label>
  );
}

function ToggleFilter({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-300">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-cyan-300/40 hover:text-cyan-100">{label}</button>;
}

function ManualInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (value: string) => void }) {
  return <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white" />;
}

function ManualNumberInput({ placeholder, value, onChange }: { placeholder: string; value: number; onChange: (value: number) => void }) {
  return <input type="number" placeholder={placeholder} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white" />;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const style = getScoreStyle(score);
  return (
    <div className="flex w-28 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${clamp(score, 0, 100)}%` }} />
      </div>
      <span className="text-sm font-semibold text-white">{score}</span>
    </div>
  );
}

function hasSearchFilterChanges(left: ListingSearchFilters, right: ListingSearchFilters) {
  return (
    left.zipOrCity !== right.zipOrCity ||
    left.radiusMiles !== right.radiusMiles ||
    left.minPrice !== right.minPrice ||
    left.maxPrice !== right.maxPrice ||
    left.unitsMode !== right.unitsMode ||
    left.minBedrooms !== right.minBedrooms ||
    left.maxDaysOnMarket !== right.maxDaysOnMarket
  );
}

function buildSummary(properties: EnrichedProperty[], buyingPower: number) {
  const scores = properties.map((property) => property.dealScore);
  const cashRequired = properties.map((property) => property.analysis.totalEstimatedCashRequired);
  const prices = properties.map((property) => property.price);
  const totalDom = properties.reduce((total, property) => total + property.daysOnMarket, 0);

  return {
    propertiesCount: properties.length,
    hotLeadCount: properties.filter((property) => property.dealScore >= 75).length,
    watchLeadCount: properties.filter((property) => property.dealScore >= 60 && property.dealScore < 75).length,
    underCashCount: properties.filter((property) => property.analysis.totalEstimatedCashRequired <= buyingPower).length,
    positiveCashFlowCount: properties.filter((property) => property.analysis.laterMoveOutCashFlowMonthly >= 0).length,
    averageCashRequired: average(cashRequired),
    medianPrice: median(prices),
    averageScore: average(scores),
    averageDaysOnMarket: properties.length ? Math.round(totalDom / properties.length) : 0,
    bestMoveOutCashFlow: properties.reduce((best, property) => Math.max(best, property.analysis.laterMoveOutCashFlowMonthly), 0),
  };
}

function buildScanProfile({
  property,
  analysis,
  dealScore,
  buyingPower,
  assumptions,
}: {
  property: PropertyListing;
  analysis: ReturnType<typeof calculateFhaAnalysis>;
  dealScore: number;
  buyingPower: number;
  assumptions: PropertyAssumptions;
}): ScanProfile {
  const cashDelta = buyingPower - analysis.totalEstimatedCashRequired;
  const ownerCostDelta = assumptions.maxEffectiveMonthlyHousingCost - analysis.effectiveMonthlyOwnerHousingCost;
  const flags: string[] = [];

  if (cashDelta >= 0) flags.push("Cash-fit");
  else flags.push(`${formatMoney(Math.abs(cashDelta))} gap`);

  if (ownerCostDelta >= 0) flags.push("Monthly-fit");
  else flags.push(`${formatMoney(Math.abs(ownerCostDelta))} over cap`);

  if (analysis.rentToPriceRatio >= 0.008) flags.push("Rent strong");
  if (analysis.laterMoveOutCashFlowMonthly >= 0) flags.push("Exit positive");
  if (property.daysOnMarket <= 21) flags.push("Fresh");
  if (property.units >= 3) flags.push("Ops heavier");

  const tone = dealScore >= 75 ? "good" : dealScore >= 60 ? "watch" : dealScore < 45 ? "bad" : "neutral";
  const nextAction = dealScore >= 80
    ? "Tour now"
    : dealScore >= 65
      ? "Underwrite"
      : dealScore >= 45
        ? "Watch"
        : "Pass";

  return { cashDelta, ownerCostDelta, tone, nextAction, flags: flags.slice(0, 5) };
}

function buildDealReasons({
  property,
  analysis,
  dealScore,
  assumptions,
  buyingPower,
}: {
  property: PropertyListing;
  analysis: ReturnType<typeof calculateFhaAnalysis>;
  dealScore: number;
  assumptions: PropertyAssumptions;
  buyingPower: number;
}) {
  const reasons: string[] = [];

  if (dealScore >= 80) reasons.push("Strong affordability profile for current buying power.");
  if (analysis.totalEstimatedCashRequired <= buyingPower) reasons.push("Estimated cash requirement fits the active buying-power scenario.");
  else reasons.push(`${formatMoney(analysis.totalEstimatedCashRequired - buyingPower)} cash gap before this is ready.`);

  if (analysis.effectiveMonthlyOwnerHousingCost <= assumptions.maxEffectiveMonthlyHousingCost) {
    reasons.push("Effective owner housing cost fits the target monthly cap.");
  } else {
    reasons.push("Monthly carrying cost is above the preferred threshold.");
  }

  if (analysis.rentToPriceRatio > 0.008) reasons.push("Rent-to-price ratio supports the multifamily thesis.");
  if (analysis.breakEvenOccupancy <= 0.9) reasons.push("Break-even occupancy leaves room for normal vacancy.");
  if (analysis.laterMoveOutCashFlowMonthly >= 0) reasons.push("Projected move-out scenario stays cash-flow positive after reserves.");
  if (property.daysOnMarket <= 30) reasons.push("Days on market suggests this lead needs fast underwriting.");
  if (property.source === "rentcast") reasons.push("Live listing feed; verify rent comps and tax history before outreach.");

  if (reasons.length === 0) reasons.push("The property is marginal against the current assumptions.");
  return reasons.slice(0, 5);
}

function getRating(score: number) {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Worth it";
  if (score >= 45) return "Marginal";
  return "Pass";
}

function getRatingClasses(score: number) {
  if (score >= 80) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (score >= 65) return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  if (score >= 45) return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  return "border-rose-400/30 bg-rose-400/10 text-rose-100";
}

function getScoreStyle(score: number) {
  if (score >= 75) {
    return {
      pin: "border-emerald-100 bg-emerald-300 text-slate-950 shadow-emerald-950/40",
      badge: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
      bar: "bg-emerald-300",
    };
  }
  if (score >= 60) {
    return {
      pin: "border-cyan-100 bg-cyan-300 text-slate-950 shadow-cyan-950/40",
      badge: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
      bar: "bg-cyan-300",
    };
  }
  if (score >= 45) {
    return {
      pin: "border-amber-100 bg-amber-300 text-slate-950 shadow-amber-950/40",
      badge: "border-amber-300/30 bg-amber-300/10 text-amber-100",
      bar: "bg-amber-300",
    };
  }
  return {
    pin: "border-rose-100 bg-rose-300 text-slate-950 shadow-rose-950/40",
    badge: "border-rose-300/30 bg-rose-300/10 text-rose-100",
    bar: "bg-rose-300",
  };
}

function hasCoordinates(property: PropertyListing): property is PropertyListing & { latitude: number; longitude: number } {
  return typeof property.latitude === "number" && typeof property.longitude === "number" && Number.isFinite(property.latitude) && Number.isFinite(property.longitude);
}

function buildMapBounds(properties: Array<PropertyListing & { latitude: number; longitude: number }>) {
  const latitudes = properties.map((property) => property.latitude);
  const longitudes = properties.map((property) => property.longitude);
  const minLat = Math.min(...latitudes, 41.35);
  const maxLat = Math.max(...latitudes, 41.5);
  const minLng = Math.min(...longitudes, -81.95);
  const maxLng = Math.max(...longitudes, -81.65);
  const latPad = Math.max((maxLat - minLat) * 0.18, 0.015);
  const lngPad = Math.max((maxLng - minLng) * 0.18, 0.015);

  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function getMapPosition(property: PropertyListing & { latitude: number; longitude: number }, bounds: ReturnType<typeof buildMapBounds>) {
  const x = (property.longitude - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 0.001);
  const y = 1 - (property.latitude - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.001);
  return {
    left: `${clamp(8 + x * 84, 8, 92)}%`,
    top: `${clamp(10 + y * 80, 10, 90)}%`,
  };
}

function buildMapUrl(property: PropertyListing) {
  if (hasCoordinates(property)) {
    return `https://www.openstreetmap.org/?mlat=${property.latitude}&mlon=${property.longitude}#map=15/${property.latitude}/${property.longitude}`;
  }
  const query = encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`);
  return `https://www.openstreetmap.org/search?query=${query}`;
}

function formatSignedMoney(value: number) {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
}

function formatShortMoney(value: number) {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${Math.round(value / 1000)}k`;
  return formatMoney(value);
}

function formatDateTime(value: string | undefined | null) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatPricePerSquareFoot(property: PropertyListing) {
  if (!property.squareFeet) return "n/a";
  return `${formatMoney(property.price / property.squareFeet)}/sf`;
}

function getSourceLabel(source: PropertyListing["source"]) {
  if (source === "rentcast") return "RentCast";
  if (source === "manual") return "Manual";
  return "Demo";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
