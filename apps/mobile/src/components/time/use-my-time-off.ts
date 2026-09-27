import { useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/auth-context';
import { useFetchData } from '../../hooks/useFetchData';
import { timeOffApi, scheduleApi, type TimeOffRequest, type ScheduleEntry } from '../../lib/api';
import { useQueuedCreate } from '../../offline/actions/queued-create';
import type { ActionOutcome } from '../../offline/actions/outcome';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { cancelTimeOff, pendingCancellations } from '../../offline/timeoff/time-off-actions';
import { uuidv7 } from '../../offline/ids';

export type MyTimeOffRequest = TimeOffRequest & { pendingSync?: boolean };

/**
 * THE MEMBER'S OWN LEAVE — their requests and their weekly rota, and asking
 * for or withdrawing a request, with or without signal.
 *
 * ⚠️ ONE COPY FOR TWO SCREENS. The Time tab's request sheet and the Time off
 * tab both read and write leave; two copies of "a request made with no signal
 * shows as waiting, a withdrawal on the phone already reads as withdrawn" is
 * how one of them forgets the phone.
 *
 * ⚠️ `enabled` IS A REQUEST BUDGET: a member without the time-off module makes
 * no leave request at all.
 */
export function useMyTimeOff(enabled = true) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const offline = useOffline();
  const { operations } = useSyncStatus();

  const fetcher = useCallback(async () => {
    if (!userId || !enabled) return { requests: [] as TimeOffRequest[], schedule: [] as ScheduleEntry[] };
    const [requests, schedule] = await Promise.all([
      timeOffApi.list(userId),
      scheduleApi.getMine(userId).catch(() => [] as ScheduleEntry[]),
    ]);
    return { requests: Array.isArray(requests) ? requests : [], schedule: Array.isArray(schedule) ? schedule : [] };
  }, [userId, enabled]);

  const fetched = useFetchData({ fetcher, initialData: { requests: [] as TimeOffRequest[], schedule: [] as ScheduleEntry[] } });

  /*
    Requests still on the phone are shown with the server's, as waiting, so a
    request made with no signal is visible at once — and marks its days —
    instead of appearing only once it reaches the office.
  */
  const create = useQueuedCreate<{ startDate: string; endDate: string; reason?: string }>('timeOff.request', {
    onAccepted: () => void fetched.fetchData(),
  });
  // A withdrawal still on the phone already reads as withdrawn.
  const cancelling = useMemo(() => pendingCancellations(operations), [operations]);

  const requests: MyTimeOffRequest[] = useMemo(() => {
    const server = (fetched.data?.requests ?? []).map((r) =>
      cancelling.has(r.id) && r.status === 'PENDING' ? ({ ...r, status: 'CANCELED' } as TimeOffRequest) : r,
    );
    const known = new Set(server.map((r) => r.id));
    const onPhone = create.pending
      .filter((p) => !known.has(p.id))
      .map((p) => ({
        id: p.id,
        technicianId: userId ?? '',
        startDate: p.body.startDate,
        endDate: p.body.endDate,
        reason: p.body.reason ?? undefined,
        status: 'PENDING',
        createdAt: new Date(p.createdAt).toISOString(),
        updatedAt: new Date(p.createdAt).toISOString(),
        pendingSync: true,
      }) as MyTimeOffRequest);
    return [...server, ...onPhone];
  }, [fetched.data?.requests, create.pending, userId, cancelling]);

  /** Ask for days off. `startDate`/`endDate` are local calendar days, `YYYY-MM-DD`. */
  const request = useCallback(async (body: { startDate: string; endDate: string; reason?: string }): Promise<ActionOutcome> => {
    if (!userId) return { kind: 'refused', message: 'Not signed in', conflict: false };
    const id = uuidv7();
    const outcome = await create.run(
      { id, entityId: id, lane: `timeoff:${userId}`, params: { employeeId: userId }, body },
      () => timeOffApi.request(userId, body),
    );
    if (outcome.kind === 'done') void fetched.fetchData();
    return outcome;
  }, [userId, create, fetched.fetchData]);

  /** Withdraw a request that is still waiting. */
  const cancel = useCallback(async (timeOffId: string): Promise<ActionOutcome> => {
    if (!userId) return { kind: 'refused', message: 'Not signed in', conflict: false };
    if (offline.engine) {
      const outcome = await cancelTimeOff(offline.engine, { memberId: userId, timeOffId });
      if (outcome.kind === 'done') void fetched.fetchData();
      return outcome;
    }
    await timeOffApi.cancel(timeOffId);
    void fetched.fetchData();
    return { kind: 'done', response: null };
  }, [userId, offline.engine, fetched.fetchData]);

  return {
    requests,
    schedule: fetched.data?.schedule ?? [],
    isLoading: fetched.isLoading,
    isRefreshing: fetched.isRefreshing,
    error: fetched.error,
    fetchData: fetched.fetchData,
    refresh: fetched.refresh,
    request,
    cancel,
  };
}
