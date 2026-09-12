import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { checkVersion, type VersionStatus } from '../lib/version-gate';

/**
 * Is there a newer version in the store — asked more than once.
 *
 * ⚠️ THIS WAS CHECKED ONCE PER LAUNCH AND NEVER AGAIN, and that is how a
 * release goes unannounced. `MOBILE_LATEST_VERSION` is raised on the server the
 * moment the store publishes; every app already open had asked BEFORE that,
 * been told the latest was its own version, and had nothing to say. People
 * leave this app running all day on a work phone, so "once per launch" can mean
 * once a week.
 *
 * Re-asked when the app returns to the foreground, which is the cheapest moment
 * that reliably happens — and throttled, because foregrounding happens dozens
 * of times a day and the answer changes about once a fortnight.
 *
 * One provider rather than a hook per consumer: the banner and the profile
 * entry ask the same question, and two independent checks would be two requests
 * and two chances to disagree about the answer.
 */

const RECHECK_AFTER_MS = 15 * 60_000;

/**
 * The last answer, at module scope.
 *
 * ⚠️ For the ERROR BOUNDARY, which cannot reach the context at all: it is a
 * class component, so no hook is available to it, and it sits ABOVE this
 * provider in the tree — so when it catches, the provider may already be part
 * of the subtree that just came down.
 *
 * Module state survives that. It also means the crash screen can say "there is
 * a newer version" INSTANTLY, off an answer fetched minutes ago, instead of
 * making somebody watch a spinner on a screen that has already failed once.
 */
let lastKnown: VersionStatus | null = null;

/** What the last check said, or null if none has landed yet. */
export function lastKnownVersion(): VersionStatus | null {
  return lastKnown;
}

interface VersionContextValue {
  status: VersionStatus | null;
  /** Force a check — for a screen that has reason to believe it changed. */
  refresh: () => Promise<void>;
}

const VersionContext = createContext<VersionContextValue>({
  status: null,
  refresh: async () => {},
});

export function VersionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VersionStatus | null>(null);
  const lastCheck = useRef(0);
  const inFlight = useRef(false);

  const run = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastCheck.current < RECHECK_AFTER_MS) return;
    // A second foreground while the first request is still open would double
    // the work and race its own result.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await checkVersion();
      lastCheck.current = Date.now();
      lastKnown = next;
      setStatus(next);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void run(true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => sub.remove();
  }, [run]);

  return (
    <VersionContext.Provider value={{ status, refresh: () => run(true) }}>
      {children}
    </VersionContext.Provider>
  );
}

export function useVersionStatus(): VersionContextValue {
  return useContext(VersionContext);
}
