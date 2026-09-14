import AsyncStorage from '@react-native-async-storage/async-storage';
import { attendanceApi } from '../lib/api';
import { isUnreachable } from '../offline/actions/unreachable';
import { createCheckInBuffer } from './check-in-buffer';

/** The phone's one buffer of check-ins kept without signal. */
export const keptCheckIns = createCheckInBuffer({
  storage: AsyncStorage,
  send: async (points) => {
    await attendanceApi.heartbeatBatch(points);
  },
  // Signed out counts as not sent yet: the points are still true once they sign back in.
  isUnreachable: (err) => isUnreachable(err) || (err as { statusCode?: number } | null)?.statusCode === 401,
});

/** Send what is kept. Never throws — called from background tasks and app triggers. */
export async function flushKeptCheckIns(): Promise<void> {
  try {
    await keptCheckIns.flush();
  } catch {
    /* next time */
  }
}
