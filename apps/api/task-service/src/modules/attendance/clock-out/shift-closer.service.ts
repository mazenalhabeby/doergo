import { closedHowOfBasis, endRunningRests, provisionalClockOut, type RestRow } from '../core/open-shift-close';
import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, personNameOf, personName, zoneOf, TimeEntryStatus, SERVICE_NAMES } from '@hbcfield/shared';
import { AUTO_REST_FLAG, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN as DEFAULT_TOLERANCE } from '@hbcfield/shared';
import { JobPauseService } from '../../tasks/handover/job-pause.service';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { handHoldAtClose } from '../core/hand-edit-review';
import { clockEventEntry } from '../core/clock-event';
import { CountedTimeService } from '../core/counted-time.service';
import { MISSED_REST_FLAG, flagsWithMissedRest, judgedByLabelRules, parseBreakPlan } from '@hbcfield/shared';
import { approvalFor } from '../core/attendance-occurrence';
import { AttendanceRoutingService } from '../core/attendance-routing.service';
import { memberSiteRules } from '../core/member-site-rules';
import { AutoClockService } from '../auto-clock/auto-clock.service';
import { ClosableEntry, CloseSpec, CLOSED_ROW_INCLUDE, ClosedRow, closingLabelColumns } from './clock-out-helpers';
import { emitEvent, attendanceClockOutEvent, attendancePendingApprovalEvent } from '@hbcfield/shared/microservices';
import { attendanceShiftClosedProvisionallyEvent } from '@hbcfield/shared/microservices';

/**
 * The ONE way a shift closes (closeEntry), the provisional close, the flag tolerance, and the pending-approval
 * alert — held once, used by every closer (the clock-out, a close by decision, the sweeps).
 */
@Injectable()
export class ShiftCloser {
  private readonly logger = new Logger(ShiftCloser.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly notificationRouting: NotificationRoutingService,
    private readonly countedTime: CountedTimeService,
    private readonly rules: ApprovalRulesService, // a running shift changed by hand (hand-edit-review)
    // Jobs left in work are paused at every way a shift ends (packages/shared/src/tasks/handover.ts).
    @Optional() private readonly jobPause?: JobPauseService,
    // The automatic clock (its re-check, rest, thresholds) — optional like the job pause: absent, nothing is automatic.
    @Optional() private readonly autoClock?: AutoClockService,
    @Optional() private readonly routing?: AttendanceRoutingService, // who hears "day needs review" (A3)
  ) {}

