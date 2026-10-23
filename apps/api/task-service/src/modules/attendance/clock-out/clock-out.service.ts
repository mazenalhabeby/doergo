import { clockOutTimeFlags } from '../core/open-shift-close';
import { Injectable, BadRequestException, ConflictException, Logger, Optional } from '@nestjs/common';
import {
  success,
  TimeEntryStatus,
  ATTENDANCE_CONSTANTS,
  shortfallMinutes,
  AUTO_CLOCK_OUT_FLAG,
  autoClockOutAfterEnd,
  clocksByPresence,
} from '@hbcfield/shared';
import { flagsWithMissedRest, parseBreakPlan } from '@hbcfield/shared';
import { fixOfTap, judgeOccurrence } from '../../../common/occurrence.util';
import { approvalFor } from '../core/attendance-occurrence';
import { CLOSE_ENTRY_INCLUDE } from './clock-out-helpers';
import { ShiftCloser } from './shift-closer.service';
import { ClockOutAlertsService } from './clock-out-alerts.service';
import { PrismaService } from '@hbcfield/shared';
import { AttendanceGeocoderService } from '../core/attendance-geocoder.service';
import { ExtraTimeService } from '../extra-time/extra-time.service';
import { AutoClockService } from '../auto-clock/auto-clock.service';
import { joinedIntoWhere } from '../core/clock-in-join';
import { alreadyClosedAnswer, clockOutLabelSpec, clockOutMessage, geofenceAtOut, lastRestEnd } from './clock-out-steps';
import { notesWithEarlyReason, priorClockOutFlags, type ClockOutInput } from './clock-out-steps';

export { CLOSE_ENTRY_INCLUDE } from './clock-out-helpers';

/**
 * Ending a shift: the clock-out, a forgotten clock-out resolved after the
 * fact, and the sweep that closes shifts left open — with the alerts each
 * of them raises.
 */
@Injectable()
export class ClockOutService {
  private readonly logger = new Logger(ClockOutService.name);

  constructor(
    private readonly prisma: PrismaService,
    // The ONE way a shift closes.
    private readonly closer: ShiftCloser,
    private readonly geocoder: AttendanceGeocoderService,
    private readonly extraTime: ExtraTimeService,
    // Who is told what when the shift ends (escalation resolved, left early, outside the site).
    private readonly alerts: ClockOutAlertsService,
    // ⚠️ Optional as `?`, never `T | undefined` — Nest would inject nothing (injectable-metadata.spec).
    @Optional() private readonly autoClock?: AutoClockService,
  ) {}

