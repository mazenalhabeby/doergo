import React, { useEffect, useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { onSessionEnd } from '../lib/session/session-registry';

/**
 * The staff app's react-query cache.
 *
 * ⚠️ IT MUST WRAP THE WHOLE APP. The handover hooks (useMyHandovers,
 * useJobTime) read through react-query on the home screen and the job page;
 * only the customer portal used to have a client, so the home screen threw
 * "No QueryClient set" the moment it rendered.
 *
 * ONE CLIENT PER SIGNED-IN PERSON: a new client when the user changes, so the
 * next person on a shared phone never sees the last one's jobs from cache.
 */
export function AppQueryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false } },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId],
  );
  // …and emptied the moment the session ends, before the next person's first render.
  useEffect(() => onSessionEnd('app-query-client', () => client.clear()), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
