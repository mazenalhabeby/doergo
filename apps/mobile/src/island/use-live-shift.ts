import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useShift } from '../offline/attendance/use-shift';
import { heroParts } from '../components/home/shift-state';
import { useIsland } from './island-context';

/**
 * THE REASON TO BUILD THIS RATHER THAN A NICER TOAST.
 *
 * While a member is on the clock the island never leaves: it shrinks to a
 * jade ring and a running figure and stays. Every screen in the app inherits a
 * live shift clock for nothing — Jobs, Messages, Team, the lot.
 *
 * ⚠️ IT IS MOUNTED ONCE, ABOVE THE TABS, NOT IN A CARD. A widget that owns the
 * live state can only keep it alive while that widget is on screen, which is
 * the one place a shift clock is least needed.
 *
 * ⚠️ AND IT TICKS THE SAME WAY THE CARD DOES: `now` moves, nothing
 * accumulates. A phone that slept through lunch is right the instant it wakes,
 * because no counter was running to fall behind.
 *
 * ⚠️ A REST IS NOT OFF THE CLOCK, and the figure must not keep climbing
 * through it either — `countedMinutes` is what the card's hero reads, so the
 * ring reads the same number and the two can never disagree.
 */
export function useLiveShift(): void {
  const shift = useShift();
  const { live, clearLive } = useIsland();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  /*
    ⚠️ `useShift` DOES NOT FETCH ON ITS OWN — every screen that shows a shift
    asks for it. The home card has always done this in its own effect, so this
    reader, mounted above the tabs, saw only the remembered copy and never a
    fresh answer: clock in, and the island stayed sealed until the member
    happened to open the home screen.

    ⚠️ AND AGAIN WHEN THE APP COMES BACK. A phone in a pocket for an hour has
    a stale figure the moment it is looked at, and the island is the one
    surface that is always on screen.
  */
  const refresh = shift.refresh;
  const asked = useRef(false);
  useEffect(() => {
    if (!asked.current) { asked.current = true; void refresh(); }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { setNow(new Date()); void refresh(); }
    });
    return () => sub.remove();
  }, [refresh]);

  const entry = shift.status?.currentEntry ?? null;
  const on = !!shift.status?.isClockedIn && !!entry;
  const resting = !!shift.breaks?.currentBreak;
  const from = entry?.countedStartAt ?? entry?.clockInAt ?? null;

  useEffect(() => {
    if (!on || !from) { clearLive(); return; }
    const started = new Date(from).getTime();
    const minutes = Math.max(0, Math.floor((now.getTime() - started) / 60000) - (entry?.unpaidBreakMinutes ?? 0));
    const parts = heroParts(minutes);
    live({
      /*
        ⚠️ SAY THE FACT, NOT THE VERDICT — and never the word "paid". The ring
        is the label; the figure is the counted time, the same one the card
        shows.
      */
      label: resting ? 'On a rest' : 'On the clock',
      value: parts.map((p) => `${p.value}${p.unit}`).join(' '),
    });
  }, [on, from, resting, now, entry?.unpaidBreakMinutes, live, clearLive]);
}
