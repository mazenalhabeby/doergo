import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isAtSite, parseGeofencePolygon, type CompanyLocation } from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { getFix } from '@/lib/location-fix';
import { autoClockStore } from './store';
import { insideOf } from '@/lib/clock-smart';

const EMPTY: ReadonlySet<string> = new Set();

/** A position older than this says nothing about where the member is standing now. */
const RECENT_FIX_MS = 10 * 60_000;

/**
 * Where the member is standing, as far as the phone already knows — for the
 * arrival card ("You're at the Warehouse · your shift starts at 08:00").
 *
 * ⚠️ Costs nothing: it reads what the automatic clock's region events wrote AND,
 * for every member with a site (clock review C9 — the card was for automatic-clock
 * members only), the phone's LAST KNOWN position when it is recent, checked
 * against their own workspaces with the one site rule. No location is asked for
 * and no GPS is started; on mount, when the app comes back and once a minute.
 */
export function useInsideSites(sites?: readonly CompanyLocation[] | null): ReadonlySet<string> {
  const { user } = useAuth();
  const [inside, setInside] = useState<ReadonlySet<string>>(EMPTY);
  const siteKey = (sites ?? []).map((s) => s.id).join(',');
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const read = async () => {
      const fromRegions = await autoClockStore
        .load(user.id)
        .then((s) => insideOf(s.places))
        .catch(() => EMPTY);
      const here = new Set(fromRegions);
      for (const id of await insideByLastFix(sites ?? [])) here.add(id);
      if (alive) setInside(here);
    };
    void read();
    const tick = setInterval(() => void read(), 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void read();
    });
    return () => {
      alive = false;
      clearInterval(tick);
      sub.remove();
    };
    // The list of workspaces by id: a new object with the same places must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, siteKey]);
  return inside;
}

/** The workspaces the last known position (if recent) lies in — the cached fix only, never a new one. */
async function insideByLastFix(sites: readonly CompanyLocation[]): Promise<string[]> {
  const withPin = sites.filter((s) => s.lat != null && s.lng != null);
  if (!withPin.length) return [];
  const fix = await getFix({ purpose: 'cached', ask: false }).catch(() => null);
  if (!fix || Date.now() - fix.timestamp > RECENT_FIX_MS) return [];
  const point = { lat: fix.coords.latitude, lng: fix.coords.longitude, accuracy: fix.coords.accuracy ?? undefined };
  return withPin
    .filter(
      (s) =>
        isAtSite(point, {
          lat: s.lat,
          lng: s.lng,
          geofenceRadius: s.geofenceRadius ?? 50,
          geofencePolygon: parseGeofencePolygon((s as { geofencePolygon?: unknown }).geofencePolygon),
        }).inside,
    )
    .map((s) => s.id);
}
