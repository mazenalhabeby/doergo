/**
 * The country holiday lists, from the offline `date-holidays` library.
 *
 * No network, no per-request cost. Computing a year for a country takes a few milliseconds, and the
 * same handful of (country, region, year, language) combinations are asked over and over, so the
 * results are kept in a small bounded cache. Only PUBLIC holidays are taken — bank, school and
 * observance days are not days off.
 *
 * Data licence: CC BY 3.0 (date-holidays) — credited on the settings screen.
 */
import Holidays from 'date-holidays';
import { isEstimatedRule, libraryHolidayKey, ruleDurationDays, type LibraryHoliday } from '@hbcfield/shared';

const CACHE_MAX = 300;
const cache = new Map<string, LibraryHoliday[]>();

function remember(key: string, value: LibraryHoliday[]) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}

/** Country codes are two letters, regions short alphanumerics — anything else is refused before the library sees it. */
export function validCountry(c: unknown): c is string {
  return typeof c === 'string' && /^[A-Z]{2}$/.test(c);
}
export function validRegion(r: unknown): r is string {
  return typeof r === 'string' && /^[A-Za-z0-9-]{1,10}$/.test(r);
}

const LANGS = new Set(['en', 'de', 'es', 'fr', 'it']);

export function libraryHolidays(country: string | null, region: string | null, year: number, lang = 'en'): LibraryHoliday[] {
  if (!validCountry(country) || year < 1970 || year > 2200) return [];
  const l = LANGS.has(lang) ? lang : 'en';
  const reg = region && validRegion(region) ? region : null;
  const key = `${country}|${reg ?? ''}|${year}|${l}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let out: LibraryHoliday[] = [];
  try {
    const hd = reg ? new Holidays(country, reg, { languages: [l] }) : new Holidays(country, { languages: [l] });
    out = (hd.getHolidays(year) || [])
      .filter((h: any) => h.type === 'public')
      .map((h: any) => ({
        key: libraryHolidayKey(year, String(h.rule ?? h.name)),
        date: String(h.date).slice(0, 10),
        days: ruleDurationDays(h.rule),
        name: String(h.name),
        estimated: isEstimatedRule(h.rule),
      }));
    // The library lists a holiday once per rule; two rules can land on one day (Easter Sunday + a saint).
    const seen = new Set<string>();
    out = out.filter((h) => (seen.has(h.key) ? false : (seen.add(h.key), true)));
  } catch {
    out = [];
  }
  remember(key, out);
  return out;
}

/** Holidays overlapping [fromYear … toYear]. A range never spans more than two years. */
export function libraryHolidaysForYears(country: string | null, region: string | null, years: number[], lang?: string): LibraryHoliday[] {
  return years.flatMap((y) => libraryHolidays(country, region, y, lang));
}

let countriesCache: Record<string, Record<string, string>> = {};
export function countryList(lang = 'en'): { code: string; name: string }[] {
  const l = LANGS.has(lang) ? lang : 'en';
  if (!countriesCache[l]) countriesCache[l] = new Holidays().getCountries(l) || {};
  return Object.entries(countriesCache[l]!).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function regionList(country: string, lang = 'en'): { code: string; name: string }[] {
  if (!validCountry(country)) return [];
  const l = LANGS.has(lang) ? lang : 'en';
  const states = new Holidays().getStates(country, l) || {};
  return Object.entries(states).map(([code, name]) => ({ code, name: String(name) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** For tests. */
export function clearHolidayCache() {
  cache.clear();
  countriesCache = {};
}
