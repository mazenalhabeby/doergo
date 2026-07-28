import { useCallback } from 'react';

import { useAuth } from '../contexts/auth-context';
import { formatClockString, formatTime, formatTimeRange } from '../lib/utils';

/**
 * Per-user 12h / 24h clock preference (mobile).
 *
 * The choice lives on the user account (`user.timeFormat`), returned at login, so
 * it follows the user across devices. This hook binds that preference into the
 * shared time formatters so screens never hardcode 12h/24h. Display-only — reads
 * an already-loaded field, so there is zero extra network / render cost.
 */
export function useTimeFormat() {
  const { user } = useAuth();
  const hour12 = user?.timeFormat === '12h';

  const time = useCallback(
    (input: string | Date) => formatTime(input, hour12),
    [hour12],
  );

  const range = useCallback(
    (dueDate: string | Date, durationHours = 1) => formatTimeRange(dueDate, durationHours, hour12),
    [hour12],
  );

  const schedule = useCallback(
    (hhmm: string | null | undefined) => formatClockString(hhmm, hour12),
    [hour12],
  );

  return {
    /** true when the user prefers 12-hour (AM/PM) display. */
    hour12,
    /** "2:30 PM" or "14:30" from a Date/ISO. */
    formatTime: time,
    /** "9:00 AM - 10:00 AM" or "09:00 - 10:00" for a task slot. */
    formatTimeRange: range,
    /** "5:30 PM" or "17:30" from a raw "HH:MM" schedule string. */
    formatSchedule: schedule,
  };
}
