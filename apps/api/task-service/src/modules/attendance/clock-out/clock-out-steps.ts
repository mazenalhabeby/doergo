import { ConflictException } from '@nestjs/common';
import {
  isAtSite,
  judgePosition,
  parseGeofencePolygon,
  success,
  type ClockTrigger,
  type ClosedHow,
  type OccurrenceEvidence,
  type PositionFact,
} from '@hbcfield/shared';
import { type ClockOutHandover } from '../../tasks/handover/job-pause.service';
import { SAME_TAP_MS } from '../core/attendance-occurrence';
import { CLOCK_OUT_TIME_FLAGS, PROVISIONAL_FLAGS } from '../core/open-shift-close';

/** The steps of `ClockOutService.clockOut` that need no database, in the order it runs them. */

export interface ClockOutInput {
  userId: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  notes?: string;
  organizationId: string;
  /**
   * Why they are leaving before the shift ends, when they are.
   *
   * Asked by the client, which knows the expected end, and recorded here. NOT
   * required: a person may always stop working, and a time system that refuses
   * a clock-out is a time system people work around.
   */
  earlyReason?: string;
  /**
   * Why they stayed past the shift end. With it, a late clock-out asks a
   * leader for the overtime — from the phone, with or without signal — instead
   * of relying on a prompt the member may never have seen.
   */
  overtimeReason?: string;
  /**
   * Which shift this closes. A phone that clocked in offline names the entry
   * it made, so a clock-out can never close a different shift than the one
   * the member was looking at.
   */
  entryId?: string;
  /** When and where the tap happened, for a clock-out recorded offline. */
  evidence?: OccurrenceEvidence;
  /** "What I did and what is left", per job, written in the clock-out sheet. */
  handovers?: ClockOutHandover[];
  /** AUTO = the automatic clock, on leaving the area. Re-checked; not allowed → an ordinary clock-out. */
  trigger?: ClockTrigger;
}

interface ClosedEntryFacts {
  id: string;
  status: string;
  clockOutAt: Date | null;
}

/**
 * Already closed. The same tap sent twice gets the same answer; a shift
 * closed some other way meanwhile (a manager, "I forgot to clock out") is a
 * conflict the member sees, never silently overwritten.
 */
export function alreadyClosedAnswer<E extends ClosedEntryFacts>(entry: E, evidence: OccurrenceEvidence | undefined) {
  const tapAt = evidence ? new Date(evidence.occurredAt).getTime() : NaN;
  if (entry.clockOutAt && Math.abs(entry.clockOutAt.getTime() - tapAt) <= SAME_TAP_MS) {
    return success(entry, 'Already clocked out');
  }
  throw new ConflictException({
    message: 'This shift was already closed before your clock-out arrived',
    code: 'ENTRY_ALREADY_CLOSED',
    params: { current: { id: entry.id, status: entry.status, clockOutAt: entry.clockOutAt } },
  });
}

/** Not before the shift began, nor before a rest in it ended. */
export function lastRestEnd(breaks: { endedAt: Date | null }[] | undefined): Date | null {
  return (breaks ?? []).reduce<Date | null>(
    (latest, b) => (b.endedAt && (!latest || b.endedAt > latest) ? b.endedAt : latest),
    null,
  );
}

interface SiteFacts {
  lat: number | null;
  lng: number | null;
  geofenceRadius: number;
  geofencePolygon: unknown;
}

