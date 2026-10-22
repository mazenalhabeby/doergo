import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useFetchData } from '@/hooks/use-fetch-data';
import { timeOffApi, scheduleApi, type TimeOffRequest, type ScheduleEntry } from '@/lib/api';
import { useQueuedCreate } from '@/offline/actions/queued-create';
import { useQueuedWrite } from '@/offline/actions/queued-write';
import type { ActionOutcome } from '@/offline/actions/outcome';
import { useSyncStatus } from '@/offline/offline-context';
import { cancelTimeOff, pendingCancellations } from '@/offline/timeoff/time-off-actions';
import { uuidv7 } from '@/offline/ids';
import { isAbsence } from '@hbcfield/shared/client';
import { queuedRequestRow, type RequestBody } from '../requests/request-model';

export type MyTimeOffRequest = TimeOffRequest & { pendingSync?: boolean };

/**
 * THE MEMBER'S OWN REQUESTS — leave and every other kind, their weekly rota,
 * and asking for or withdrawing a request, with or without signal.
 *
 * ⚠️ ONE COPY FOR TWO SCREENS. The Time tab's request sheet and the Requests
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
  const write = useQueuedWrite();
  const { operations } = useSyncStatus();

  const fetcher = useCallback(async () => {
    if (!userId || !enabled) return { requests: [] as TimeOffRequest[], schedule: [] as ScheduleEntry[] };
    const [requests, schedule] = await Promise.all([
      timeOffApi.list(userId),
      scheduleApi.getMine(userId).catch(() => [] as ScheduleEntry[]),
    ]);
    return { requests: Array.isArray(requests) ? requests : [], schedule: Array.isArray(schedule) ? schedule : [] };
  }, [userId, enabled]);

  const fetched = useFetchData({
    fetcher,
    initialData: { requests: [] as TimeOffRequest[], schedule: [] as ScheduleEntry[] },
  });

  /*
    Requests still on the phone are shown with the server's, as waiting, so a
    request made with no signal is visible at once — and marks its days —
    instead of appearing only once it reaches the office.
  */
  const create = useQueuedCreate<RequestBody>('timeOff.request', {
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
      .map((p) => queuedRequestRow(p, userId ?? '') as MyTimeOffRequest);
    return [...server, ...onPhone];
  }, [fetched.data?.requests, create.pending, userId, cancelling]);

  /*
    ⚠️ ONLY LEAVE IS AN ABSENCE. The Time tab's "time off coming up", the days
    marked on the calendars and the days-used counts read this — a remote day
    or agreed overtime is a day worked, and counting it would show somebody off
    on a day they are working.
  */
  const absences = useMemo(() => requests.filter((r) => isAbsence(r.kind)), [requests]);

  /** Send any request — `draftToBody` builds the body. Days are local calendar days, `YYYY-MM-DD`. */
  const request = useCallback(
    async (body: RequestBody): Promise<ActionOutcome> => {
      if (!userId) return { kind: 'refused', message: 'Not signed in', conflict: false };
      const id = uuidv7();
      const outcome = await create.run(
        { id, entityId: id, lane: `timeoff:${userId}`, params: { employeeId: userId }, body },
        () => timeOffApi.request(userId, body),
      );
      if (outcome.kind === 'done') void fetched.fetchData();
      return outcome;
    },
    [userId, create, fetched.fetchData],
  );

  /** Withdraw a request that is still waiting. */
  const cancel = useCallback(
    async (timeOffId: string): Promise<ActionOutcome> => {
      if (!userId) return { kind: 'refused', message: 'Not signed in', conflict: false };
      const outcome = await write.run(
        (engine) => cancelTimeOff(engine, { memberId: userId, timeOffId }),
        () => timeOffApi.cancel(timeOffId),
      );
      if (outcome.kind === 'done') void fetched.fetchData();
      return outcome;
    },
    [userId, write, fetched.fetchData],
  );

  return {
    requests,
    absences,
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
