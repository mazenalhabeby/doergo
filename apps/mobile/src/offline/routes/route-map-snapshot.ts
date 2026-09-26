import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import type { MapBounds } from '../../lib/route-day';

/**
 * ⭐ THE ROUTE'S MAP, KEPT AS A PICTURE.
 *
 * A live map view on a home card is the heaviest thing a home can hold — and
 * it is blank with no signal. So the card draws the real map ONCE for a plan,
 * keeps a snapshot of it on the phone, and from then on shows that picture:
 * one image, instant, offline. A new plan (a new area) makes a new one; the
 * old file is deleted, so there is only ever one per member.
 *
 * The bounds are kept with it — they are what lets the live drawing (route,
 * pins, where you are) land exactly on its streets.
 */
export interface RouteMapSnapshot { key: string; uri: string; bounds: MapBounds }

const KEY = (memberId: string) => `route_map_v1_${memberId}`;
const fileFor = (memberId: string, key: string) => new File(Paths.cache, `route-map-${memberId.replace(/[^\w-]/g, '')}-${key}.jpg`);

export async function keptRouteMap(memberId: string, key: string): Promise<RouteMapSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(memberId));
    const kept = raw ? (JSON.parse(raw) as RouteMapSnapshot) : null;
    if (!kept || kept.key !== key) return null;
    return fileFor(memberId, key).exists ? kept : null;
  } catch {
    return null;
  }
}

/** Keep a snapshot taken by the map (a temporary file) as this member's route map. */
export async function keepRouteMap(memberId: string, key: string, tempUri: string, bounds: MapBounds): Promise<RouteMapSnapshot | null> {
  try {
    const previous = await AsyncStorage.getItem(KEY(memberId));
    const dest = fileFor(memberId, key);
    if (dest.exists) dest.delete();
    new File(tempUri).copy(dest);
    const kept: RouteMapSnapshot = { key, uri: dest.uri, bounds };
    await AsyncStorage.setItem(KEY(memberId), JSON.stringify(kept));
    // One picture per member: the last plan's is no longer wanted.
    const old = previous ? (JSON.parse(previous) as RouteMapSnapshot) : null;
    if (old && old.key !== key) { const f = fileFor(memberId, old.key); if (f.exists) f.delete(); }
    return kept;
  } catch {
    return null;
  }
}
