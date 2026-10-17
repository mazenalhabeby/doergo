/**
 * The Time tab's rules — pure, so each is a test and none is a guess in JSX.
 */
import { haversineDistance, isAtSite, localDateKey, noShiftAllowanceNow, type NoShiftAllowance } from '@hbcfield/shared/client';
import type { CompanyLocation } from '@hbcfield/shared/client';
import { type PlaceRelation, type PlaceTile } from './place-relation';
export {
  type PlaceRelation,
  type PlaceTile,
  noShiftOf,
  type NoShiftNote,
  noShiftHere,
  dayKey,
  dayOf,
  addDays,
  workWeekdays,
  daysOff,
  leaveDays,
  overlapIn,
  usedThisYear,
  upcomingLeave,
  monthGrid,
  statusOf,
  minutesPastEnd,
  EXTRA_MAX,
  suggestedExtra,
  stepExtra,
  FOREGROUND_HEARTBEAT_MS,
  heartbeatDue,
  graceCountdown,
  waitingText,
  type OvertimePlaceLine,
  overtimePlaceLine,
} from './place-relation';

/* ------------------------------------------------------------------ */
/* Where you work                                                      */
/* ------------------------------------------------------------------ */
/**
 * The workspaces a member is assigned to, in the order they matter NOW: the
 * one they are clocked in at, then the one they are standing in, then the rest
 * by distance, then the ones with no site at all.
 *
 * ⚠️ "HERE" IS THE SERVER'S RULE, `isAtSite` — the drawn outline when there is
 * one, the radius otherwise. A tile that said "here" by a plain radius would
 * contradict the clock-in that refuses the same position a second later.
 *
 * ⚠️ THE REMOTE BUCKET IS NOT A PLACE. It is how "away from a site" is filed,
 * and listing it would show a workspace that has no address as if it had one.
 */
export function placesView(
  locations: readonly CompanyLocation[],
  fix: { lat: number; lng: number; accuracy?: number | null } | null,
  clockedInId: string | null,
): PlaceTile[] {
  const tiles = locations
    .filter((l) => !l.isRemote)
    .map((location): PlaceTile => {
      const hasSite = location.lat != null && location.lng != null;
      const metres = hasSite && fix ? Math.round(haversineDistance(fix.lat, fix.lng, location.lat, location.lng)) : null;
      if (location.id === clockedInId) return { location, relation: 'clockedIn', metres };
      if (!hasSite) return { location, relation: 'anywhere', metres: null };
      if (!fix) return { location, relation: 'unknown', metres: null };
      const at = isAtSite(fix, location);
      return { location, relation: at.inside ? 'here' : 'away', metres };
    });
  const rank: Record<PlaceRelation, number> = { clockedIn: 0, here: 1, away: 2, unknown: 3, anywhere: 4 };
  return tiles.sort((a, b) =>
    rank[a.relation] - rank[b.relation]
    || (a.metres ?? Infinity) - (b.metres ?? Infinity)
    || a.location.name.localeCompare(b.location.name),
  );
}
