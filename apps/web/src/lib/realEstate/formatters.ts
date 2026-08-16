export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 10000 ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (abs >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return formatMoney(value);
}

export function formatPercent(value: number): string {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDays(value: number): string {
  return `${formatNumber(value)} days`;
}
