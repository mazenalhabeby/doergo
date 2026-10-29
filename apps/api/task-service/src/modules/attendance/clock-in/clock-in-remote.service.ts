import { Injectable, BadRequestException, Inject, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  success,
  TimeEntryStatus,
  ATTENDANCE_FLAG_REASONS,
  SERVICE_NAMES,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { clockEventEntry } from '../core/clock-event';
import { clockInLabels, priorEntryOfShift } from '../core/clock-in-labels';
import { remoteApprovedAt, type DayRequestRow } from '../core/approved-requests';
import { alreadyClockedIn, approvalFor } from '../core/attendance-occurrence';
import { ClockInContextService } from './clock-in-context.service';
import { BreakRulesService } from '../core/break-rules.service';
import { PresenceService } from '../presence/presence.service';
import { AttendanceGeocoderService } from '../core/attendance-geocoder.service';
import { fixOf, gpsAccuracyRefusal, type ClockInInput, type ClockInOccurrence } from './clock-in-steps';
import { ShiftSweepService } from '../no-shows/shift-sweep.service';
import { emitEvent, attendanceClockInEvent } from '@hbcfield/shared/microservices';

/** A clock-in away from any workspace: the approved remote day, and the org's Remote bucket. */
@Injectable()
export class ClockInRemoteService {
  // Named after the clock-in, whose log lines these always were.
  private readonly logger = new Logger('ClockInService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly context: ClockInContextService,
    private readonly breakRules: BreakRulesService,
    private readonly presence: PresenceService,
    private readonly geocoder: AttendanceGeocoderService,
    // A rota day worked away is a day PRESENT, not a no-show (clock review B10). Optional for narrow tests.
    @Optional() private readonly shiftSweeps?: ShiftSweepService,
  ) {}

  /*
    ⚠️ An approved REMOTE day at one of their workspaces: the member pressed "Clock in remotely"
    (or an old phone sent `isRemote`), and the approver already said yes to exactly that. It is
    clocked in AWAY at that workspace — keeping its rota, rests and expected hours — never refused
    as REMOTE_NOT_FOR_ASSIGNED and never filed in the bucket.

    Rewrites `data.locationId` / `data.isRemote` when it applies.
  */
  async moveApprovedRemoteToWorkspace(
    data: ClockInInput,
    dayRequests: DayRequestRow[],
    occurrence: ClockInOccurrence,
    orgTz: string,
  ): Promise<void> {
    if (!(data.isRemote && dayRequests.some((r) => r.kind === 'REMOTE' && r.spaceId))) return;
    const { locations: workspaces } = await this.context.clockableWorkspaces(
      data.userId,
      data.organizationId,
      occurrence.at,
    );
    const approvedHere = workspaces.find((w) =>
      remoteApprovedAt(dayRequests, w.id, occurrence.at, w.timezone || orgTz),
    );
    if (approvedHere) {
      data.locationId = approvedHere.id;
      data.isRemote = false;
    }
  }

  // ---- Remote clock-in (WFH/anywhere): geofence-exempt, coarse place captured ----
  async clockInRemote(
    data: ClockInInput,
    ctx: {
      mayClockInRemotely: boolean;
      occurrence: ClockInOccurrence;
      dayRequests: DayRequestRow[];
      orgTz: string;
    },
  ) {
    const { occurrence, dayRequests, orgTz } = ctx;
    if (!ctx.mayClockInRemotely) {
      throw new BadRequestException({
        code: 'REMOTE_NOT_ALLOWED',
        message: 'You are not permitted to clock in remotely. Ask your administrator to allow it for your account.',
      });
    }
    /*
      ⚠️ THE BUCKET IS ONLY FOR SOMEBODY WITH NO WORKSPACE — admins included.

      A member who has workspaces clocks in AT one of them: on site, or away
      when that workspace's ceiling and their grant allow it. Accepting
      `isRemote` from them walked around a STRICT site, and the entry it made
      carried no flags (so it was approved on arrival), never matched their
      rota (so they were chased as a no-show) and was never re-matched.

      The same answer as the list the phone and web choose from, asked of the
      moment of the tap: they only send `isRemote` when that list is empty.
    */
    const { locations: workspaces } = await this.context.clockableWorkspaces(
      data.userId,
      data.organizationId,
      occurrence.at,
    );
    /*
      ⚠️ Recorded OFFLINE, it is kept — never refused. Genuinely offline: more than 10 minutes before it
      arrived (`occurrence.lenient`) — a request that merely took 3 minutes could have been refused live. The phone chose from the
      list it had saved; when that list was out of date, refusing at sync would
      throw away a day somebody actually worked, which no offline rule does (the
      daily limit flags instead of refusing, for the same reason). It arrives
      flagged REMOTE_WITH_WORKSPACE, so a person decides. Online, the member
      sees the refusal while still able to clock in at the workspace.
    */
    const remoteDespiteWorkspace = workspaces.length > 0 && occurrence.lenient;
    if (workspaces.length > 0 && !remoteDespiteWorkspace) {
      throw new BadRequestException({
        message: 'You are assigned to a workspace, so clock in there — away from the site if your workspace allows it.',
        code: 'REMOTE_NOT_FOR_ASSIGNED',
        params: { workspaces: workspaces.length },
      });
    }
    const already = await this.prisma.timeEntry.findFirst({
      where: { userId: data.userId, status: TimeEntryStatus.CLOCKED_IN },
      include: { location: true },
    });
    if (already) throw alreadyClockedIn(already, occurrence.fromEvidence);
    // The same accuracy as on site (B10): a position this coarse says nothing about where the day was worked.
    const coarse = gpsAccuracyRefusal(data.accuracy, !!fixOf(data));
    if (coarse) throw coarse;
    const bucket = await this.context.getOrCreateRemoteBucket(data.organizationId);
    const fix = fixOf(data);
    const place = fix ? await this.geocoder.reverseGeocode(fix.lat, fix.lng) : null;
    const remoteClockInAt = occurrence.at;
    // Remote clock-in: the bucket is a logical (pin-less) space, so anchor the
    // shift to the worker's own timezone.
    // Strip only what is genuinely derived — `expectedClockInAt` is a column.
    const {
      scheduled: remoteScheduled,
      flagToleranceMin: remoteTolerance,
      shiftName: remoteShiftName,
      ...remoteStamp
    } = await this.context.buildShiftStamp(
      data.userId,
      bucket,
      remoteClockInAt,
      this.context.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? undefined,
    );
    // Changed hours / agreed overtime not tied to a workspace apply here too.
    this.context.applyDayRequests(remoteStamp, dayRequests, {
      spaceId: null,
      at: remoteClockInAt,
      tz: this.context.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
    });
    /*
      Rests apply to a day worked from home or a car exactly as they do to one
      worked on site — the obligation is about hours worked, not about where.
      Omitting this here was an oversight when planned rests were added: the
      on-site path got a plan and the remote path silently got none, so the one
      population most likely to work straight through was the one nobody
      reminded.
    */
    const remoteRests = await this.breakRules.planForClockIn({
      spaceId: bucket.id,
      shiftId: remoteStamp.shiftId ?? null,
      clockInAt: remoteClockInAt,
      expectedStartAt: remoteStamp.expectedClockInAt ?? null,
      expectedEndAt: remoteStamp.expectedClockOutAt ?? null,
      timezone: this.context.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
    });

    /*
      Label rules: a remote clock-in on a day with a shift is judged like any other (it used to be
      never late). The bucket has no site, so the position is recorded as not judged.
    */
    const remoteLabels = clockInLabels({
      planned: remoteScheduled,
      clockInAt: remoteClockInAt,
      stamp: remoteStamp,
      shiftName: remoteShiftName ?? null,
      toleranceMin: remoteTolerance ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
      endIsDailyLimit: false,
      prior: remoteScheduled
        ? await priorEntryOfShift(this.prisma, {
            userId: data.userId,
            locationId: bucket.id,
            expectedClockInAt: remoteStamp.expectedClockInAt,
            before: remoteClockInAt,
          })
        : null,
      fix,
      zone: { lat: null, lng: null, geofenceRadius: 0 },
    });
    const remoteFlags = [
      ...occurrence.flags,
      ...(remoteDespiteWorkspace ? [ATTENDANCE_FLAG_REASONS.REMOTE_WITH_WORKSPACE] : []),
      ...remoteLabels.flags,
    ];
    const remotePresence = await this.presence.atClockIn({
      userId: data.userId,
      organizationId: data.organizationId,
      point: fix,
      insideArea: false,
      at: remoteClockInAt,
      timezone: this.context.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
      recordedOffline: remoteFlags.includes('RECORDED_OFFLINE'),
    });
    const entry = await this.context.createEntryOnce(data.id, data.userId, {
      ...(data.id ? { id: data.id } : {}),
      userId: data.userId,
      locationId: bucket.id,
      status: TimeEntryStatus.CLOCKED_IN,
      clockInAt: remoteClockInAt,
      clockInLat: data.lat,
      clockInLng: data.lng,
      clockInAccuracy: data.accuracy,
      clockInWithinGeofence: true,
      isRemote: true,
      clockInPlace: place,
      timezone: this.context.resolveEntryTimezone(data.lat, data.lng, orgTz),
      flagReasons: remoteFlags,
      approvalStatus: approvalFor(remoteFlags),
      organizationId: data.organizationId,
      ...remoteStamp,
      ...remotePresence,
      ...remoteLabels.columns,
      labelFacts: remoteLabels.columns.labelFacts as never,
      breakPlan: remoteRests.breakPlan as never,
      nextBreakRemindAt: remoteRests.nextBreakRemindAt,
    });
    this.logger.log(`Remote clock in: entry=${entry.id}, user=${data.userId}, place=${place ?? 'unknown'}`);
    if (remoteScheduled && remoteStamp.shiftId)
      await this.markRotaDayPresent(data, remoteStamp.shiftId, entry.id, remoteClockInAt);
    emitEvent(this.notificationClient, attendanceClockInEvent, {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: clockEventEntry(entry, 'in'),
    });
    return success(entry, place ? `Clocked in remotely · ${place}` : 'Clocked in remotely');
  }

  /** The rota shift this away day fulfils, marked present at ITS workspace — never chased as a no-show (B10). */
  private async markRotaDayPresent(data: ClockInInput, shiftId: string, entryId: string, at: Date) {
    if (!this.shiftSweeps) return;
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId }, select: { spaceId: true } });
    if (!shift?.spaceId) return;
    await this.shiftSweeps
      .markShiftInstancePresent(data.userId, shift.spaceId, shiftId, entryId, at)
      .catch((e) => this.logger.warn(`markShiftInstancePresent (away day) failed for entry=${entryId}: ${e}`));
  }
}
