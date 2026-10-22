import { useNow } from './use-now';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../lib/api';

export const jobTimeKey = (taskId: string) => ['tasks', taskId, 'time'] as const;

/**
 * A job's time (travel / working / blocked), read from the server and ticked
 * forward on screen while it is live — once a minute, which is all the screen
 * shows. Refetched after a move on the job (`useRefreshJobTime`).
 */
export function useJobTime(taskId: string | null | undefined) {
  const query = useQuery({
    queryKey: jobTimeKey(taskId ?? ''),
    queryFn: () => tasksApi.jobTime(taskId!),
    enabled: !!taskId,
    staleTime: 60_000,
  });
  const live = !!query.data?.live;
  // Paused in the background; moved at once when the job goes live or the app comes back.
  const now = useNow(30_000, live);
  return { view: query.data ?? null, now };
}

export function useRefreshJobTime() {
  const client = useQueryClient();
  return (taskId: string) => void client.invalidateQueries({ queryKey: jobTimeKey(taskId) });
}
