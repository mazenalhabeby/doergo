// CRM formatting helpers — money is stored/served as integer minor units (cents).

export function formatMoney(cents: number | null | undefined, currency = "EUR"): string {
  const value = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatMoneyPrecise(cents: number | null | undefined, currency = "EUR"): string {
  const value = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

/** Parse a user-typed amount (e.g. "1.250,50" or "1250.5") into integer cents. */
export function toCents(input: string | number | null | undefined): number {
  if (input == null || input === "") return 0;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.-]/g, ""));
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