  /**
   * Clock out from current shift
   */
  async clockOut(data: ClockOutInput) {
    this.logger.log(`Clock out attempt: user=${data.userId}${data.entryId ? `, entry=${data.entryId}` : ''}`);

    const entry = await this.entryToClose(data);
    if (!entry) {
      throw new BadRequestException('You are not currently clocked in');
    }

    /*
      ⚠️ Closed by the open-shift sweep with a temporary time: the member's own
      clock-out WINS. Usually it is exactly the case the sweep cannot tell apart
      from forgetting — a phone that had no signal, sending the real tap now.
    */
    const replacingProvisional = entry.status === TimeEntryStatus.CLOCKED_OUT && entry.clockOutProvisional;
    if (entry.status !== TimeEntryStatus.CLOCKED_IN && !replacingProvisional) {
      return alreadyClosedAnswer(entry, data.evidence);
    }

    const occurrence = judgeOccurrence(data.evidence, lastRestEnd(entry.breaks) ?? entry.clockInAt);
    const tapFix = fixOfTap(data.evidence, occurrence.at, occurrence.flags);
    if (tapFix) {
      data.lat = tapFix.lat;
      data.lng = tapFix.lng;
      data.accuracy = tapFix.accuracy;
    }

    const { hasDeviceCoords, geofenceEvaluable, distance, withinGeofence } = geofenceAtOut(entry.location, data);
    /*
      Clocking out from outside the ring is a violation — unless the whole day
      was worked away from the site, where it is the expected place to be.

      ⚠️ ONE verdict for the flag AND the alert. They used to be decided apart,
      so an away day carried no flag yet still pushed "clocked out outside the
      site" to the member's watchers — a rule reported broken on a day worked
      exactly as agreed.
    */
    const clockOutTime = occurrence.at;

    const autoOut = await this.isAutomaticClockOut(data, entry, clockOutTime);

    /*
      ⚠️ An automatic clock-out is sent from where the member is AFTER leaving
      the area — leaving it is what made it. Outside is the only place it can
      come from, so it is never a violation: flagged, every one of them would
      wait for a person, and the leader would be told about each departure.
    */
    const outsideAtOut = !withinGeofence && !entry.isRemote && !autoOut;
    const totalMinutes = Math.round((clockOutTime.getTime() - entry.clockInAt.getTime()) / (1000 * 60));

    // Smart auto-approval: evaluate clock-out against schedule.
    const flagReasons: string[] = [...priorClockOutFlags(entry.flagReasons, replacingProvisional), ...occurrence.flags];

    // Flagging it on an away day would put a second amber badge on an entry that
    // already carries OUTSIDE_GEOFENCE_IN and is already waiting for review.
    if (outsideAtOut) {
      flagReasons.push('OUTSIDE_GEOFENCE_OUT');
    }

    // Overtime / early-departure flagging is ONLY meaningful against a concrete
    // expected end. `expectedClockOutAt` is stamped at clock-in by the shift
    // resolver (rota OR the legacy weekly schedule) as an absolute UTC instant —
    // timezone-correct and cross-midnight-safe. When it's null the session is
    // genuinely UNSCHEDULED (no shift/rota/schedule matched), so it can't be
    // "early" or "overtime" against anything — `clockOutTimeFlags` leaves those
    // flags off. (The old else-branch re-derived the weekday from the CLOCK-OUT
    // time in server-local time, which for a cross-midnight or cross-timezone
    // session matched the wrong day's schedule and produced a false "Early
    // Departure" alongside the "Unscheduled" tag.)
    const toleranceMin = await this.closer.getShiftFlagTolerance(entry.shiftId);
    flagReasons.push(...clockOutTimeFlags(entry, clockOutTime, toleranceMin));

    if (autoOut) flagReasons.push(AUTO_CLOCK_OUT_FLAG);

    /*
      How far short of the shift this falls.

      Computed from the same tolerance as the flags, by the same shared rule the
      phone used to ask the question — so the number the member was shown and the
      number their manager sees are the same number.
    */
    const shortBy = entry.endIsDailyLimit
      ? 0
      : shortfallMinutes({ clockOutAt: clockOutTime, expectedEndAt: entry.expectedClockOutAt, toleranceMin });
    const earlyReason = shortBy > 0 ? (data.earlyReason ?? '').trim().slice(0, 500) : '';

    // Deduplicate flags; a required rest that fell due and was never taken is missed now.
    const uniqueFlags = flagsWithMissedRest([...new Set(flagReasons)], parseBreakPlan(entry.breakPlan), clockOutTime);
    const approvalStatus = approvalFor(uniqueFlags);

    // Remote shifts capture a coarse place on clock-out too — only when we have
    // a fix to reverse-geocode.
    const clockOutPlace =
      entry.isRemote && hasDeviceCoords
        ? await this.geocoder.reverseGeocode(data.lat as number, data.lng as number)
        : undefined;

    /*
      Claimed, not overwritten: two clock-outs racing (the queue and a manager's
      edit) must not both close the shift with different times. The close also
      ends a rest still running, recounts, closes open excursions and pauses the
      jobs — the same close every other way a shift ends goes through.
    */
    const updatedEntry = await this.closer.closeEntry(entry, {
      at: clockOutTime,
      from: replacingProvisional ? 'PROVISIONAL' : 'OPEN',
      toleranceMin,
      labels: clockOutLabelSpec(entry, data, autoOut, data.trigger),
      fields: {
        clockOutLat: data.lat ?? null,
        clockOutLng: data.lng ?? null,
        clockOutAccuracy: data.accuracy,
        // null (not false) when the geofence couldn't be evaluated — records
        // "unknown", not "outside".
        clockOutWithinGeofence: geofenceEvaluable ? withinGeofence : null,
        notes: notesWithEarlyReason(data.notes, earlyReason),
        flagReasons: uniqueFlags,
        approvalStatus,
        clockOutPlace,
      },
      pause: { reason: 'CLOCK_OUT', handovers: data.handovers, sinceClockIn: true },
      announce: true,
      readBack: true,
    });
    if (!updatedEntry) {
      throw new ConflictException({
        message: 'This shift was closed at the same moment',
        code: 'ENTRY_ALREADY_CLOSED',
      });
    }

    const overtimeReason = (data.overtimeReason ?? '').trim().slice(0, 500);
    if (
      overtimeReason &&
      entry.expectedClockOutAt &&
      clockOutTime.getTime() > entry.expectedClockOutAt.getTime() + toleranceMin * 60_000
    ) {
      await this.extraTime.requestOvertimeAtClockOut(entry, updatedEntry, clockOutTime, overtimeReason);
    }

    if (entry.reminderState === 'ESCALATED') {
      const recordedOffline = occurrence.flags.includes('RECORDED_OFFLINE');
      await this.alerts.announceEscalationResolved(entry, updatedEntry, clockOutTime, recordedOffline);
    }

    if (shortBy > 0) {
      await this.alerts.announceLeftEarly(entry, updatedEntry, shortBy, earlyReason);
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    this.logger.log(
      `Clock out successful: entry=${entry.id}, user=${data.userId}, duration=${hours}h ${minutes}m, ` +
        `flags=[${uniqueFlags.join(',')}], approval=${approvalStatus}`,
    );

    // Send geofence alert if clock-out is outside geofence (never on an away day).
    if (outsideAtOut && ATTENDANCE_CONSTANTS.ALERT_ON_GEOFENCE_VIOLATION) {
      await this.alerts.sendGeofenceAlert({
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        distance: Math.round(distance),
        allowedRadius: entry.location.geofenceRadius,
        action: 'clock_out',
      });
    }

    // Entry landed in the approvals queue → nudge managers (bell + push).
    // What the close SAVED — it may have settled a missed rest with the automatic one.
    if (updatedEntry.approvalStatus === 'PENDING') {
      await this.closer.sendPendingApprovalAlert({
        entryId: updatedEntry.id,
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        flagReasons: updatedEntry.flagReasons ?? uniqueFlags,
        totalMinutes,
      });
    }

    return success(
      { ...updatedEntry, shortfallMinutes: shortBy },
      clockOutMessage(entry.location.name, updatedEntry, totalMinutes, shortBy),
    );
  }

  /** The shift this clock-out closes: the one named (or the one its clock-in joined), else the one running. */
  private entryToClose(data: ClockOutInput) {
    const include = { location: true, ...CLOSE_ENTRY_INCLUDE } as const;
    const own = { userId: data.userId, organizationId: data.organizationId };
    return data.entryId
      ? this.prisma.timeEntry.findFirst({
          where: { ...own, OR: [{ id: data.entryId }, joinedIntoWhere(data.entryId)] },
          include,
        })
      : this.prisma.timeEntry.findFirst({
          where: { userId: data.userId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
          include,
        });
  }

  /*
    ── The automatic clock ──
    Marked only when it holds: the automatic clock is on for this member here
    (asked of the shift's own clock-in) and they left at or after the planned
    end. Anything else is an ordinary clock-out with the ordinary rules
    (early departure included) — never refused.
  */
  private async isAutomaticClockOut(
    data: ClockOutInput,
    entry: {
      userId: string;
      locationId: string;
      clockInAt: Date;
      expectedClockInAt: Date | null;
      expectedClockOutAt: Date | null;
    },
    clockOutTime: Date,
  ): Promise<boolean> {
    if (data.trigger !== 'AUTO' || !this.autoClock) return false;
    const auto = await this.autoClock.settingsFor(entry.userId, entry.locationId, entry.clockInAt);
    // Clocked by arriving and leaving: leaving at any time after clocking in is the departure.
    const plannedEnd = auto && clocksByPresence(auto, entry) ? entry.clockInAt : entry.expectedClockOutAt;
    return !!auto && autoClockOutAfterEnd(auto, clockOutTime, plannedEnd);
  }
}
