'use client';

import { useEffect, useRef } from 'react';
import { getToken, getTokenAt, setToken } from './api/client';
import { authApi } from './api/endpoints';

/** Signed out after this long with no keyboard, mouse or touch. Matches the server's token lifetime. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** A token older than this is swapped for a fresh one while somebody is working. */
export const REFRESH_AFTER_MS = 10 * 60 * 1000;
const TICK_MS = 30 * 1000;
const ACTIVITY = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

/**
 * Keeps a working session alive and ends an abandoned one.
 *
 * Platform tokens live 30 minutes. While the operator is active, the console
 * trades the token for a fresh one every ~10 minutes (the server caps the chain
 * at 12 hours from sign-in). With no activity for 30 minutes it signs out —
 * server-side, so the token stops working everywhere, not just in this tab.
 */
export function useSessionKeeper(active: boolean, onIdle: () => void) {
  const lastActivity = useRef(Date.now());
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!active) return;
    lastActivity.current = Date.now();
    const mark = () => { lastActivity.current = Date.now(); };
    for (const e of ACTIVITY) window.addEventListener(e, mark, { passive: true });
    let refreshing = false;
    const tick = async () => {
      const now = Date.now();
      if (now - lastActivity.current >= IDLE_LIMIT_MS) { onIdleRef.current(); return; }
      const recentlyActive = now - lastActivity.current < REFRESH_AFTER_MS;
      if (!refreshing && getToken() && recentlyActive && now - getTokenAt() >= REFRESH_AFTER_MS) {
        refreshing = true;
        try { setToken((await authApi.refresh()).token); } catch { /* a 401 already ended the session */ } finally { refreshing = false; }
      }
    };
    const timer = setInterval(tick, TICK_MS);
    // A tab coming back from sleep checks at once rather than at the next tick.
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      for (const e of ACTIVITY) window.removeEventListener(e, mark);
    };
  }, [active]);
}
