import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { autoClockStore } from './store';
import { insideOf } from '@/lib/clock-smart';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Where the member is standing, as far as the phone already knows — for the
 * arrival card ("You're at the Warehouse · your shift starts at 08:00").
 *
 * ⚠️ Costs nothing: it reads what the automatic clock's region events wrote,
 * on mount, when the app comes back and once a minute. No location is asked
 * for; a member without the automatic clock simply gets an empty set and the
 * card keeps its usual "starts in" line.
 */
export function useInsideSites(): ReadonlySet<string> {
  const { user } = useAuth();
  const [inside, setInside] = useState<ReadonlySet<string>>(EMPTY);
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const read = () => {
      void autoClockStore.load(user.id).then((s) => {
        if (alive) setInside(insideOf(s.places));
      }).catch(() => undefined);
    };
    read();
    const tick = setInterval(read, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') read(); });
    return () => { alive = false; clearInterval(tick); sub.remove(); };
  }, [user?.id]);
  return inside;
}
