import {
  assessFix,
  isAtSite,
  noShiftAllowanceNow,
  tagShiftAt,
  parseGeofencePolygon,
  siteEnforcesZone,
  type CompanyLocation,
  type OccurrenceFix,
} from '@hbcfield/shared/client';

type LocalClockInVerdict =
  | { ok: true; away: boolean; distanceM: number | null }
  | {
      ok: false;
      code: 'ALREADY_CLOCKED_IN' | 'FIX_MISSING' | 'FIX_INACCURATE' | 'FIX_NOT_AT_TAP' | 'OUTSIDE_SITE' | 'NO_SHIFT_TODAY';
      distanceM?: number | null;
      radiusM?: number;
    };

/**
 * Would the server accept this clock-in? Asked on the phone, from what it has
 * kept, so a member with no signal gets the same yes or no on the spot.
 *
 * The same shared rules as the server: `assessFix` for "is this position
 * evidence of the tap", `isAtSite` for "is it at the site". Whether being away
 * is allowed is the server's own answer (`awayAllowed`), saved with the list.
 *
 * ⚠️ The first gate, never the judge. The server repeats every check when the
 * clock-in arrives — it alone knows what the office changed meanwhile.
 */
export function checkClockInLocally(input: {
  /** null = the Remote bucket. */
  location: CompanyLocation | null;
  fix: OccurrenceFix | null;
  alreadyClockedIn: boolean;
  now?: Date;
  /**
   * When the fix is judged as evidence, if not `now`. The automatic clock asks
   * about a clock-in dated when the member walked in (`now`), with the fix the
   * phone took at that crossing — whose own age is measured against the
   * crossing, not against the moment the window opened.
   */
  fixCheckedAt?: Date;
}): LocalClockInVerdict {
  if (input.alreadyClockedIn) return { ok: false, code: 'ALREADY_CLOCKED_IN' };

  /*
    Clocking in with no shift, from the allowance the server tagged this workspace with.
    ⚠️ Only a workspace that NEEDS a shift refuses. Today's hours used up is KEPT and flagged for the
    leader on the server (docs/plans/time-counting-model.md) — refusing it here stopped the person at
    the door with every hour they then worked lost.
  */
  /*
    ⚠️ "Is there a shift" is judged at the TAP from the planned windows on the tag (`tagShiftAt`), never from
    `hasShiftNow` — that was true when the list was read, perhaps yesterday. When the tag cannot say (an older
    server, a list older than its windows) the phone does not refuse: the server keeps an offline clock-in with
    no shift and flags it for the leader, so a refusal here would only lose hours worked.
  */
  const now = input.now ?? new Date();
  const tag = input.location?.noShift;
  const allowance = noShiftAllowanceNow(tag, now);
  const knownNoShift = !!tag && tagShiftAt(tag, now) === false;
  if (allowance.kind === 'refused' && allowance.reason === 'SHIFT_ONLY' && knownNoShift) {
    return { ok: false, code: 'NO_SHIFT_TODAY' };
  }

  const checked = assessFix(input.fix, input.fixCheckedAt ?? input.now ?? new Date());
  // A mock location is flagged by the server, not refused — mirror that.
  // `'code' in`, not `.ok`: the test compiler runs non-strict and does not narrow on a boolean.
  if ('code' in checked && checked.code !== 'FIX_MOCKED') return { ok: false, code: checked.code };
  const fix = input.fix!;

  if (!input.location) return { ok: true, away: true, distanceM: null };

  const zone = {
    lat: input.location.lat,
    lng: input.location.lng,
    geofenceRadius: input.location.geofenceRadius,
    geofencePolygon: parseGeofencePolygon(input.location.geofencePolygon),
  };
  // A space with no coordinates is geofence-exempt and clocks in fine.
  if (!siteEnforcesZone(zone)) return { ok: true, away: false, distanceM: null };

  const at = isAtSite({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }, zone);
  const distanceM = at.distanceToCentre == null ? null : Math.round(at.distanceToCentre);
  if (at.inside) return { ok: true, away: false, distanceM };
  if (input.location.awayAllowed) return { ok: true, away: true, distanceM };
  return { ok: false, code: 'OUTSIDE_SITE', distanceM, radiusM: input.location.geofenceRadius };
}
