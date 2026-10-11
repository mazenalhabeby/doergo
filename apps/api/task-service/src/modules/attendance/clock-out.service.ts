import type { Prisma } from '@prisma/client';
import {
  CLOCK_OUT_TIME_FLAGS,
  OPEN_EXCURSION_STATUSES,
  PROVISIONAL_FLAGS,
  clockOutTimeFlags,
  endRunningRests,
  isAbandoned,
  provisionalClockOut,
  type RestRow,
} from './open-shift-close';
import { Injectable, Inject, BadRequestException, ConflictException, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobPauseService, type ClockOutHandover } from '../tasks/handover/job-pause.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import {
  success,
  TimeEntryStatus,
  isAtSite,
  parseGeofencePolygon,
  ATTENDANCE_CONSTANTS,
  OPEN_SHIFT_CLOSE,
  shortfallMinutes,
  SERVICE_NAMES,
} from '@hbcfield/shared';
import { clockEventEntry } from './clock-event';
import { CountedTimeService } from './counted-time.service';
import type { OccurrenceEvidence } from '@hbcfield/shared';
import { fixOfTap, judgeOccurrence } from '../../common/occurrence.util';
import { approvalFor, SAME_TAP_MS } from './attendance-occurrence';
import { AttendanceRoutingService } from './attendance-routing.service';
import { AttendanceGeocoderService } from './attendance-geocoder.service';
import { ExtraTimeService } from './extra-time.service';

/**
 * What every close reads in the SAME query as the entry: all its rests (the
 * totals are recomputed from the rows) and the excursions still open on it.
 * One include, so a sweep closing a hundred shifts asks once, not per row.
 */
export const CLOSE_ENTRY_INCLUDE = {
  breaks: { select: { id: true, startedAt: true, endedAt: true, durationMinutes: true, isPaid: true } },
  geofenceExcursions: {
    where: { status: { in: [...OPEN_EXCURSION_STATUSES] } },
    orderBy: { leftRingAt: 'asc' },
    select: { id: true, leftRingAt: true },
  },
} satisfies Prisma.TimeEntryInclude;

/** The entry as a close needs it — any caller's row with CLOSE_ENTRY_INCLUDE. */
interface ClosableEntry {
  id: string;
  userId: string;
  organizationId: string;
  clockInAt: Date;
  expectedClockInAt?: Date | null;
  expectedClockOutAt?: Date | null;
  shiftId?: string | null;
  breakMinutes?: number | null;
  unpaidBreakMinutes?: number | null;
  breaks?: RestRow[];
  geofenceExcursions?: { id: string }[];
}

/** How a shift is being closed. Everything the close itself works out is NOT here. */
interface CloseSpec {
  /** The clock-out instant recorded on the entry. */
  at: Date;
  /** What the claim requires: an open shift, or one the sweep closed temporarily. */
  from: 'OPEN' | 'PROVISIONAL';
  /** CLOCKED_OUT, or AUTO_OUT for a close the system made on somebody's behalf. */
  status?: TimeEntryStatus.CLOCKED_OUT | TimeEntryStatus.AUTO_OUT;
  /** What only this caller knows: flags, approval, notes, position, provisional basis. */
  fields: Prisma.TimeEntryUpdateManyMutationInput;
  /** Pass it when already looked up (the clock-out needs it for its flags). */
  toleranceMin?: number;
  pause: {
    reason: 'CLOCK_OUT' | 'AUTO_CLOSE' | 'FORGOT' | 'OFFICE_CLOSE';
    handovers?: ClockOutHandover[];
    /** Move pauses this shift already made to the close (a real time replacing a guess). */
    sinceClockIn: boolean;
  };
  /** Emit `attendance_clock_out`. The sweep announces its own, different event. */
  announce: boolean;
  /** Read the closed row back (with location + user) for the caller's reply. */
  readBack: boolean;
  now?: Date;
}

