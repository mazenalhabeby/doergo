import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth-context';
import { documentsApi } from '../lib/api/documents';
import { orgHasAddOn } from '@hbcfield/shared/client';

/**
 * What the member still owes the organization, fetched ONCE.
 *
 * Two places show this — a badge on the way into the documents screen, and a
 * card on the home screen — and a reminder that costs a request per screen is a
 * reminder that gets removed again six months later for being slow. One fetch
 * per session, refreshed when the app comes back to the foreground and after
 * the member submits something, serves both.
 *
 * Gated on the add-on before anything is requested: an organization that has
 * not bought Member Documents makes ZERO extra calls and sees nothing new.
 * A feature nobody bought must not cost them a round trip on every launch.
 *
 * Deliberately not a socket subscription. Requirements change when an admin
 * verifies something or a certificate ages out — neither is a thing anybody is
 * staring at the screen waiting for, and a live channel for it would be a
 * standing cost for an update that can wait until the next foreground.
 */

interface DocumentRequirementsValue {
  /** Types the member has to supply. Never what the org owes them. */
  toUpload: { typeId: string; label: string; blocksWork: boolean }[];
  /** Already issued to them, waiting on a signature. The other half. */
  toSign: { id: string; title: string }[];
  /** Held, valid, but running out — worth a mention, not a demand. */
  expiringSoon: { typeId: string; label: string; expiresOn: string | null }[];
  /** Everything waiting on the member, of either kind. */
  total: number;
  /** At least one outstanding requirement stops the member being given work. */
  blocksWork: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: DocumentRequirementsValue = {
  toUpload: [],
  toSign: [],
  expiringSoon: [],
  total: 0,
  blocksWork: false,
  refresh: async () => {},
};

const DocumentRequirementsContext = createContext<DocumentRequirementsValue>(EMPTY);

export function DocumentRequirementsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const enabled = orgHasAddOn(user?.orgAddOns ?? null, 'documents') && !!user;

  const [toUpload, setToUpload] = useState<DocumentRequirementsValue['toUpload']>([]);
  const [toSign, setToSign] = useState<DocumentRequirementsValue['toSign']>([]);
  const [expiringSoon, setExpiringSoon] = useState<DocumentRequirementsValue['expiringSoon']>([]);
  // A refresh already in flight, so a foreground event during the first load
  // does not fire a second identical request.
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setToUpload([]);
      setToSign([]);
      setExpiringSoon([]);
      return;
    }
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      try {
        // One request, both kinds. The server applies the same shared rules the
        // member's own documents screen does, so the badge and the screen can
        // never disagree about what is left.
        const pending = await documentsApi.pending();
        setToUpload(pending.toUpload);
        setToSign(pending.toSign);
        setExpiringSoon(pending.expiring);
      } catch {
        /*
          Silent on purpose. This is a reminder, not a screen somebody asked
          for — a toast saying the reminder could not load is noise about
          something nobody requested, and the real screen reports its own
          failures when they open it.
        */
      } finally {
        inFlight.current = null;
      }
    })();

    inFlight.current = run;
    return run;
  }, [enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [enabled, refresh]);

  const value = useMemo<DocumentRequirementsValue>(() => ({
    toUpload,
    toSign,
    expiringSoon,
    total: toUpload.length + toSign.length,
    blocksWork: toUpload.some((r) => r.blocksWork),
    refresh,
  }), [toUpload, toSign, expiringSoon, refresh]);

  return (
    <DocumentRequirementsContext.Provider value={value}>
      {children}
    </DocumentRequirementsContext.Provider>
  );
}

/** Safe outside the provider — returns nothing outstanding rather than throwing. */
export function useDocumentRequirements(): DocumentRequirementsValue {
  return useContext(DocumentRequirementsContext);
}
