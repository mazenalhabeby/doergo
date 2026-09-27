import i18next from 'i18next';
import {
  formatDistance as formatDistanceIn,
  distanceParts as distancePartsIn,
  distanceRefusalParams,
  type DistanceFormatOptions,
  type DistanceParts,
} from '@hbcfield/shared/client';

/**
 * The shared distance formatter, in the member's language.
 *
 * ⚠️ NOT a copy — the rules ("850 m", "1.2 km", "9,631 km") live once in
 * `packages/shared/src/utils/distance.ts`. This only supplies the locale the
 * phone is showing, so a screen never has to thread it through by hand, and a
 * German member reads "1,2 km" where an English one reads "1.2 km".
 * `distance-display-guard.spec.ts` fails if a screen builds "km" itself again.
 */
export function readerLocale(): string {
  return i18next.language || 'en';
}

export function formatDistance(metres: number | null | undefined, options: DistanceFormatOptions = {}): string {
  return formatDistanceIn(metres, { locale: readerLocale(), ...options });
}

export function distanceParts(metres: number | null | undefined, options: DistanceFormatOptions = {}): DistanceParts | null {
  return distancePartsIn(metres, { locale: readerLocale(), ...options });
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * A refusal the server (or the outbox) sent, in the member's language.
 *
 * The code picks the sentence (`offline.errors.<CODE>`); its `params` fill it —
 * a distance refusal carries `distanceMetres` / `radiusMetres`, written here as
 * "9,631 km" / "100 m". A code the app does not know falls back to the server's
 * own English text, then to `fallback`.
 */
export function refusalText(
  t: Translate,
  o: { code?: string; message?: string; params?: Record<string, unknown> },
  fallback: string,
): string {
  if (o.code) {
    const known = t(`offline.errors.${o.code}`, { defaultValue: '', ...refusalInterpolation(o.params) });
    if (known) return known;
  }
  return o.message || fallback;
}

/** The values a coded sentence is written with — plain values as they are, distances formatted. */
export function refusalInterpolation(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params) return {};
  const plain: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' || typeof v === 'number') plain[k] = v;
  }
  if ('distanceMetres' in params || 'radiusMetres' in params) {
    Object.assign(plain, distanceRefusalParams(params, readerLocale()));
  }
  return plain;
}
