import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../contexts/auth-context';
import {
  formatClockString,
  formatDateOf,
  formatDateRelativeOf,
  formatDueDateOf,
  formatTime,
  formatTimeRange,
} from '../lib/utils';

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
  const { t, i18n } = useTranslation();
  const hour12 = user?.timeFormat === '12h';

  // Dates follow the active language (month names, order); the time-of-day
  // formatter stays locale-pinned so the 12h/24h preference always wins.
  const locale = useMemo(() => {
    const lang = i18n.language || 'en';
    if (lang.startsWith('de')) return 'de-DE';
    if (lang.startsWith('es')) return 'es-ES';
    if (lang.startsWith('it')) return 'it-IT';
    if (lang.startsWith('fr')) return 'fr-FR';
    return 'en-US';
  }, [i18n.language]);

  // Default display zone = the org's timezone, so times render in a fixed,
  // labeled zone instead of being silently converted to the device's local
  // zone. Attendance call sites override this per-entry with the location's
  // timezone by passing an explicit `tz` argument.
  const orgTz = user?.organizationTimezone || undefined;

  const time = useCallback(
    // `tz` overrides the org default (e.g. an attendance entry's location zone).
    // Pass `null` explicitly to opt out of any zone (raw device-local, no label).
    (input: string | Date, tz?: string | null) =>
      formatTime(input, hour12, tz === null ? undefined : tz ?? orgTz),
    [hour12, orgTz],
  );

  const range = useCallback(
    (dueDate: string | Date, durationHours = 1) => formatTimeRange(dueDate, durationHours, hour12),
    [hour12],
  );

  const schedule = useCallback(
    (hhmm: string | null | undefined) => formatClockString(hhmm, hour12),
    [hour12],
  );

  // Date-only, locale- AND timezone-aware. Use this for a date label that sits
  // next to a zoned time (e.g. attendance) so both agree on the calendar day.
  const date = useCallback(
    (input: string | number | Date, tz?: string | null) =>
      formatDateOf(input, locale, tz === null ? undefined : tz ?? orgTz),
    [locale, orgTz],
  );

  // Same, with the year — for standalone dates (task created / scheduled for)
  // that aren't sitting next to a time.
  const dateFull = useCallback(
    (input: string | number | Date, tz?: string | null) =>
      formatDateOf(input, locale, tz === null ? undefined : tz ?? orgTz, true),
    [locale, orgTz],
  );

  const dueDate = useCallback(
    (input: string | number | Date) =>
      formatDueDateOf(input, locale, {
        today: t('common.today', 'Today'),
        tomorrow: t('common.tomorrow', 'Tomorrow'),
      }),
    [locale, t],
  );

  const dateRelative = useCallback(
    (input: string | number | Date, tz?: string | null) =>
      formatDateRelativeOf(input, locale, tz === null ? undefined : tz ?? orgTz, {
        today: t('common.today', 'Today'),
        yesterday: t('common.yesterday', 'Yesterday'),
      }),
    [locale, orgTz, t],
  );

  return {
    /** true when the user prefers 12-hour (AM/PM) display. */
    hour12,
    /** IETF locale derived from the active language (drives month/day words). */
    locale,
    /** "2:30 PM" or "14:30" from a Date/ISO. */
    formatTime: time,
    /** "9:00 AM - 10:00 AM" or "09:00 - 10:00" for a task slot. */
    formatTimeRange: range,
    /** "5:30 PM" or "17:30" from a raw "HH:MM" schedule string. */
    formatSchedule: schedule,
    /** "Jan 15" / "15. Jan." — date only, locale + timezone aware. */
    formatDate: date,
    /** "Jan 15, 2026" / "15. Jan. 2026" — date with year, locale + tz aware. */
    formatDateFull: dateFull,
    /** "Today" / "Yesterday" (translated) else a locale date; day resolved in `tz`. */
    formatDateRelative: dateRelative,
    /** Due dates: "Today" / "Tomorrow" (translated) else a locale date. */
    formatDueDate: dueDate,
  };
}
