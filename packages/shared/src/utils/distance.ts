/**
 * Distances, as somebody would say them.
 *
 * ONE formatter for the phone, the web and every server sentence. It exists
 * because each surface used to build its own — `${away}m`, `(m / 1000).toFixed(1)
 * + 'km'`, a `km()` that returned a bare number — and a member standing in
 * another country was told "You are 9630871m from the job site". Seven digits
 * of metres is a number nobody can read; "9,631 km" is one anybody can.
 *
 * The rules (after rounding, so a value never lands on the wrong side of a
 * threshold — 995 m is "1 km", never "1,000 m"):
 *
 *   below 100 m        whole metres            "85 m"
 *   100 m – 1 km       nearest 10 m            "850 m"
 *   1 – 10 km          one decimal, ".0" gone  "1.2 km", "3 km"
 *   10 – 100 km        whole km                "12 km"
 *   100 km and more    whole km, grouped       "9,631 km" (en), "9.631 km" (de)
 *
 * The decimal separator and the grouping come from `Intl.NumberFormat` in the
 * reader's language; the number and the unit are joined by a NO-BREAK SPACE so
 * "9,631" and "km" are never split across two lines.
 *
 * Display only. A radius an administrator TYPES stays a number of metres; this
 * is for reading a distance back.
 */

import { DEFAULT_LOCALE, normalizeLocale, type SupportedLocale } from '../notifications/locale';

export type DistanceUnit = 'm' | 'km';

export interface DistanceFormatOptions {
  /** The reader's language — 'de', 'de-AT', 'fr_CH' … An unknown one reads English. */
  locale?: string | null;
  /** An estimate (a straight line, a guessed road distance): prefixed with "~". */
  approx?: boolean;
  /** Force the unit instead of choosing it from the size. */
  unit?: DistanceUnit;
}

export interface DistanceParts {
  /** The rounded figure in `unit` — 850, 1.2, 9631. */
  value: number;
  unit: DistanceUnit;
  /** `value` written in the reader's language, with "~" when approximate: "~1,2". */
  text: string;
}

/** What a distance that cannot be read is shown as. */
export const DISTANCE_UNKNOWN = '—';

/** Between the number and its unit, so the two never wrap apart. */
export const DISTANCE_UNIT_SPACE = ' ';

const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: SupportedLocale, fractionDigits: number): Intl.NumberFormat {
  const key = `${locale}:${fractionDigits}`;
  let f = formats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: fractionDigits, minimumFractionDigits: 0 });
    formats.set(key, f);
  }
  return f;
}

function isReadable(metres: unknown): metres is number {
  return typeof metres === 'number' && Number.isFinite(metres) && metres >= 0;
}

/** Metres below 1 km: whole below 100, to the nearest 10 from there. */
function roundMetres(metres: number): number {
  return metres < 99.5 ? Math.round(metres) : Math.round(metres / 10) * 10;
}

/** Kilometres: one decimal below 10, whole from there. */
function roundKm(km: number): { value: number; digits: number } {
  const tenth = Math.round(km * 10) / 10;
  if (tenth < 10) return { value: tenth, digits: 1 };
  return { value: Math.round(km), digits: 0 };
}

/**
 * The rounded figure and its unit — for a screen that draws a big number and a
 * small "km" beside it. Same rules as `formatDistance`, so the two cannot
 * disagree. `null` for a distance that cannot be read.
 */
export function distanceParts(metres: number | null | undefined, options: DistanceFormatOptions = {}): DistanceParts | null {
  if (!isReadable(metres)) return null;
  const locale = normalizeLocale(options.locale) ?? DEFAULT_LOCALE;
  const prefix = options.approx ? '~' : '';

  const asMetres = roundMetres(metres);
  const useMetres = options.unit ? options.unit === 'm' : asMetres < 1000;
  if (useMetres) {
    return { value: asMetres, unit: 'm', text: prefix + numberFormat(locale, 0).format(asMetres) };
  }
  const { value, digits } = roundKm(metres / 1000);
  return { value, unit: 'km', text: prefix + numberFormat(locale, digits).format(value) };
}

/**
 * A distance in metres as a reader would say it: "85 m", "850 m", "1.2 km",
 * "9,631 km". `—` for null, NaN, infinite or negative input.
 */
export function formatDistance(metres: number | null | undefined, options: DistanceFormatOptions = {}): string {
  const parts = distanceParts(metres, options);
  return parts ? `${parts.text}${DISTANCE_UNIT_SPACE}${parts.unit}` : DISTANCE_UNKNOWN;
}

/**
 * The two figures a distance refusal carries (`distanceMetres`, `radiusMetres`
 * in the error's `params`), written for the reader's sentence as `distance` and
 * `radius`. One place, so the phone and the web translate "You are {{distance}}
 * from the job site" with the same words.
 */
export function distanceRefusalParams(
  params: { distanceMetres?: unknown; radiusMetres?: unknown } | null | undefined,
  locale?: string | null,
): { distance: string; radius: string } {
  const read = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : null);
  return {
    distance: formatDistance(read(params?.distanceMetres), { locale }),
    radius: formatDistance(read(params?.radiusMetres), { locale }),
  };
}
