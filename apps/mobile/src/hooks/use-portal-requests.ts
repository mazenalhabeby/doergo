import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CustomerRequestView } from '@hbcfield/shared/client';
import { portalApi } from '../lib/api/portal';
import { useQueuedCreate } from '../offline/actions/queued-create';

/**
 * A client's requests: the server's, plus any still on the phone — first, so a
 * request reported with no signal shows at once. One hook for Home and the
 * Requests tab, so the two can never disagree about what was reported.
 */
export function usePortalRequests() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['portal', 'requests'], queryFn: portalApi.requests });
  const queued = useQueuedCreate<{ categoryKey: string; issue?: string }>('portal.request', { onAccepted: () => void query.refetch() });

  const requests = useMemo(() => {
    const server = query.data ?? [];
    const known = new Set(server.map((r) => r.id));
    const onPhone = queued.pending
      .filter((p) => !known.has(p.id))
      .map((p) => ({
        id: p.id,
        reference: t('offline.chip.waiting'),
        title: p.body.issue || p.body.categoryKey,
        status: 'NEW',
        priority: 'MEDIUM',
        createdAt: new Date(p.createdAt).toISOString(),
        tracked: false,
        timeline: [],
      }) as CustomerRequestView);
    return [...onPhone, ...server];
  }, [query.data, queued.pending, t]);

  const onPhoneIds = useMemo(() => new Set(queued.pending.map((p) => p.id)), [queued.pending]);
  return { query, requests, isOnPhone: (id: string) => onPhoneIds.has(id) };
}
