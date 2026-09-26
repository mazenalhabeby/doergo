import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '@hbcfield/shared/client';
import { useLiveRefresh } from './use-live-refresh';

/**
 * Where the phone is, for a home card — cheaply, and never by surprise.
 *
 * ⚠️ NEVER ASKS on its own. A home screen that pops a location prompt the
 * moment it opens is how people learn to deny it; the prompt comes only from
 * the card's own "Turn on location" button (`ask`).
 *
 * ⚠️ CHEAP BY DEFAULT: the last known fix (no GPS spin-up), refreshed with the
 * card. A fresh, accurate fix is taken only when it matters — when a button is
 * pressed (`fresh`), because the driver has moved since the card was drawn.
 * The position never leaves the phone except inside a plan request.
 */
/** The longest a button waits for a fresh fix before using the one it has. */
const FIX_MS = 6_000;

export function useDriverPosition(everyMs = 60_000) {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const read = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      setAllowed(perm.granted);
      if (!perm.granted) return;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
      const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch { /* no fix is a state (the card says so), not an error */ }
  }, []);
  useLiveRefresh(read, everyMs);

  /** A fresh fix, right now — for the moment a button is pressed. */
  const fresh = useCallback(async (): Promise<LatLng | null> => {
    try {
      if (!(await Location.getForegroundPermissionsAsync()).granted) return position;
      /*
        ⚠️ BOUNDED. A phone indoors or without a fix can take a minute to answer,
        and a button must not spin that long: after FIX_MS the fix it already
        had stands.
      */
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no fix')), FIX_MS)),
      ]);
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPosition(p);
      return p;
    } catch {
      return position;
    }
  }, [position]);

  /** The prompt — only from a tap. */
  const ask = useCallback(async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    setAllowed(granted);
    if (granted) await read();
    return granted;
  }, [read]);

  return { position, allowed, fresh, ask };
}
