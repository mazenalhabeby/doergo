import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { customersApi, type ClientsDue, type DueReminder } from '@/lib/api/customers';
import { useQueuedWrite } from '@/offline/actions/queued-write';
import { setActivityDoneFromPhone } from '@/offline/crm/client-actions';
import { useOffline, useSyncStatus } from '@/offline/offline-context';
import { useToast } from '@/island/island-context';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { localDay, queuedDoneIds, withoutDone } from './clients-state';
import { UNDO_MS, type RowState } from './reminder-row';
import { impact, selection } from '@/lib/haptics';
import { mailtoUrl, openSafeUrl, telUrl } from '@/lib/safe-links';

const REFRESH_MS = 60_000;

/**
 * What the caller owes clients today, and the two acts on each reminder —
 * shared by the home Clients card and the top of the client book, so a
 * reminder ticked on one is the same tick, with the same undo and the same
 * queue, as on the other.
 */
export function useClientsDue(rows: number) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const write = useQueuedWrite();

  const [due, setDue] = useState<ClientsDue | null>(null);
  const [failed, setFailed] = useState(false);
  const day = useRef(localDay());
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const refresh = useCallback(async () => {
    day.current = localDay();
    try {
      const d = await customersApi.due(day.current, rows);
      if (live.current) { setDue(d); setFailed(false); }
    } catch {
      if (live.current) setFailed(true);
    }
  }, [rows]);

  /*
    ⚠️ AND WHEN THE SIGNAL RETURNS — AFTER THE QUEUE HAS GONE. A reminder ticked
    off with no signal is still in the outbox when the phone reconnects; asked
    first, the server answers with it still owed. `flush()` joins the send the
    reconnect already started rather than starting another.
  */
  const { running } = useOffline();
  useLiveRefresh(refresh, REFRESH_MS, { onReconnect: true, beforeReconnect: () => running?.flush() });
  const { operations } = useSyncStatus();
  const queued = useMemo(() => queuedDoneIds(operations), [operations]);

  const openClient = useCallback((id: string) => router.push(`/(app)/customer/${id}` as Href), [router]);

  /* The jade disc: the act itself. No number or address on file → the client, where one can be added. */
  const act = (r: DueReminder) => {
    const url = r.kind === 'CALL' ? telUrl(r.phone) : r.kind === 'EMAIL' ? mailtoUrl(r.email) : null;
    if (!url) { openClient(r.customerId); return; }
    void openSafeUrl(url).then((opened) => { if (!opened) openClient(r.customerId); });
  };

  /*
    ⭐ DONE, WITH A WAY BACK. The ring closes at once and the count drops, but
    nothing is sent for UNDO_MS: a reminder ticked off by mistake would
    otherwise be gone with no way to find it again. Then it is sent through
    the queue (still works with no signal) and the row folds away.
  */
  const [marked, setMarked] = useState<Record<string, { r: DueReminder; state: RowState | 'gone' }>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const send = useCallback(async (r: DueReminder) => {
    const outcome = await write.run(
      (e) => setActivityDoneFromPhone(e, { customerId: r.customerId, activityId: r.id, done: true }),
      () => customersApi.updateActivity(r.customerId, r.id, { done: true }),
    );
    if (outcome.kind === 'refused') {
      toast.error((outcome as { message?: string }).message || t('customers.record.reminderFailed'));
      if (live.current) setMarked((m) => { const { [r.id]: _, ...rest } = m; return rest; });
    }
    // The next reminder in line takes the freed row.
    if (live.current) void refresh();
  }, [write, toast, t, refresh]);

  const done = (r: DueReminder) => {
    impact('light');
    setMarked((m) => ({ ...m, [r.id]: { r, state: 'undo' } }));
    timers.current[r.id] = setTimeout(() => {
      delete timers.current[r.id];
      setMarked((m) => (m[r.id] ? { ...m, [r.id]: { r, state: 'leaving' } } : m));
      void send(r);
    }, UNDO_MS);
  };
  const undo = (r: DueReminder) => {
    clearTimeout(timers.current[r.id]);
    delete timers.current[r.id];
    selection();
    setMarked((m) => { const { [r.id]: _, ...rest } = m; return rest; });
  };
  const gone = useCallback((id: string) => setMarked((m) => (m[id] ? { ...m, [id]: { ...m[id]!, state: 'gone' } } : m)), []);

  /* Leaving the screen inside the undo window is not an undo: send what was ticked. */
  const pending = useRef(marked);
  pending.current = marked;
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => () => {
    for (const [id, tm] of Object.entries(timers.current)) {
      clearTimeout(tm);
      const e = pending.current[id];
      if (e) void sendRef.current(e.r);
    }
  }, []);

  /* Ticked here, plus ticked earlier and still in the queue — `queuedDoneIds`. */
  const doneHere = due
    ? [...Object.values(marked).map((x) => x.r), ...due.items.filter((r) => queued.has(r.id) && !marked[r.id])]
    : [];
  const shown = due ? withoutDone(due, doneHere, day.current.start) : null;
  /* The rows still to draw: not folded away, and not already done from the queue. */
  const rowsShown = due ? due.items.filter((r) => marked[r.id]?.state !== 'gone' && (!queued.has(r.id) || marked[r.id])) : [];
  const stateOf = (id: string): RowState => {
    const s = marked[id]?.state;
    return s && s !== 'gone' ? s : 'open';
  };

  return { due, shown, failed, dayStart: day.current.start, rowsShown, stateOf, act, done, undo, gone, openClient, refresh };
}

export type ClientsDueModel = ReturnType<typeof useClientsDue>;