const CLOSED_ROW_INCLUDE = {
  location: true,
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TimeEntryInclude;
type ClosedRow = Prisma.TimeEntryGetPayload<{ include: typeof CLOSED_ROW_INCLUDE }>;

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
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly notificationRouting: NotificationRoutingService,
    private readonly countedTime: CountedTimeService,
    // Who is told about this member, at this workspace.
    private readonly routing: AttendanceRoutingService,
    private readonly geocoder: AttendanceGeocoderService,
    private readonly extraTime: ExtraTimeService,
    // Jobs left in work are paused at every way a shift ends (packages/shared/src/tasks/handover.ts).
    @Optional() private readonly jobPause?: JobPauseService,
  ) {}

  /**
   * Clock out from current shift
   */
  async clockOut(data: {
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
  }) {
    this.logger.log(`Clock out attempt: user=${data.userId}${data.entryId ? `, entry=${data.entryId}` : ''}`);

    const include = { location: true, ...CLOSE_ENTRY_INCLUDE } as const;
    const entry = data.entryId
      ? await this.prisma.timeEntry.findFirst({
          where: { id: data.entryId, userId: data.userId, organizationId: data.organizationId },
          include,
        })
      : await this.prisma.timeEntry.findFirst({
          where: { userId: data.userId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
          include,
        });

    if (!entry) {
      throw new BadRequestException('You are not currently clocked in');
    }

    /*
      Already closed. The same tap sent twice gets the same answer; a shift
      closed some other way meanwhile (a manager, "I forgot to clock out") is a
      conflict the member sees, never silently overwritten.
    */
    /*
      ⚠️ Closed by the open-shift sweep with a temporary time: the member's own
      clock-out WINS. Usually it is exactly the case the sweep cannot tell apart
      from forgetting — a phone that had no signal, sending the real tap now.
    */
    const replacingProvisional = entry.status === TimeEntryStatus.CLOCKED_OUT && entry.clockOutProvisional;
    if (entry.status !== TimeEntryStatus.CLOCKED_IN && !replacingProvisional) {
      const tapAt = data.evidence ? new Date(data.evidence.occurredAt).getTime() : NaN;
      if (entry.clockOutAt && Math.abs(entry.clockOutAt.getTime() - tapAt) <= SAME_TAP_MS) {
        return success(entry, 'Already clocked out');
      }
      throw new ConflictException({
        message: 'This shift was already closed before your clock-out arrived',
        code: 'ENTRY_ALREADY_CLOSED',
        params: { current: { id: entry.id, status: entry.status, clockOutAt: entry.clockOutAt } },
      });
    }

    // Not before the shift began, nor before a rest in it ended.
    const lastRestEnd = (entry.breaks ?? []).reduce<Date | null>(
      (latest, b) => (b.endedAt && (!latest || b.endedAt > latest) ? b.endedAt : latest),
      null,
    );
    const occurrence = judgeOccurrence(data.evidence, lastRestEnd ?? entry.clockInAt);
    const tapFix = fixOfTap(data.evidence, occurrence.at, occurrence.flags);
    if (tapFix) {
      data.lat = tapFix.lat;
      data.lng = tapFix.lng;
      data.accuracy = tapFix.accuracy;
    }

    // Geofence is only evaluable when BOTH the device and the location have
    // coords. A clock-out with no GPS fix (indoors / permission revoked) skips
    // the check entirely instead of feeding (0,0) into Haversine and faking a
    // huge distance → bogus OUTSIDE_GEOFENCE_OUT flag. (Sec audit H13.)
    const hasDeviceCoords = data.lat != null && data.lng != null;
    const hasLocationCoords = entry.location.lat != null && entry.location.lng != null;
    const geofenceEvaluable = hasDeviceCoords && hasLocationCoords;

    // Same helper as clock-in, so a boundary drawn for the site is honoured at
    // both ends of the shift. Non-evaluable → treated as within (no flag).
    const outZone = {
      lat: entry.location.lat,
      lng: entry.location.lng,
      geofenceRadius: entry.location.geofenceRadius,
      geofencePolygon: parseGeofencePolygon(entry.location.geofencePolygon),
    };
    const atOut = geofenceEvaluable
      ? isAtSite(
          { lat: data.lat as number, lng: data.lng as number, accuracy: data.accuracy },
          outZone,
        )
      : null;
    const distance = atOut?.distanceToCentre ?? 0;
    const withinGeofence = atOut ? atOut.inside : true;
    /*
      Clocking out from outside the ring is a violation — unless the whole day
      was worked away from the site, where it is the expected place to be.

      ⚠️ ONE verdict for the flag AND the alert. They used to be decided apart,
      so an away day carried no flag yet still pushed "clocked out outside the
      site" to the member's watchers — a rule reported broken on a day worked
      exactly as agreed.
    */
    const outsideAtOut = !withinGeofence && !entry.isRemote;

    const clockOutTime = occurrence.at;
    const totalMinutes = Math.round(
      (clockOutTime.getTime() - entry.clockInAt.getTime()) / (1000 * 60),
    );

    // Smart auto-approval: evaluate clock-out against schedule. Replacing a
    // temporary close drops what that close added and what depended on its time.
    const priorFlags = replacingProvisional
      ? (entry.flagReasons || []).filter((f) => !PROVISIONAL_FLAGS.has(f) && !CLOCK_OUT_TIME_FLAGS.has(f))
      : entry.flagReasons || [];
    const flagReasons: string[] = [...priorFlags, ...occurrence.flags];

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
    const toleranceMin = await this.getShiftFlagTolerance(entry.shiftId);
    flagReasons.push(...clockOutTimeFlags(entry, clockOutTime, toleranceMin));

    /*
      How far short of the shift this falls.

      Computed from the same tolerance as the flags, by the same shared rule the
      phone used to ask the question — so the number the member was shown and the
      number their manager sees are the same number.
    */
    const shortBy = entry.endIsDailyLimit
      ? 0
      : shortfallMinutes({
          clockOutAt: clockOutTime,
          expectedEndAt: entry.expectedClockOutAt,
          toleranceMin,
        });
    const earlyReason = shortBy > 0 ? (data.earlyReason ?? '').trim().slice(0, 500) : '';

    // Deduplicate flags
    const uniqueFlags = [...new Set(flagReasons)];
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
    const updatedEntry = await this.closeEntry(entry, {
      at: clockOutTime,
      from: replacingProvisional ? 'PROVISIONAL' : 'OPEN',
      toleranceMin,
      fields: {
        clockOutLat: data.lat ?? null,
        clockOutLng: data.lng ?? null,
        clockOutAccuracy: data.accuracy,
        // null (not false) when the geofence couldn't be evaluated — records
        // "unknown", not "outside".
        clockOutWithinGeofence: geofenceEvaluable ? withinGeofence : null,
        // The reason rides with the entry, where the approvals queue reads it.
        // Prefixed rather than put in a column of its own: it IS a note about
        // the shift, and a manager reading the row wants it in the same place as
        // every other thing somebody wrote about that day.
        notes: earlyReason
          ? [data.notes, `Left early: ${earlyReason}`].filter(Boolean).join(' · ')
          : data.notes,
        flagReasons: uniqueFlags,
        approvalStatus,
        clockOutPlace,
      },
      pause: { reason: 'CLOCK_OUT', handovers: data.handovers, sinceClockIn: true },
      announce: true,
      readBack: true,
    });
    if (!updatedEntry) {
      throw new ConflictException({ message: 'This shift was closed at the same moment', code: 'ENTRY_ALREADY_CLOSED' });
    }

    const overtimeReason = (data.overtimeReason ?? '').trim().slice(0, 500);
    if (overtimeReason && entry.expectedClockOutAt && clockOutTime.getTime() > entry.expectedClockOutAt.getTime() + toleranceMin * 60_000) {
      await this.extraTime.requestOvertimeAtClockOut(entry, updatedEntry, clockOutTime, overtimeReason);
    }

    if (entry.reminderState === 'ESCALATED') {
      /*
        The supervisors were told "still clocked in past the end of the shift".
        The clock-out has now arrived — usually from a phone that had no signal,
        with the time it was actually tapped. Say so, to the same people.
      */
      const leaderIds = await this.routing.notifyTargetsFor(entry, 'canReconcileAttendance');
      this.notificationClient.emit('attendance_shift_escalation_resolved', {
        entryId: entry.id,
        userId: entry.userId,
        userName: `${updatedEntry.user?.firstName ?? ''} ${updatedEntry.user?.lastName ?? ''}`.trim(),
        clockOutAt: clockOutTime.toISOString(),
        timezone: entry.timezone ?? updatedEntry.location?.timezone ?? 'UTC',
        recordedOffline: occurrence.flags.includes('RECORDED_OFFLINE'),
        leaderIds,
        organizationId: entry.organizationId,
      });
    }

    if (shortBy > 0) {
      /*
        Somebody has to know.

        The entry was already FLAGGED for this and landed in an approval queue —
        which nobody watches in the moment. A shift ending ninety minutes early
        is operational news: the site is a person short right now, and finding
        out at the end of the month is finding out too late.
      */
      const leaderIds = await this.routing.notifyTargetsFor(entry, 'canReconcileAttendance');
      this.notificationClient.emit('attendance_left_early', {
        entryId: entry.id,
        userId: entry.userId,
        userName: `${updatedEntry.user?.firstName ?? ''} ${updatedEntry.user?.lastName ?? ''}`.trim(),
        locationId: entry.locationId,
        locationName: updatedEntry.location?.name ?? 'a shift',
        shortfallMinutes: shortBy,
        expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
        reason: earlyReason || null,
        leaderIds,
        organizationId: entry.organizationId,
      });
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    this.logger.log(
      `Clock out successful: entry=${entry.id}, user=${data.userId}, duration=${hours}h ${minutes}m, flags=[${uniqueFlags.join(',')}], approval=${approvalStatus}`,
    );

    // Send geofence alert if clock-out is outside geofence (never on an away day).
    if (outsideAtOut && ATTENDANCE_CONSTANTS.ALERT_ON_GEOFENCE_VIOLATION) {
      await this.sendGeofenceAlert({
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        distance: Math.round(distance),
        allowedRadius: entry.location.geofenceRadius,
        action: 'clock_out',
      });
    }

    // Entry landed in the approvals queue → nudge managers (bell + push).
    if (approvalStatus === 'PENDING') {
      await this.sendPendingApprovalAlert({
        entryId: updatedEntry.id,
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        flagReasons: uniqueFlags,
        totalMinutes,
      });
    }

    /*
      The message says PAID time, not time present.

      "Total time: 12h 10m" on a shift that pays 11h 30m is the sentence that
      starts the argument at the end of the month. The counted figure is the one
      that matters to the person reading it, so it is the one on the screen.
    */
    const paid = updatedEntry.paidMinutes ?? Math.max(0, totalMinutes - (updatedEntry.breakMinutes ?? 0));
    const ph = Math.floor(paid / 60);
    const pm = paid % 60;

    return success(
      { ...updatedEntry, shortfallMinutes: shortBy },
      shortBy > 0
        ? `Clocked out from ${entry.location.name}. ${ph}h ${pm}m counted — ${Math.floor(shortBy / 60)}h ${shortBy % 60}m short of your shift.`
        : `Clocked out from ${entry.location.name}. ${ph}h ${pm}m counted.`,
    );
  }

  // ==========================================================================
  // SHIFT REMINDER RESPONSES — worker actions + leader approval (Phase 3)
  // These are how an open shift gets resolved. Nothing here is auto-closed by
  // the machine; every path is driven by a human tapping a reminder action.
  // ==========================================================================

  /**
   * Worker responds "I forgot to clock out" with their real leave time
   * (trusted self-report). Closes the entry at that time. If the reported time
   * is beyond the expected shift end, the entry is flagged OVERTIME and lands in
   * the approvals queue for a leader to review — overtime is never paid silently.
   */
  async resolveForgotClockOut(data: {
    userId: string;
    entryId: string;
    clockOutAt: string;
    organizationId: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        userId: data.userId,
        organizationId: data.organizationId,
        // Open — or closed by the sweep with a temporary time, which is exactly
        // what "when did you leave?" is asking the member to correct.
        OR: [{ status: TimeEntryStatus.CLOCKED_IN }, { status: TimeEntryStatus.CLOCKED_OUT, clockOutProvisional: true }],
      },
      include: { location: true, ...CLOSE_ENTRY_INCLUDE },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');
    const wasProvisional = entry.status === TimeEntryStatus.CLOCKED_OUT;

    const clockOutTime = new Date(data.clockOutAt);
    const now = new Date();
    if (isNaN(clockOutTime.getTime())) throw new BadRequestException('Invalid clock-out time');
    if (clockOutTime.getTime() <= entry.clockInAt.getTime()) {
      throw new BadRequestException('Clock-out time must be after clock-in');
    }
    if (clockOutTime.getTime() > now.getTime() + 60_000) {
      throw new BadRequestException('Clock-out time cannot be in the future');
    }

    // Store GROSS minutes (clock-in → clock-out), consistent with the normal
    // clockOut path — break time lives separately on breakMinutes and is netted
    // out downstream, so we must not pre-subtract it here (that double-counted).
    const totalMinutes = Math.round((clockOutTime.getTime() - entry.clockInAt.getTime()) / 60_000);

    // Not before a rest in the shift ended (the sweep may have ended one).
    const lastRestEnd = (entry.breaks ?? []).reduce<number>((t, b) => (b.endedAt ? Math.max(t, b.endedAt.getTime()) : t), 0);
    if (clockOutTime.getTime() < lastRestEnd) {
      throw new BadRequestException({ message: 'Clock-out time is before a rest in this shift ended', code: 'OUT_OF_ORDER' });
    }

    const base = wasProvisional
      ? (entry.flagReasons || []).filter((f) => f !== 'CLOCK_OUT_PROVISIONAL' && !CLOCK_OUT_TIME_FLAGS.has(f))
      : entry.flagReasons || [];
    /*
      ⚠️ The SAME time flags as a tapped clock-out, tolerance included. This
      path used to flag OVERTIME a single minute past the end and never
      EARLY_DEPARTURE — a forgotten clock-out is a late clock-out, not a
      different kind of day, so it is judged by the same rule.
    */
    const toleranceMin = await this.getShiftFlagTolerance(entry.shiftId);
    const timeFlags = clockOutTimeFlags(entry, clockOutTime, toleranceMin);
    const uniqueFlags = [...new Set<string>([...base, 'MISSED_CLOCK_OUT', ...timeFlags])];
    const isOvertime = timeFlags.includes('OVERTIME') || timeFlags.includes('PAST_DAILY_LIMIT');

    // Claimed: the answer and a real clock-out arriving together must not both write.
    const updated = await this.closeEntry(entry, {
      at: clockOutTime,
      from: wasProvisional ? 'PROVISIONAL' : 'OPEN',
      toleranceMin,
      fields: {
        notes: 'Self-reported clock-out (forgot to clock out)',
        flagReasons: uniqueFlags,
        approvalStatus: 'PENDING', // a forgotten clock-out is always worth a glance
      },
      pause: { reason: 'FORGOT', sinceClockIn: true },
      announce: true,
      readBack: true,
      now,
    });
    if (!updated) {
      throw new ConflictException({ message: 'This shift was closed at the same moment', code: 'ENTRY_ALREADY_CLOSED' });
    }

    await this.sendPendingApprovalAlert({
      entryId: updated.id,
      userId: data.userId,
      organizationId: data.organizationId,
      locationName: entry.location?.name || 'Unknown',
      flagReasons: uniqueFlags,
      totalMinutes,
    });

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return success(
      updated,
      `Clocked out. Total time: ${h}h ${m}m${isOvertime ? ' (overtime pending approval)' : ''}`,
    );
  }

  /**
   * Close shifts left open with a TEMPORARY clock-out.
   *
   * ⚠️ Why at all: nothing used to close a forgotten shift, and with one open
   * shift per member the next day's clock-in was refused. Why temporary: the
   * member may simply have had no signal — their real clock-out is on its way,
   * and it must win when it arrives (see clockOut), as must their answer to
   * "when did you leave?" (resolveForgotClockOut).
   *
   * Cheap on purpose: two partial indexes over OPEN shifts answer the query,
   * a tick takes at most OPEN_SHIFT_CLOSE.BATCH, and each close is claimed
   * (status = CLOCKED_IN) so a racing clock-out or a second replica cannot
   * both win. The rests and excursions ride in the same read (no query per row).
   */
  async closeAbandonedShifts(now: Date = new Date()) {
    const due = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        OR: [
          { expectedClockOutAt: { lte: new Date(now.getTime() - OPEN_SHIFT_CLOSE.AFTER_SHIFT_END_HOURS * 3_600_000) } },
          { expectedClockOutAt: null, clockInAt: { lte: new Date(now.getTime() - OPEN_SHIFT_CLOSE.UNPLANNED_AFTER_HOURS * 3_600_000) } },
        ],
      },
      orderBy: { clockInAt: 'asc' },
      take: OPEN_SHIFT_CLOSE.BATCH,
      include: {
        ...CLOSE_ENTRY_INCLUDE,
        // Named in the member's email, so they can tell which shift is meant.
        location: { select: { name: true } },
      },
    });

    let closed = 0;
    for (const entry of due) {
      if (!isAbandoned(entry, now)) continue;
      const { at, basis } = provisionalClockOut({
        clockInAt: entry.clockInAt,
        expectedClockOutAt: entry.expectedClockOutAt,
        leftSiteAt: entry.geofenceExcursions[0]?.leftRingAt ?? null,
        now,
      });

      const flags = [...new Set([...(entry.flagReasons ?? []), 'MISSED_CLOCK_OUT', 'CLOCK_OUT_PROVISIONAL'])];
      // A rest still running when the member forgot ends with the temporary time.
      const outcome = await this.closeEntry(entry, {
        at,
        from: 'OPEN',
        fields: { clockOutProvisional: true, clockOutBasis: basis, flagReasons: flags, approvalStatus: 'PENDING' },
        // The jobs stop at the same guess; the member's real clock-out moves them.
        pause: { reason: 'AUTO_CLOSE', sinceClockIn: false },
        announce: false,
        readBack: false,
        now,
      });
      if (!outcome) continue;
      closed++;

      this.notificationClient.emit('attendance_shift_closed_provisionally', {
        entryId: entry.id,
        userId: entry.userId,
        clockInAt: entry.clockInAt.toISOString(),
        clockOutAt: at.toISOString(),
        basis,
        timezone: entry.timezone ?? 'UTC',
        locationName: entry.location?.name ?? null,
        organizationId: entry.organizationId,
      });
    }
    if (closed) this.logger.log(`Closed ${closed} abandoned shift(s) with a temporary clock-out`);
    return success({ closed });
  }

  /**
   * End a shift because somebody DECIDED it ends — the legacy overtime flow's
   * "rejected" and "the approval window ran out" (overtime.service.ts).
   *
   * That product's rule is kept: the decision ends the shift, at the moment it
   * is made, as a system close (AUTO_OUT) the approvals queue reviews. What
   * changes is HOW: it used to write the status, the time and the gross minutes
   * and nothing else — no counted columns (so the unapproved overtime counted
   * through the gross-minus-rests fallback), a rest left running, excursions
   * left escalating, reminders still armed, jobs still in work and no event.
   * It goes through `closeEntry` like every other close now.
   *
   * The time recorded is the decision time — evidence of how long they were
   * there. What COUNTS still stops at the planned end (`computeCountedTime`'s
   * min with `expectedClockOutAt`), which a refused or lapsed request never
   * moved: unapproved overtime counts for nothing.
   *
   * Quiet when the shift is no longer open (closed meanwhile, or never this
   * organization's): there is nothing left to end.
   */
  async closeByDecision(input: {
    entryId: string;
    organizationId: string;
    /** What the entry's note says about why it ended. */
    note: string;
    reason: 'CLOCK_OUT' | 'OFFICE_CLOSE' | 'AUTO_CLOSE';
    at?: Date;
  }): Promise<boolean> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      // The two display labels the clock-out event carries ride in the same read.
      include: { ...CLOSE_ENTRY_INCLUDE, location: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
    });
    if (!entry) return false;
    const now = new Date();
    const at = input.at ?? now;
    const toleranceMin = await this.getShiftFlagTolerance(entry.shiftId);
    const flags = [
      ...new Set([...(entry.flagReasons ?? []), 'MISSED_CLOCK_OUT', ...clockOutTimeFlags(entry, at, toleranceMin)]),
    ];
    const closed = await this.closeEntry(entry, {
      at,
      from: 'OPEN',
      status: TimeEntryStatus.AUTO_OUT,
      toleranceMin,
      fields: {
        // Added to what is already written about the day, never replacing it.
        notes: [entry.notes, input.note].filter(Boolean).join(' · '),
        flagReasons: flags,
        approvalStatus: 'PENDING',
      },
      pause: { reason: input.reason, sinceClockIn: true },
      announce: true,
      readBack: false,
      now,
    });
    return !!closed;
  }

  /**
   * ⚠️ THE ONE WAY A SHIFT GETS CLOSED. Every closer — the clock-out, the
   * forgotten clock-out, the temporary close of an abandoned shift and a close
   * by decision — comes through here, so none of them can forget a step:
   *
   *  1. a rest still running ends at the close (never after now), and the rest
   *     totals are recomputed from the rows (`endRunningRests`);
   *  2. counted time is computed from those totals (`CountedTimeService`);
   *  3. ONE transaction: the claim — a conditional update that only an open
   *     (or temporarily closed) shift satisfies, so two closers racing cannot
   *     both win — carrying every column, then the rests ended and the open
   *     excursions EXPIRED (a shift that is over must not go on escalating);
   *  4. reminder state cleared (shift and rest reminders alike);
   *  5. after the commit, jobs in work paused and the clock-out announced.
   *
   * Returns null when the claim lost: somebody else closed it first.
   */
  private async closeEntry(entry: ClosableEntry, spec: CloseSpec & { readBack: true }): Promise<ClosedRow | null>;
  private async closeEntry(entry: ClosableEntry, spec: CloseSpec): Promise<ClosedRow | true | null>;
  private async closeEntry(entry: ClosableEntry, spec: CloseSpec): Promise<ClosedRow | true | null> {
    const now = spec.now ?? new Date();
    const at = spec.at;
    const status = spec.status ?? TimeEntryStatus.CLOCKED_OUT;
    const rests = endRunningRests(entry.breaks ?? [], at, now);
    const counted = await this.countedTime.columnsFor(
      { ...entry, breakMinutes: rests.breakMinutes, unpaidBreakMinutes: rests.unpaidBreakMinutes },
      at,
      spec.toleranceMin,
    );
    const excursionIds = (entry.geofenceExcursions ?? []).map((x) => x.id);

    const result = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.timeEntry.updateMany({
        where:
          spec.from === 'PROVISIONAL'
            ? { id: entry.id, status: TimeEntryStatus.CLOCKED_OUT, clockOutProvisional: true }
            : { id: entry.id, status: TimeEntryStatus.CLOCKED_IN },
        data: {
          status,
          clockOutAt: at,
          clockOutProvisional: false,
          clockOutBasis: null,
          totalMinutes: Math.round((at.getTime() - entry.clockInAt.getTime()) / 60_000),
          breakMinutes: rests.breakMinutes,
          unpaidBreakMinutes: rests.unpaidBreakMinutes,
          ...counted,
          // Close out any reminder lifecycle so a completed entry never lingers
          // in a reminder state and the sweeps' index keys are cleared.
          reminderState: 'RESOLVED',
          nextRemindAt: null,
          nextBreakRemindAt: null,
          ...spec.fields,
        },
      });
      if (claim.count === 0) return null;
      for (const r of rests.ends) {
        await tx.break.update({ where: { id: r.id }, data: { endedAt: r.endedAt, durationMinutes: r.minutes } });
      }
      if (excursionIds.length) {
        // The shift is over; an excursion must not go on escalating about it.
        await tx.geofenceExcursion.updateMany({
          where: { id: { in: excursionIds } },
          data: { status: 'EXPIRED', resolvedAt: now },
        });
      }
      return spec.readBack
        ? ((await tx.timeEntry.findUnique({ where: { id: entry.id }, include: CLOSED_ROW_INCLUDE })) as ClosedRow)
        : (true as const);
    });
    if (!result) return null;

    // Jobs left in work stop with the shift — at its minute, not when the phone found signal.
    await this.jobPause?.pauseAtClockOut({
      userId: entry.userId,
      organizationId: entry.organizationId,
      at,
      ...(spec.pause.sinceClockIn ? { since: entry.clockInAt } : {}),
      reason: spec.pause.reason,
      ...(spec.pause.handovers ? { handovers: spec.pause.handovers } : {}),
    });

    if (spec.announce) {
      // Real-time event for dashboard/team updates — names only (clock-event.ts).
      const row = result === true ? null : result;
      this.notificationClient.emit('attendance_clock_out', {
        userId: entry.userId,
        organizationId: entry.organizationId,
        timeEntry: clockEventEntry(
          { ...(entry as ClosableEntry & { status: string }), ...(row ?? {}), status, clockOutAt: at },
          'out',
        ),
      });
    }
    return result;
  }

  /**
   * The per-shift flag tolerance (minutes) for LATE/EARLY/OVERTIME, or the
   * default when the entry has no bound shift. Used at clock-out (clock-in gets
   * it straight from the resolver).
   */
  private getShiftFlagTolerance(shiftId?: string | null): Promise<number> {
    return this.countedTime.toleranceFor(shiftId ?? null);
  }

  /**
   * Send geofence violation alert to dispatchers and admins
   */
  private async sendGeofenceAlert(data: {
    userId: string;
    organizationId: string;
    locationName: string;
    distance: number;
    allowedRadius: number;
    action: 'clock_in' | 'clock_out';
  }) {
    try {
      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { firstName: true, lastName: true, email: true },
      });

      if (!user) return;

      // Route to the employee's watchers (per-employee override) or the admins +
      // managers of their space — not the whole org. See NotificationRoutingService.
      const { ids: dispatcherIds, emails: dispatcherEmails } =
        await this.notificationRouting.resolveWatchers(
          data.userId,
          data.organizationId,
          'attendance',
        );

      // Emit notification event
      this.notificationClient.emit('attendance_geofence_alert', {
        userId: data.userId,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        locationName: data.locationName,
        distance: data.distance,
        allowedRadius: data.allowedRadius,
        action: data.action,
        dispatcherEmails,
        dispatcherIds,
        organizationId: data.organizationId,
      });

      this.logger.warn(
        `Geofence alert sent: user=${user.firstName} ${user.lastName}, action=${data.action}, distance=${data.distance}m, allowed=${data.allowedRadius}m`,
      );
    } catch (error) {
      this.logger.error('Failed to send geofence alert', error);
    }
  }

  /**
   * Notify managers/admins that a time entry now needs approval (push + bell).
   * Fired when an entry transitions to approvalStatus = PENDING.
   */
  private async sendPendingApprovalAlert(data: {
    entryId: string;
    userId: string;
    organizationId: string;
    locationName: string;
    flagReasons: string[];
    totalMinutes: number;
  }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { firstName: true, lastName: true },
      });
      if (!user) return;

      const { ids: managerIds } = await this.notificationRouting.resolveWatchers(
        data.userId,
        data.organizationId,
        'attendance',
      );

      this.notificationClient.emit('attendance_pending_approval', {
        entryId: data.entryId,
        userId: data.userId,
        userName: `${user.firstName} ${user.lastName}`,
        locationName: data.locationName,
        flagReasons: data.flagReasons,
        totalMinutes: data.totalMinutes,
        managerIds,
        organizationId: data.organizationId,
      });

      this.logger.log(
        `Pending-approval alert sent: entry=${data.entryId}, user=${user.firstName} ${user.lastName}, flags=[${data.flagReasons.join(',')}]`,
      );
    } catch (error) {
      this.logger.error('Failed to send pending-approval alert', error);
    }
  }
}