/** Where the clock-out was made, judged against the site. */
export function geofenceAtOut(site: SiteFacts, fix: { lat?: number; lng?: number; accuracy?: number }) {
  // Geofence is only evaluable when BOTH the device and the location have
  // coords. A clock-out with no GPS fix (indoors / permission revoked) skips
  // the check entirely instead of feeding (0,0) into Haversine and faking a
  // huge distance → bogus OUTSIDE_GEOFENCE_OUT flag. (Sec audit H13.)
  const hasDeviceCoords = fix.lat != null && fix.lng != null;
  const hasLocationCoords = site.lat != null && site.lng != null;
  const geofenceEvaluable = hasDeviceCoords && hasLocationCoords;

  // Same helper as clock-in, so a boundary drawn for the site is honoured at
  // both ends of the shift. Non-evaluable → treated as within (no flag).
  const outZone = {
    lat: site.lat,
    lng: site.lng,
    geofenceRadius: site.geofenceRadius,
    geofencePolygon: parseGeofencePolygon(site.geofencePolygon),
  };
  const atOut = geofenceEvaluable
    ? isAtSite({ lat: fix.lat as number, lng: fix.lng as number, accuracy: fix.accuracy }, outZone)
    : null;
  return {
    hasDeviceCoords,
    geofenceEvaluable,
    distance: atOut?.distanceToCentre ?? 0,
    withinGeofence: atOut ? atOut.inside : true,
  };
}

/**
 * The flags the clock-out starts from. Replacing a temporary close drops what
 * that close added and what depended on its time.
 */
export function priorClockOutFlags(flagReasons: string[] | null | undefined, replacingProvisional: boolean): string[] {
  return replacingProvisional
    ? (flagReasons || []).filter((f) => !PROVISIONAL_FLAGS.has(f) && !CLOCK_OUT_TIME_FLAGS.has(f))
    : flagReasons || [];
}

/**
 * The reason rides with the entry, where the approvals queue reads it.
 * Prefixed rather than put in a column of its own: it IS a note about
 * the shift, and a manager reading the row wants it in the same place as
 * every other thing somebody wrote about that day.
 */
export function notesWithEarlyReason(notes: string | undefined, earlyReason: string): string | undefined {
  return earlyReason ? [notes, `Left early: ${earlyReason}`].filter(Boolean).join(' · ') : notes;
}

/**
 * The message says PAID time, not time present.
 *
 * "Total time: 12h 10m" on a shift that pays 11h 30m is the sentence that
 * starts the argument at the end of the month. The counted figure is the one
 * that matters to the person reading it, so it is the one on the screen.
 */
export function clockOutMessage(
  locationName: string,
  closed: { paidMinutes?: number | null; breakMinutes?: number | null },
  totalMinutes: number,
  shortBy: number,
): string {
  const paid = closed.paidMinutes ?? Math.max(0, totalMinutes - (closed.breakMinutes ?? 0));
  const ph = Math.floor(paid / 60);
  const pm = paid % 60;
  return shortBy > 0
    ? `Clocked out from ${locationName}. ${ph}h ${pm}m counted — ` +
        `${Math.floor(shortBy / 60)}h ${shortBy % 60}m short of your shift.`
    : `Clocked out from ${locationName}. ${ph}h ${pm}m counted.`;
}

/**
 * How a clock-out closed and where, for the label facts of a new entry: judged
 * with the SAME accuracy limit as clock-in (a too-coarse fix is "not judged",
 * never "on site"); an away day or an automatic clock-out is not judged at all.
 */
export function clockOutLabelSpec(
  entry: { isRemote?: boolean | null; location: SiteFacts },
  fix: { lat?: number; lng?: number; accuracy?: number },
  autoOut: boolean,
  trigger?: string,
): { closedHow: ClosedHow; clockOut: PositionFact; departureByPhone?: boolean } {
  const site = { ...entry.location, geofencePolygon: parseGeofencePolygon(entry.location.geofencePolygon) };
  const skip = entry.isRemote ? 'AWAY_DAY' : autoOut ? 'AUTO_CLOCK_OUT' : undefined;
  return {
    closedHow: autoOut ? 'AUTO_CLOCK_OUT' : 'CLOCKED_OUT',
    clockOut: judgePosition(fix, site, skip).fact,
    ...(trigger === 'AUTO' ? { departureByPhone: true } : {}),
  };
}
