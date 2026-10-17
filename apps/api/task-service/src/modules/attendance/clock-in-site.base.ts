import { Injectable } from '@nestjs/common';
import type { CompanyLocation, SpaceAssignment } from '@prisma/client';
import {
  zoneOf,
  success,
  TimeEntryStatus,
  siteEnforcesZone,
  parseGeofencePolygon,
  SHIFT_REMINDER_DEFAULTS,
  memberDayZone,
  APPROVED_REMOTE_FLAG,
  autoClockActive,
  clocksByPresence,
} from '@hbcfield/shared';
import { clockEventEntry } from './clock-event';
import { agreedOvertimeMinutes, type DayRequestRow } from './approved-requests';
import { approvalFor } from './attendance-occurrence';
import { noShiftRefusal } from './clock-in-helpers';
import { ClockInRemoteBase } from './clock-in-remote.base';
import {
  armAutoClockReminder,
  autoClockInFlag,
  scheduleFlagsAtClockIn,
  type ClockInInput,
  type ClockInOccurrence,
  type ClockInUser,
} from './clock-in-steps';

type ShiftStamp = Omit<Awaited<ReturnType<ClockInRemoteBase['buildShiftStamp']>>, 'scheduled' | 'flagToleranceMin'>;

/** Everything the on-site checks settled before the entry is shaped and written. */
export interface OnSiteClockIn {
  user: ClockInUser;
  location: CompanyLocation;
  assignment: SpaceAssignment;
  occurrence: ClockInOccurrence;
  dayRequests: DayRequestRow[];
  orgTz: string;
  withinGeofence: boolean;
  remoteApproved: boolean;
  zone: {
    lat: number | null;
    lng: number | null;
    geofenceRadius: number;
    geofencePolygon: ReturnType<typeof parseGeofencePolygon>;
  };
}

