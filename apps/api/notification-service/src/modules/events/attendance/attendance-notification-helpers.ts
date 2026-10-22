import type { SupportedLocale } from '@hbcfield/shared';
import { zoneOf } from '@hbcfield/shared';
import type { GeofenceExcursionEvent as GeofenceExcursionPayload } from '@hbcfield/shared/microservices';

/** Payload of every geofence_excursion_* event — the event contract's (shared with task-service). */
type GeofenceExcursionEvent = GeofenceExcursionPayload;

// Labels for attendance approval flags in the SOCKET payload's `flagSummary`,
// which the web renders as a hint. The push and the bell entry do not use these:
// they are written per recipient from the catalogue (`pendingApprovalText`).
const FLAG_LABELS: Record<string, string> = {
  OVERTIME: 'overtime',
  MISSED_CLOCK_OUT: 'missed clock-out',
  OUTSIDE_GEOFENCE_IN: 'out of geofence',
  OUTSIDE_GEOFENCE_OUT: 'out of geofence',
  LATE_ARRIVAL: 'late arrival',
  EARLY_DEPARTURE: 'early departure',
  UNSCHEDULED_DAY: 'unscheduled day',
};

// Payload for every geofence_excursion_* event emitted by task-service.

/**
 * "Monday" / "Montag" / "lunes" — the weekday of a shift, in the entry's own
 * zone and the reader's language. A function of the locale, because the same
 * event reaches a German manager and a Spanish driver.
 */
function weekdayIn(iso: string, timezone?: string | null) {
  return (locale: SupportedLocale): string => {
    const d = new Date(iso);
    try {
      return d.toLocaleDateString(locale, { weekday: 'long', timeZone: zoneOf(timezone) });
    } catch {
      return d.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
    }
  };
}

/** "07:58" in the entry's own zone; the zone is what the member's day was lived in. */
export function noShowResolvedTime(iso: string, timezone?: string | null): string {
  const d = new Date(iso);
  try {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zoneOf(timezone) });
  } catch {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }
}

export { FLAG_LABELS, GeofenceExcursionEvent, weekdayIn };
