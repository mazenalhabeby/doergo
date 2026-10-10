import { useEffect, useRef, useState } from 'react';
import { createNowTicker } from '../lib/now-ticker';
import { isAppActive, onAppStateChange } from '../lib/app-resume';

/**
 * The time, moved every `intervalMs` while the app is in front — paused in the
 * background, and moved at once on the way back. Milliseconds since the epoch.
 *
 * `enabled: false` stops it (a card with nothing live on it); turning it back
 * on moves it at once.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(false);
  useEffect(() => {
    // Mounting already read the clock; re-enabling (or a new interval) reads it again.
    const immediate = mounted.current;
    mounted.current = true;
    if (!enabled) return;
    const ticker = createNowTicker({ intervalMs, onTick: setNow });
    ticker.setRunning(isAppActive(), immediate);
    const off = onAppStateChange((s) => ticker.setRunning(s === 'active', true));
    return () => { off(); ticker.stop(); };
  }, [intervalMs, enabled]);
  return now;
}