/** An on-site (or away-from-site) clock-in, once the member may clock in here: shape the entry and write it. */
@Injectable()
export abstract class ClockInSiteBase extends ClockInRemoteBase {
  protected async recordOnSite(data: ClockInInput & { locationId: string }, ctx: OnSiteClockIn) {
    const { user, location, assignment, occurrence, dayRequests, orgTz, withinGeofence, remoteApproved } = ctx;
    const clockInTime = occurrence.at;
    const flagReasons: string[] = [...occurrence.flags];

    /*
      Judged against today's boundary, which may not be the one that stood when
      the member tapped. Rather than keep a history of boundaries, say so: a
      person looks at an entry whose site moved while it was on its way.
    */
    if (occurrence.flags.includes('RECORDED_OFFLINE') && location.updatedAt > clockInTime) {
      flagReasons.push('BOUNDARY_CHANGED');
    }

    /*
      An away day is recorded as away, and reviewed.

      Not from suspicion: there is no geofence evidence behind it, and the honest
      handling of unverifiable evidence is that a person looks at it. It is one
      row in a queue that already exists — and it keeps its workspace, its shift
      and its rests, which is the entire point of admitting it here rather than
      filing it in a bucket of its own.
    */
    const clockedInAway = !withinGeofence;
    if (clockedInAway) {
      // Approved in advance: said on the entry, already decided — never sent to review for it.
      flagReasons.push(remoteApproved ? APPROVED_REMOTE_FLAG : 'OUTSIDE_GEOFENCE_IN');
    }

    // No-GPS fallback: a PHYSICAL space falls back to its own (site) timezone; a
    // LOGICAL space has none, so fall back to the org timezone. When GPS is
    // present the worker's actual location wins regardless.
    const spaceIsPhysical = location.lat != null && location.lng != null;
    const fallbackTz = spaceIsPhysical ? location.timezone : orgTz;
    const workerTz = this.resolveEntryTimezone(data.lat, data.lng, fallbackTz);

    // Resolve the shift ONCE (rota-aware + timezone-correct) and reuse it for both
    // the flags and the stamp — no separate legacy technicianSchedule query.
    // `scheduled` and `flagToleranceMin` are derived and are not columns;
    // `expectedClockInAt` IS one now and stays in `stampCols`.
    const { scheduled, flagToleranceMin, ...stampCols } = await this.buildShiftStamp(
      data.userId,
      location,
      clockInTime,
      workerTz ?? undefined,
    );

    let { endIsDailyLimit, shapingRequests } = scheduled
      ? { endIsDailyLimit: false, shapingRequests: dayRequests }
      : await this.applyNoShiftAllowance(data.userId, user, location, workerTz, clockInTime, {
          dayRequests,
          stampCols,
          flagReasons,
        });

    /*
      ── Approved changed hours / overtime ──
      They MOVE the expected start/end before anything is judged, so lateness, early departure,
      rests and counted time all follow the agreed day through the existing rules — and agreed
      overtime is counted exactly as an approved extra-time round is: the planned end moved.
    */
    const requestShaped = this.applyDayRequests(stampCols, shapingRequests, {
      spaceId: location.id,
      at: clockInTime,
      tz: location.timezone || workerTz || orgTz,
    });
    if (requestShaped.endMoved) endIsDailyLimit = false;
    // An agreed start on a day with no shift IS the plan for that day.
    const agreedPlan = !scheduled && requestShaped.startMoved;

    const autoSettings = autoClockActive({
      consentAt: user.autoClockConsentAt,
      settings: location.autoClock,
      assignmentAutoClock: assignment.autoClock,
      isExternal: user.isExternal,
      mode: assignment.autoClockMode,
      startWindow: assignment.autoClockStartWindow,
      noShiftDailyMinutes: location.noShiftDailyMinutes,
      noShiftPolicy: location.noShiftPolicy,
    });
    // No shift here today and clocked by arriving and leaving: the session's course is the workspace's hours.
    const byPresence = clocksByPresence(autoSettings, stampCols);
    flagReasons.push(
      ...scheduleFlagsAtClockIn({
        planned: scheduled || agreedPlan,
        workModel: location.workModel,
        byPresence,
        clockInAt: clockInTime,
        expectedClockInAt: stampCols.expectedClockInAt,
        toleranceMin: flagToleranceMin,
      }),
    );

    /*
      ── The automatic clock ──
      ON for this member here = the workspace switched it on ∧ they are chosen
      ∧ they consented (`autoClockActive`). Then the leader's reminder is armed
      and an AUTO step is marked only when it holds (see clock-in-steps).
    */
    armAutoClockReminder(stampCols, autoSettings, byPresence, clockInTime);
    flagReasons.push(
      ...autoClockInFlag({
        trigger: data.trigger,
        autoSettings,
        withinGeofence,
        byPresence,
        clockInAt: clockInTime,
        timezone: location.timezone || workerTz || orgTz,
        stamp: stampCols,
      }),
    );

    const approvalStatus = approvalFor(flagReasons);

    /*
      This shift's rests, resolved once and frozen onto the entry.

      Never blocks a clock-in: a space with no rules plans nothing, and a
      resolution that fails plans nothing either. Somebody must always be able to
      start work, whatever the rest engine thinks.
    */
    const restPlan = await this.breakRules.planForClockIn({
      spaceId: data.locationId,
      shiftId: stampCols.shiftId ?? null,
      clockInAt: clockInTime,
      expectedStartAt: stampCols.expectedClockInAt ?? null,
      expectedEndAt: stampCols.expectedClockOutAt ?? null,
      timezone: zoneOf(workerTz, location.timezone),
    });

    // Where they are working from the first moment: inside an area that exists, or decided from the evidence.
    const presenceCols = await this.presence.atClockIn({
      userId: data.userId,
      organizationId: data.organizationId,
      point: { lat: data.lat, lng: data.lng },
      insideArea: siteEnforcesZone(ctx.zone) && withinGeofence,
      at: clockInTime,
      timezone: workerTz ?? location.timezone ?? orgTz,
      recordedOffline: flagReasons.includes('RECORDED_OFFLINE'),
    });

    // Create time entry
    const entry = await this.createEntryOnce(data.id, data.userId, {
      ...(data.id ? { id: data.id } : {}),
      userId: data.userId,
      locationId: data.locationId,
      status: TimeEntryStatus.CLOCKED_IN,
      clockInAt: clockInTime,
      clockInLat: data.lat,
      clockInLng: data.lng,
      clockInAccuracy: data.accuracy,
      clockInWithinGeofence: withinGeofence,
      // Away, but for THIS workspace: the rota, the rests and the expected
      // hours all hang off it and stay attached.
      isRemote: clockedInAway,
      awayReason: clockedInAway ? data.awayReason?.trim().slice(0, 200) || null : null,
      clockInPlace: clockedInAway ? await this.geocoder.reverseGeocode(data.lat, data.lng) : null,
      timezone: workerTz,
      flagReasons,
      approvalStatus,
      organizationId: data.organizationId,
      ...stampCols,
      ...presenceCols,
      endIsDailyLimit,
      breakPlan: restPlan.breakPlan as never,
      nextBreakRemindAt: restPlan.nextBreakRemindAt,
    });

    this.logger.log(
      `Clock in successful: entry=${entry.id}, user=${data.userId}, location=${location.name}, ` +
        `withinGeofence=${withinGeofence}, flags=[${flagReasons.join(',')}], approval=${approvalStatus}`,
    );

    // Fulfill the matching expected shift so it isn't flagged as a no-show. Never
    // let a fulfillment hiccup block the clock-in itself.
    if (scheduled && stampCols.shiftId) {
      await this.shiftSweeps
        .markShiftInstancePresent(data.userId, data.locationId, stampCols.shiftId, entry.id, clockInTime, {
          organizationId: data.organizationId,
          recordedOffline: flagReasons.includes('RECORDED_OFFLINE'),
          timezone: zoneOf(workerTz, location.timezone),
        })
        .catch((e) => this.logger.warn(`markShiftInstancePresent failed for entry=${entry.id}: ${e}`));
    }

    // Emit real-time event for dashboard/team updates
    this.notificationClient.emit('attendance_clock_in', {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: clockEventEntry(entry, 'in'),
    });

    return success(entry, `Clocked in at ${location.name}`);
  }

