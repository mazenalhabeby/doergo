import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { assetsApi, type HeldAsset } from '../lib/api';

/**
 * What this member holds, fetched once per session.
 *
 * The menu entry has to KNOW before it can decide whether to appear: most
 * members hold nothing, and a permanent "What I have" row that opens an empty
 * screen is how a menu teaches people to stop reading it.
 *
 * One request, cached against the user id. Not a context, because exactly one
 * screen asks and a provider for it would be ceremony — but cached all the
 * same, because the profile tab is opened repeatedly in a session and custody
 * changes about as often as a van does.
 *
 * ⚠️ Keyed on the USER, not on "is somebody signed in". Sign out and back in as
 * a colleague on the same device and a value derived only from "enabled" would
 * show the previous person's van.
 */
let cache: { userId: string; held: HeldAsset[] } | null = null;

/** Called after a handover or an expense, so the next read is fresh. */
export function forgetHeldAssets(): void {
  cache = null;
}

export function useHeldAssets(): { held: HeldAsset[]; loading: boolean; refresh: () => Promise<void> } {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [held, setHeld] = useState<HeldAsset[]>(
    cache && cache.userId === userId ? cache.held : [],
  );
  const [loading, setLoading] = useState(!cache || cache.userId !== userId);

  const load = useCallback(async () => {
    if (!userId) { setHeld([]); setLoading(false); return; }
    try {
      const rows = await assetsApi.mine();
      cache = { userId, held: rows };
      setHeld(rows);
    } catch {
      /*
        Swallowed on purpose. This decides whether a MENU ROW appears; an
        organization that has the Assets module switched off answers 402 here,
        and an error toast about a feature they have not bought would be noise
        on a screen they opened to change their password.
      */
      setHeld([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (cache && cache.userId === userId) { setHeld(cache.held); setLoading(false); return; }
    void load();
  }, [userId, load]);

  const refresh = useCallback(async () => { cache = null; await load(); }, [load]);

  return { held, loading, refresh };
}
