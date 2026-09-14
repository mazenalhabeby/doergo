/**
 * Which workspace a one-button clock-in is for.
 *
 * The member taps Clock in. When the answer is obvious nobody is asked — they
 * have one workspace, or they are standing inside exactly the one area of
 * several — and when it is not, they get a short list, best first, with the top
 * one already chosen.
 *
 * ⚠️ NO "REMOTE" OR "FIELD" CHOICE. Whether they may clock in away from a site
 * is the server's (ceiling × grant); where they are working is decided from
 * evidence afterwards (presence.ts). A member who has workspaces picks one of
 * them, full stop. The Remote bucket remains only for somebody who has none.
 *
 * Pure and shared: the phone (online and offline) and the web both order and
 * pick through this, so the list a member sees is the same on either.
 */
import { isAtSite, parseGeofencePolygon, siteEnforcesZone } from '../utils/geofence';

export interface ClockInCandidate {
  id: string;
  lat?: number | null;
  lng?: number | null;
  geofenceRadius?: number | null;
  geofencePolygon?: unknown;
  /** A shift for this member here today, as the server read it. */
  shiftToday?: boolean;
  /** This member's primary workspace. */
  isPrimary?: boolean;
}

export interface RankedCandidate<T extends ClockInCandidate> {
  location: T;
  /** Metres from the fix to the workspace, when both are known. */
  distanceM: number | null;
  /** Inside its area (a workspace with no area never is). */
  inside: boolean;
}

export type ClockInChoice<T extends ClockInCandidate> =
  /** Clock in here, without asking. */
  | { kind: 'auto'; location: T; why: 'ONLY_ONE' | 'INSIDE_AREA' }
  /** Ask, with this order and the first one chosen. */
  | { kind: 'ask'; ranked: RankedCandidate<T>[] }
  /** No workspace at all: the organization's Remote bucket. */
  | { kind: 'none' };

function measure<T extends ClockInCandidate>(location: T, fix: { lat: number; lng: number; accuracy?: number | null } | null): RankedCandidate<T> {
  if (!fix || location.lat == null || location.lng == null) return { location, distanceM: null, inside: false };
  const zone = {
    lat: location.lat,
    lng: location.lng,
    geofenceRadius: location.geofenceRadius ?? 0,
    geofencePolygon: parseGeofencePolygon(location.geofencePolygon),
  };
  const at = isAtSite({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy ?? 0 }, zone);
  return {
    location,
    distanceM: at.distanceToCentre == null ? null : Math.round(at.distanceToCentre),
    inside: siteEnforcesZone(zone) && at.inside,
  };
}

/**
 * Best first: inside its area, then a shift here today, then primary, then
 * nearest, then as listed. Stable, so two equal workspaces never swap between
 * one tap and the next.
 */
export function rankClockInLocations<T extends ClockInCandidate>(
  locations: readonly T[],
  fix: { lat: number; lng: number; accuracy?: number | null } | null,
): RankedCandidate<T>[] {
  return locations
    .map((l, i) => ({ ...measure(l, fix), i }))
    .sort((a, b) =>
      Number(b.inside) - Number(a.inside) ||
      Number(!!b.location.shiftToday) - Number(!!a.location.shiftToday) ||
      Number(!!b.location.isPrimary) - Number(!!a.location.isPrimary) ||
      (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) ||
      a.i - b.i,
    )
    .map(({ i: _i, ...rest }) => rest);
}

export function chooseClockInLocation<T extends ClockInCandidate>(
  locations: readonly T[],
  fix: { lat: number; lng: number; accuracy?: number | null } | null,
): ClockInChoice<T> {
  if (locations.length === 0) return { kind: 'none' };
  if (locations.length === 1) return { kind: 'auto', location: locations[0]!, why: 'ONLY_ONE' };
  const ranked = rankClockInLocations(locations, fix);
  const inside = ranked.filter((r) => r.inside);
  // Exactly one area around them is certain. Two overlapping areas are not.
  if (inside.length === 1) return { kind: 'auto', location: inside[0]!.location, why: 'INSIDE_AREA' };
  return { kind: 'ask', ranked };
}
