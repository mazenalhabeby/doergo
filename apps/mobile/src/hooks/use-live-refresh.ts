import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { connectivity, type Connectivity } from '../offline/connectivity';

/**
 * Keep a live answer live: ask on every return to the screen, once a minute
 * while it is showing, when the app comes back to the foreground — and, for
 * the cards that ask for it, when the signal comes back.
 *
 * ⚠️ A home card that asked once when the app opened kept showing that
 * morning's copy — the tabs keep the home screen mounted. One hook, so every
 * card that shows something that moves refreshes the same way.
 */
export interface LiveRefreshOptions {
  /**
   * Also ask once when the signal returns (offline or limited → online).
   *
   * ⚠️ Only for answers nothing else brings back. The task list must NOT set
   * it: the offline provider already runs `syncAll` on reconnect and every
   * reader of the phone's copy re-reads when that pull lands.
   */
  onReconnect?: boolean;
  /**
   * Awaited before the reconnect ask — the outbox's flush, so a card does not
   * re-read the server's state from BEFORE the member's own queued change.
   */
  beforeReconnect?: () => Promise<unknown> | undefined;
}

/**
 * Two triggers inside this window are one ask.
 *
 * ⚠️ THEY ARRIVE TOGETHER. Coming out of airplane mode from the control centre
 * is the app becoming active AND the signal returning in the same second; on
 * Android a backgrounded interval fires on resume beside the resume itself.
 * Each used to be its own round of requests.
 */
export const LIVE_REFRESH_COALESCE_MS = 1_500;

export function useLiveRefresh(
  refresh: () => unknown,
  /** `null` = no timer: focus, resume and (opted in) reconnect only. */
  everyMs: number | null = 60_000,
  options: LiveRefreshOptions = {},
): void {
  /*
    ⚠️ THE LATEST `refresh`, BY REF — its identity is NOT a trigger. Keyed on
    it, every dependency change inside a card's refresh (the signal, the
    database finishing opening) re-ran the focus effect and asked again: an
    identity change is not a reason to spend a request.
  */
  const latest = useRef(refresh);
  latest.current = refresh;
  const opts = useRef(options);
  opts.current = options;
  const focused = useRef(false);
  const lastAsk = useRef<{ at: number; signal: Connectivity | null }>({ at: 0, signal: null });

  const ask = useCallback(() => {
    const now = Date.now();
    const signal = connectivity.state;
    /*
      ⚠️ AN ASK MADE WITH NO SIGNAL ABSORBS NOTHING. Resuming from airplane mode
      asks while NetInfo still says offline, and the reconnect half a second
      later is the ask that can actually be answered — so only an ask under the
      SAME signal counts as the one already made.
    */
    if (now - lastAsk.current.at < LIVE_REFRESH_COALESCE_MS && lastAsk.current.signal === signal) return;
    lastAsk.current = { at: now, signal };
    void latest.current();
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    ask();
    /*
      ⚠️ NO POLLING IN THE BACKGROUND. The screen stays "focused" while the app
      is behind another one, and Android keeps JS timers running for a while —
      so a card went on asking every minute for a screen nobody could see. The
      resume below catches up the moment it matters.
    */
    const id = everyMs == null ? null : setInterval(() => {
      if (AppState.currentState === 'active') ask();
    }, everyMs);
    return () => {
      focused.current = false;
      if (id) clearInterval(id);
    };
  }, [ask, everyMs]));

  useEffect(() => {
    /*
      ⚠️ ONLY WHILE THIS SCREEN IS THE ONE SHOWING. The home stays mounted
      under the other tabs, and resuming the app on Tasks used to refresh every
      home card behind it; returning to the home asks anyway (focus).
    */
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && focused.current) ask(); });
    return () => sub.remove();
  }, [ask]);

  useEffect(() => {
    if (!options.onReconnect) return;
    let was: Connectivity = connectivity.state;
    return connectivity.subscribe((now) => {
      const back = now === 'online' && was !== 'online';
      was = now;
      if (!back || !focused.current || AppState.currentState !== 'active') return;
      void Promise.resolve(opts.current.beforeReconnect?.())
        .catch(() => undefined)
        .then(ask);
    });
  }, [options.onReconnect, ask]);
}