  /** One temporary close — the abandoned-shift sweep's, and the automatic clock's. False when somebody closed it first. */
  async closeProvisionally(
    entry: ClosableEntry & {
      expectedClockOutAt: Date | null;
      endIsDailyLimit?: boolean | null;
      timezone?: string | null;
      geofenceExcursions: { id: string; leftRingAt: Date }[];
      location?: { name: string; noShiftDailyMinutes?: number | null } | null;
    },
    now: Date,
    evidence: { lastSeenOnSiteAt?: Date | null } = {},
  ): Promise<boolean> {
    const { at, basis } = provisionalClockOut({
      clockInAt: entry.clockInAt,
      expectedClockOutAt: entry.endIsDailyLimit ? null : entry.expectedClockOutAt, // a marker is not an end (B5)
      leftSiteAt: entry.geofenceExcursions[0]?.leftRingAt ?? null,
      lastSeenOnSiteAt: evidence.lastSeenOnSiteAt ?? null,
      // The member's own hours a day there when set (clock review D1), else the workspace's.
      fallbackMinutes: entry.location
        ? (await memberSiteRules(this.prisma, entry.userId, entry.locationId, entry.location)).noShiftDailyMinutes
        : null,
      now,
    });

    const flags = [...new Set([...(entry.flagReasons ?? []), 'MISSED_CLOCK_OUT', 'CLOCK_OUT_PROVISIONAL'])];
    // A rest still running when the member forgot ends with the temporary time.
    const outcome = await this.closeEntry(entry, {
      at,
      from: 'OPEN',
      fields: { clockOutProvisional: true, clockOutBasis: basis, flagReasons: flags, approvalStatus: 'PENDING' },
      labels: { closedHow: closedHowOfBasis(basis) }, // the jobs stop at the same guess; the real clock-out moves them
      pause: { reason: 'AUTO_CLOSE', sinceClockIn: false },
      announce: false,
      readBack: false,
      now,
    });
    if (!outcome) return false;

    emitEvent(this.notificationClient, attendanceShiftClosedProvisionallyEvent, {
      entryId: entry.id,
      userId: entry.userId,
      clockInAt: entry.clockInAt.toISOString(),
      clockOutAt: at.toISOString(),
      basis,
      timezone: zoneOf(entry.timezone),
      locationName: entry.location?.name ?? null,
      organizationId: entry.organizationId,
    });
    return true;
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
  async closeEntry(entry: ClosableEntry, spec: CloseSpec & { readBack: true }): Promise<ClosedRow | null>;
  async closeEntry(entry: ClosableEntry, spec: CloseSpec): Promise<ClosedRow | true | null>;
  async closeEntry(entry: ClosableEntry, spec: CloseSpec): Promise<ClosedRow | true | null> {
    const now = spec.now ?? new Date();
    const at = spec.at;
    const status = spec.status ?? TimeEntryStatus.CLOCKED_OUT;
    /*
      The automatic rest (attendance/auto-clock.ts): an automatic member who took
      no rest and did not answer "Still working" gets the planned one, as a REST
      ROW like any other, BEFORE counted time is worked out — so it counts the
      same way everywhere a rest counts. Skipped → nothing here; the missed-rest
      rule below flags it as for anybody.
    */
    const autoRest =
      this.autoClock && entry.locationId
        ? await this.autoClock.autoRestAtClose({ ...entry, locationId: entry.locationId }, at)
        : null;
    const restRows: RestRow[] = autoRest
      ? [
          ...(entry.breaks ?? []),
          {
            id: '',
            startedAt: autoRest.startedAt,
            endedAt: autoRest.endedAt,
            durationMinutes: autoRest.minutes,
            isPaid: false,
          },
        ]
      : (entry.breaks ?? []);
    const rests = endRunningRests(restRows, at, now);
    const counted = await this.countedTime.columnsFor(
      { ...entry, breakMinutes: rests.breakMinutes, unpaidBreakMinutes: rests.unpaidBreakMinutes },
      at,
      spec.toleranceMin,
    );
    const excursionIds = (entry.geofenceExcursions ?? []).map((x) => x.id);
    // A required rest due and not taken — or too short, on a new entry (B7) — is MISSED at the close: flagged,
    // never deducted, the same for every closer (asking again is a no-op).
    const baseFlags = ((spec.fields.flagReasons as string[] | undefined) ?? entry.flagReasons ?? []) as string[];
    const taken = judgedByLabelRules(entry)
      ? { minutes: rests.breakMinutes, toleranceMin: spec.toleranceMin ?? DEFAULT_TOLERANCE }
      : undefined;
    let closeFlags = flagsWithMissedRest(baseFlags, parseBreakPlan(entry.breakPlan), at, taken);
    let flagsChanged = closeFlags.length !== baseFlags.length;
    let closeApproval: 'AUTO' | 'PENDING' = 'PENDING';
    if (autoRest || baseFlags.includes(AUTO_REST_FLAG)) {
      /*
        The rest WAS taken — automatically. It is not missed, and saying so is
        informational: the entry goes to review only for what else it carries
        (a close the caller forced to review stays there).
      */
      const forcedReview = spec.fields.approvalStatus === 'PENDING' && approvalFor(baseFlags) !== 'PENDING';
      closeFlags = [...new Set([...closeFlags.filter((f) => f !== MISSED_REST_FLAG), AUTO_REST_FLAG])];
      closeApproval = forcedReview ? 'PENDING' : approvalFor(closeFlags);
      flagsChanged = true;
    }

    // Changed by hand while running: its original end is known now (never a provisional guess); past a rule it waits.
    const closing = { ...entry, ...(spec.fields as object), clockOutProvisional: !!spec.fields.clockOutProvisional };
    const handHold = await handHoldAtClose(this.rules, closing, at, flagsChanged ? closeFlags : baseFlags);
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
          // Close out any reminder lifecycle: a completed entry never lingers in one; the sweeps' keys are cleared.
          reminderState: 'RESOLVED',
          nextRemindAt: null,
          nextBreakRemindAt: null,
          ...spec.fields,
          ...closingLabelColumns(entry, spec.labels),
          ...(flagsChanged ? { flagReasons: closeFlags, approvalStatus: closeApproval } : {}),
          ...handHold,
        },
      });
      if (claim.count === 0) return null;
      if (autoRest) {
        // Recognisable as the automatic one: no person added it, and the reason says what it is.
        await tx.break.create({
          data: {
            timeEntryId: entry.id,
            type: 'LUNCH',
            isPaid: false,
            startedAt: autoRest.startedAt,
            endedAt: autoRest.endedAt,
            durationMinutes: autoRest.minutes,
            reason: AUTO_REST_FLAG,
          },
        });
      }
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
      emitEvent(this.notificationClient, attendanceClockOutEvent, {
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
   * The per-shift flag tolerance (minutes) for LATE/EARLY/OVERTIME, or the default when the entry has no bound
   * shift. Used at clock-out (clock-in gets it straight from the resolver).
   */
  getShiftFlagTolerance(shiftId?: string | null): Promise<number> {
    return this.countedTime.toleranceFor(shiftId ?? null);
  }

  /** Notify managers/admins that a time entry now needs approval (push + bell) — when it becomes PENDING. */
  async sendPendingApprovalAlert(data: {
    entryId: string;
    userId: string;
    organizationId: string;
    locationId?: string | null;
    locationName: string;
    flagReasons: string[];
    totalMinutes: number;
  }) {
    try {
      const user = await personNameOf(this.prisma, data.userId);
      if (!user) return;

      const managerIds = this.routing
        ? await this.routing.reviewTargetsFor({
            locationId: data.locationId ?? null,
            organizationId: data.organizationId,
            userId: data.userId,
          })
        : (await this.notificationRouting.resolveWatchers(data.userId, data.organizationId, 'attendance')).ids;

      emitEvent(this.notificationClient, attendancePendingApprovalEvent, {
        entryId: data.entryId,
        userId: data.userId,
        userName: personName(user),
        locationName: data.locationName,
        flagReasons: data.flagReasons,
        totalMinutes: data.totalMinutes,
        managerIds,
        organizationId: data.organizationId,
      });

      this.logger.log(
        `Pending-approval alert sent: entry=${data.entryId}, user=${user.firstName} ` +
          `${user.lastName}, flags=[${data.flagReasons.join(',')}]`,
      );
    } catch (error) {
      this.logger.error('Failed to send pending-approval alert', error);
    }
  }
}
