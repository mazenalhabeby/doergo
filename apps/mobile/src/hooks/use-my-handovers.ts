import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi, type MyHandovers } from '../lib/api';
import { useQueuedCreate } from '../offline/actions/queued-create';

export const MY_HANDOVERS_KEY = ['tasks', 'handover', 'mine'] as const;

const EMPTY: MyHandovers = { open: [], owed: [], paused: [] };

/**
 * The member's own picture of stopped work (packages/shared/src/tasks/handover.ts):
 * the jobs they are working on (the clock-out sheet lists them), the notes they
 * owe (the home strip asks every open) and the jobs paused on them (offered once
 * they are clocked in again).
 *
 * ONE read for all three surfaces, so they cannot disagree. A note or a resume
 * still waiting on the phone already counts as done here — the member did it.
 */
export function useMyHandovers(options: { enabled?: boolean } = {}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: MY_HANDOVERS_KEY,
    queryFn: tasksApi.myHandovers,
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
  const refetch = () => void client.invalidateQueries({ queryKey: MY_HANDOVERS_KEY });
  const notes = useQueuedCreate('task.handover', { onAccepted: refetch });
  const resumes = useQueuedCreate('task.resume', { idField: null, onAccepted: refetch });

  const data = useMemo<MyHandovers>(() => {
    const d = query.data ?? EMPTY;
    const written = new Set(notes.pending.map((p) => p.params.taskId));
    const resumed = new Set(resumes.pending.map((p) => p.params.taskId));
    return {
      open: d.open,
      owed: d.owed.filter((j) => !written.has(j.id)),
      paused: d.paused.filter((j) => !resumed.has(j.id)),
    };
  }, [query.data, notes.pending, resumes.pending]);

  return { ...data, ready: query.isSuccess, refetch };
}

/** After anything that changes the picture: a clock-out, a clock-in, a note, a resume. */
export function useRefreshMyHandovers() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: MY_HANDOVERS_KEY });
}
