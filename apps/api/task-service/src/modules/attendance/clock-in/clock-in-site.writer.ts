import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { CompanyLocation, SpaceAssignment } from '@prisma/client';
import {
  zoneOf,
  success,
  TimeEntryStatus,
  siteEnforcesZone,
  parseGeofencePolygon,
  APPROVED_REMOTE_FLAG,
  autoClockActive,
  clocksByPresence,
  SERVICE_NAMES,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
} from '@hbcfield/shared';
import { clockEventEntry } from '../core/clock-event';
import { clockInLabels, priorEntryOfShift } from '../core/clock-in-labels';
import { isJoinableFragment, joinFragment } from '../core/clock-in-join';
import type { DayRequestRow } from '../core/approved-requests';
import { approvalFor } from '../core/attendance-occurrence';
import { applyNoShiftAllowance } from './clock-in-no-shift';
import { ClockInContextService } from './clock-in-context.service';
import { BreakRulesService } from '../core/break-rules.service';
import { PresenceService } from '../presence/presence.service';
import { AttendanceGeocoderService } from '../core/attendance-geocoder.service';
import { ShiftSweepService } from '../no-shows/shift-sweep.service';
import {
  armAutoClockReminder,
  autoClockInFlag,
  scheduleFlagsAtClockIn,
  type ClockInInput,
  type ClockInOccurrence,
  type ClockInUser,
} from './clock-in-steps';
import { emitEvent, attendanceClockInEvent } from '@hbcfield/shared/microservices';

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
export class ClockInSiteWriter {
  // Named after the clock-in, whose log lines these always were.
  private readonly logger = new Logger('ClockInService');

  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly context: ClockInContextService,
    private readonly breakRules: BreakRulesService,
    private readonly presence: PresenceService,
    private readonly geocoder: AttendanceGeocoderService,
    private readonly shiftSweeps: ShiftSweepService,
  ) {}

  async recordOnSite(data: ClockInInput & { locationId: string }, ctx: OnSiteClockIn) {
    const { user, location, assignment, occurrence, dayRequests, orgTz, withinGeofence, remoteApproved } = ctx;
    const clockInTime = occurrence.at;
    const flagReasons: string[] = [...occurrence.flags];

    /*
      Judged against today's boundary, which may not be the one that stood when
      the member tapped. Rather than keep a history of boundaries, say so: a
      person looks at an entry whose site moved while it was on its way.
    */
    // Label rules: only a move of the site itself counts — not a rename (`boundaryChangedAt`).
    if (occurrence.flags.includes('RECORDED_OFFLINE') && (location.boundaryChangedAt ?? 0) > clockInTime) {
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
    const workerTz = this.context.resolveEntryTimezone(data.lat, data.lng, fallbackTz);

    // Resolve the shift ONCE (rota-aware + timezone-correct) and reuse it for both
    // the flags and the stamp — no separate legacy technicianSchedule query.
    // `scheduled` and `flagToleranceMin` are derived and are not columns;
    // `expectedClockInAt` IS one now and stays in `stampCols`.
    const { scheduled, flagToleranceMin, shiftName, ...stampCols } = await this.context.buildShiftStamp(
      data.userId,
      location,
      clockInTime,
      workerTz ?? undefined,
    );

    let { endIsDailyLimit, shapingRequests } = scheduled
      ? { endIsDailyLimit: false, shapingRequests: dayRequests }
      : await applyNoShiftAllowance(this.context, data.userId, user, location, workerTz, clockInTime, {
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
    const requestShaped = this.context.applyDayRequests(stampCols, shapingRequests, {
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
    const planned = scheduled || agreedPlan;
    /*
      Label rules (docs/plans/clock-attendance-2026-10.md): only the first entry of a shift can be
      late; coming back after a planned rest is judged as the rest. Unscheduled days keep their rule.
    */
    const prior = planned
      ? await priorEntryOfShift(this.context.prisma, {
          userId: data.userId,
          locationId: data.locationId,
          expectedClockInAt: stampCols.expectedClockInAt,
          before: clockInTime,
        })
      : null;
    const labels = clockInLabels({
      planned,
      clockInAt: clockInTime,
      stamp: stampCols,
      shiftName: shiftName ?? null,
      toleranceMin: flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
      endIsDailyLimit,
      prior,
      fix: { lat: data.lat, lng: data.lng, accuracy: data.accuracy },
      zone: ctx.zone,
    });
    flagReasons.push(
      ...(planned
        ? labels.flags
        : scheduleFlagsAtClockIn({
            planned,
            workModel: location.workModel,
            byPresence,
            clockInAt: clockInTime,
            expectedClockInAt: stampCols.expectedClockInAt,
            toleranceMin: flagToleranceMin,
          })),
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

    // One entry per shift: right after an automatic fragment of this shift, join it (clock-in-join.ts).
    const joined = isJoinableFragment(prior, clockInTime)
      ? await joinFragment(this.context.prisma, prior, { clockInId: data.id, nextRemindAt: stampCols.nextRemindAt, now: new Date() })
      : null;
    const entry = joined ?? await this.context.createEntryOnce(data.id, data.userId, {
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
      ...labels.columns,
      labelFacts: labels.columns.labelFacts as never,
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
    emitEvent(this.notificationClient, attendanceClockInEvent, {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: clockEventEntry(entry, 'in'),
    });

    return success(entry, `Clocked in at ${location.name}`);
  }
}