  /*
    ── Clocking in with no shift ──
    The workspace decides: allow it, allow up to a number of hours a day, or
    only with a shift. A limit becomes the session's planned end, so counted
    time, reminders, overtime and the open-shift close all follow it.

    ⚠️ Recorded offline, it is KEPT, never refused: the member already worked
    it. With no hours left it counts nothing and says so, and time past the
    limit still needs an approval like any overtime.

    Writes the planned end / reminder into `stampCols` and PAST_DAILY_LIMIT into `flagReasons`.
  */
  private async applyNoShiftAllowance(
    userId: string,
    user: ClockInUser,
    location: CompanyLocation,
    workerTz: string | null,
    clockInTime: Date,
    io: { dayRequests: DayRequestRow[]; stampCols: ShiftStamp; flagReasons: string[] },
  ): Promise<{ endIsDailyLimit: boolean; shapingRequests: DayRequestRow[] }> {
    const { dayRequests, stampCols, flagReasons } = io;
    let endIsDailyLimit = false;
    // Overtime agreed in advance raises a no-shift day's limit INSIDE the allowance — so a member
    // already at the limit may clock in for it — and is then not added to the end a second time.
    let shapingRequests = dayRequests;
    const dayTz = memberDayZone(user.timezone, user.organization?.timezone, location.timezone || workerTz);
    const agreed = agreedOvertimeMinutes(dayRequests, location.id, clockInTime, dayTz);
    const allowance = await this.noShiftAllowanceFor(userId, location, clockInTime, dayTz, agreed);
    if (allowance.kind !== 'free' && agreed > 0) shapingRequests = dayRequests.filter((r) => r.kind !== 'OVERTIME');
    if (allowance.kind === 'refused' && !flagReasons.includes('RECORDED_OFFLINE')) {
      throw noShiftRefusal(allowance, location.name);
    }
    if (allowance.kind !== 'free') {
      const end = allowance.kind === 'limited' ? allowance.until : clockInTime;
      stampCols.expectedClockOutAt = end;
      stampCols.nextRemindAt = new Date(
        Math.max(end.getTime(), Date.now()) + SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES * 60_000,
      );
      endIsDailyLimit = true;
      if (allowance.kind === 'refused') flagReasons.push('PAST_DAILY_LIMIT');
    }
    return { endIsDailyLimit, shapingRequests };
  }
}
