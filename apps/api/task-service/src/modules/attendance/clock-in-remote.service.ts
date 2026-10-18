import { Injectable, BadRequestException } from '@nestjs/common';
import { success, TimeEntryStatus, ATTENDANCE_FLAG_REASONS } from '@hbcfield/shared';
import { clockEventEntry } from './clock-event';
import { remoteApprovedAt, type DayRequestRow } from './approved-requests';
import { alreadyClockedIn, approvalFor } from './attendance-occurrence';
import { ClockInBase } from './clock-in.base';
import type { ClockInInput, ClockInOccurrence } from './clock-in-steps';
import { emitEvent, attendanceClockInEvent } from '@hbcfield/shared/microservices';

/** A clock-in away from any workspace: the approved remote day, and the org's Remote bucket. */
@Injectable()
export abstract class ClockInRemoteBase extends ClockInBase {
  /*
    ⚠️ An approved REMOTE day at one of their workspaces: the member pressed "Clock in remotely"
    (or an old phone sent `isRemote`), and the approver already said yes to exactly that. It is
    clocked in AWAY at that workspace — keeping its rota, rests and expected hours — never refused
    as REMOTE_NOT_FOR_ASSIGNED and never filed in the bucket.

    Rewrites `data.locationId` / `data.isRemote` when it applies.
  */
  protected async moveApprovedRemoteToWorkspace(
    data: ClockInInput,
    dayRequests: DayRequestRow[],
    occurrence: ClockInOccurrence,
    orgTz: string,
  ): Promise<void> {
    if (!(data.isRemote && dayRequests.some((r) => r.kind === 'REMOTE' && r.spaceId))) return;
    const { locations: workspaces } = await this.clockableWorkspaces(data.userId, data.organizationId, occurrence.at);
    const approvedHere = workspaces.find((w) =>
      remoteApprovedAt(dayRequests, w.id, occurrence.at, w.timezone || orgTz),
    );
    if (approvedHere) {
      data.locationId = approvedHere.id;
      data.isRemote = false;
    }
  }

  // ---- Remote clock-in (WFH/anywhere): geofence-exempt, coarse place captured ----
  protected async clockInRemote(
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
      throw new BadRequestException(
        'You are not permitted to clock in remotely. Ask your administrator to enable remote clock-in for your account.',
      );
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
    const { locations: workspaces } = await this.clockableWorkspaces(data.userId, data.organizationId, occurrence.at);
    /*
      ⚠️ Recorded OFFLINE, it is kept — never refused. The phone chose from the
      list it had saved; when that list was out of date, refusing at sync would
      throw away a day somebody actually worked, which no offline rule does (the
      daily limit flags instead of refusing, for the same reason). It arrives
      flagged REMOTE_WITH_WORKSPACE, so a person decides. Online, the member
      sees the refusal while still able to clock in at the workspace.
    */
    const remoteDespiteWorkspace = workspaces.length > 0 && occurrence.flags.includes('RECORDED_OFFLINE');
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
    const bucket = await this.getOrCreateRemoteBucket(data.organizationId);
    const place = await this.geocoder.reverseGeocode(data.lat, data.lng);
    const remoteClockInAt = occurrence.at;
    // Remote clock-in: the bucket is a logical (pin-less) space, so anchor the
    // shift to the worker's own timezone.
    // Strip only what is genuinely derived — `expectedClockInAt` is a column.
    const {
      scheduled: _s,
      flagToleranceMin: _ft,
      ...remoteStamp
    } = await this.buildShiftStamp(
      data.userId,
      bucket,
      remoteClockInAt,
      this.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? undefined,
    );
    // Changed hours / agreed overtime not tied to a workspace apply here too.
    this.applyDayRequests(remoteStamp, dayRequests, {
      spaceId: null,
      at: remoteClockInAt,
      tz: this.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
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
      timezone: this.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
    });

    const remoteFlags = [
      ...occurrence.flags,
      ...(remoteDespiteWorkspace ? [ATTENDANCE_FLAG_REASONS.REMOTE_WITH_WORKSPACE] : []),
    ];
    const remotePresence = await this.presence.atClockIn({
      userId: data.userId,
      organizationId: data.organizationId,
      point: { lat: data.lat, lng: data.lng },
      insideArea: false,
      at: remoteClockInAt,
      timezone: this.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
      recordedOffline: remoteFlags.includes('RECORDED_OFFLINE'),
    });
    const entry = await this.createEntryOnce(data.id, data.userId, {
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
      timezone: this.resolveEntryTimezone(data.lat, data.lng, orgTz),
      flagReasons: remoteFlags,
      approvalStatus: approvalFor(remoteFlags),
      organizationId: data.organizationId,
      ...remoteStamp,
      ...remotePresence,
      breakPlan: remoteRests.breakPlan as never,
      nextBreakRemindAt: remoteRests.nextBreakRemindAt,
    });
    this.logger.log(`Remote clock in: entry=${entry.id}, user=${data.userId}, place=${place ?? 'unknown'}`);
    emitEvent(this.notificationClient, attendanceClockInEvent, {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: clockEventEntry(entry, 'in'),
    });
    return success(entry, place ? `Clocked in remotely · ${place}` : 'Clocked in remotely');
  }
}
