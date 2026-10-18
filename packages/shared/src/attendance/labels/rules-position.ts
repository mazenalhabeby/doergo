/**
 * Where a clock-in or clock-out was made, judged for the label rules — with the
 * SAME accuracy limit at both ends of the shift.
 *
 * ⚠️ The old clock-out had no limit: a 2 km fix added 2 km to the site and
 * counted as on site. A fix too coarse to judge is now said to be not judged,
 * never assumed on site.
 */
import { isAtSite, type SiteZone } from '../../utils/geofence/site';
import { OCCURRENCE_RULES } from '../../sync/occurrence';
import type { PositionFact } from './contract';

export interface FixForLabels {
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
}

/** Judge one fix against a site. `outside` is only true when a judged fix lies outside. */
export function judgePosition(
  fix: FixForLabels | null | undefined,
  site: SiteZone,
  skip?: PositionFact['notJudgedBecause'],
): { fact: PositionFact; outside: boolean } {
  if (skip) return { fact: { judged: false, notJudgedBecause: skip }, outside: false };
  if (site.lat == null || site.lng == null)
    return { fact: { judged: false, notJudgedBecause: 'NO_SITE' }, outside: false };
  if (fix?.lat == null || fix?.lng == null)
    return { fact: { judged: false, notJudgedBecause: 'NO_FIX' }, outside: false };
  const accuracy = fix.accuracy ?? null;
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy > OCCURRENCE_RULES.FIX_MAX_ACCURACY_M)) {
    return { fact: { judged: false, notJudgedBecause: 'TOO_COARSE', accuracyM: accuracy }, outside: false };
  }
  const at = isAtSite({ lat: fix.lat, lng: fix.lng, accuracy }, site);
  return {
    fact: { judged: true, metresOutside: Math.round(at.metresOutside), accuracyM: accuracy },
    outside: !at.inside,
  };
}
