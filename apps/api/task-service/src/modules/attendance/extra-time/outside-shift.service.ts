// size-exempt: one outside-shift decision read top to bottom — the office rules, the claim, the write, put back
import type { TimeEntry } from '@prisma/client';
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PrismaService,
  SERVICE_NAMES,
  TimeEntryStatus,
  localPartsIn,
  outsideShift,
  peopleNamesSorted,
  personName,
  planAfterCounting,
  scopeWhere,
  success,
  zoneOf,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  type AttendanceScope,
} from '@hbcfield/shared';
import { emitEvent, attendanceChangedEvent, attendanceOvertimeDecisionEvent } from '@hbcfield/shared/microservices';
import { CountedTimeService } from '../core/counted-time.service';
import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { AttendanceRoutingService } from '../core/attendance-routing.service';
import { askAboutOwnRequest } from '../../approvals/own-request-route';
import { ExtraTimeApprovalService } from './extra-time-approval.service';
import { ExtraTimeDecisionService } from './extra-time-decision.service';
import { approvedOvertimeByEntry, overtimeGateInput } from './overtime-gate';
import { ruleStepItemId } from '@hbcfield/shared';
import { waitingReply } from '../../approvals/rules/rule-gate-types';

/** How far back an undecided outside time is still asked about — older belongs to closed payroll. */
const LOOKBACK_DAYS = 31;
const LIST_MAX = 300;

/*
  The rows the inbox asks about: closed, on a shift's plan (never a daily limit), undecided,
  not rejected, and not already an extra-time / overtime question of their own. Never a TEMPORARY
  close: its clock-out is a guess, and a decision about it would be about time nobody knows was worked
  (the real clock-out asks again — `reaskOutsideAtRealClose`).
*/
const pendingWhere = (since: Date) => ({
  status: TimeEntryStatus.CLOCKED_OUT,
  clockOutProvisional: false,
  outsideDecidedAt: null,
  expectedClockInAt: { not: null },
  expectedClockOutAt: { not: null },
  endIsDailyLimit: false,
  approvalStatus: { not: 'REJECTED' as const },
  clockOutAt: { gte: since },
  reminderState: { not: 'OVERTIME_PENDING' as const },
  overtimeRequests: { none: { status: 'PENDING_APPROVAL' as const } },
});

/**
 * TIME OUTSIDE THE SHIFT — one decision per entry (docs/plans/time-counting-model.md, phase 3;
 * rule: shared attendance/outside-shift.ts).
 *
 * ⚠️ Counting reuses the paths that already exist, so every record reads the same: the time after
 * the end through `addOvertimeToClosedEntry` (an APPROVED overtime round, the Overtime page's record,
 * the member told), the time before the start by moving the planned start — then the ONE counted-time
 * rule recounts. Not counting writes nothing but the decision. Either way it is decided ONCE
 * (`outsideDecidedAt`), so the inbox stops asking.
 */
/** A leader's decision about one entry's time outside the shift. */
type OutsideDecision = {
  approverId: string;
  organizationId: string;
  entryId: string;
  minutes: number;
  reason?: string | null;
  scopeSpaceIds?: AttendanceScope;
};

@Injectable()
export class OutsideShiftService {
  private readonly logger = new Logger(OutsideShiftService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly countedTime: CountedTimeService,
    private readonly approval: ExtraTimeApprovalService,
    private readonly decisions: ExtraTimeDecisionService,
    private readonly routing: AttendanceRoutingService,
    private readonly rules: ApprovalRulesService,
  ) {}

  /** The tolerance of every shift in a batch, in ONE query. */
  private async tolerances(shiftIds: (string | null)[]): Promise<Map<string, number>> {
    const ids = [...new Set(shiftIds.filter((s): s is string => !!s))];
    if (!ids.length) return new Map();
    const shifts = await this.prisma.shift.findMany({
      where: { id: { in: ids } },
      select: { id: true, flagToleranceMin: true },
    });
    return new Map(shifts.map((s) => [s.id, s.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN]));
  }

  /** For the inbox: undecided time outside the shift in the caller's workspaces — never their own. */
  async listPending(data: { userId: string; organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const rows = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: data.organizationId,
        userId: { not: data.userId },
        ...scopeWhere(data.scopeSpaceIds),
        ...pendingWhere(since),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        location: { select: { id: true, name: true, timezone: true } },
      },
      orderBy: { clockOutAt: 'desc' },
      take: LIST_MAX,
    });
    const tol = await this.tolerances(rows.map((r) => r.shiftId));
    const out = rows
      .map((r) => ({ ...r, outside: outsideShift(r, tol.get(r.shiftId ?? '') ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN) }))
      .filter((r) => r.outside);
    return success(out, `${out.length} entr(ies) with time outside the shift`);
  }

  /**
   * The items office rules read (the "nobody answers" sweep and the rules page): waiting since before a moment, or
   * every one decided or raised since a day — keyed `<entry>:outside`, the step the decision itself uses.
   */
  async ruleItems(
    organizationId: string,
    window: { waitingBefore?: Date; since?: Date; spaceIds?: string[] },
    max: number,
  ) {
    const rows = await this.prisma.timeEntry.findMany({
      where: window.since
        ? {
            organizationId,
            ...(window.spaceIds ? { locationId: { in: window.spaceIds } } : {}),
            clockOutAt: { gte: window.since },
            OR: [{ outsideCountedMinutes: { gt: 0 } }, pendingWhere(window.since)],
          }
        : {
            organizationId,
            ...(window.spaceIds ? { locationId: { in: window.spaceIds } } : {}),
            ...pendingWhere(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)),
            clockOutAt: { lte: window.waitingBefore },
          },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { clockOutAt: 'desc' },
      take: max,
    });
    const tol = await this.tolerances(rows.map((r) => r.shiftId));
    // Undecided: judged as the gate will judge it — with the overtime already approved on the shift.
    const approved = await approvedOvertimeByEntry(
      this.prisma,
      rows.filter((r) => r.outsideCountedMinutes == null).map((r) => r.id),
    );
    return rows.flatMap((r) => {
      const o = outsideShift(r, tol.get(r.shiftId ?? '') ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN);
      const counted = r.outsideCountedMinutes ?? o?.total ?? 0;
      return counted > 0
        ? [
            {
              itemId: ruleStepItemId('outside', r.id),
              since: r.clockOutAt ?? r.clockInAt,
              subjectId: r.userId,
              user: r.user,
              spaceId: r.locationId,
              // The rule's facts are the reader's to build (overtimeRuleFacts) — the same as the approve path.
              counted,
              approvedBefore: approved.get(r.id) ?? 0,
            },
          ]
        : [];
    });
  }

  /** The member's own undecided time outside the shift, and whom it waits for. */
  async listMine(data: { userId: string; organizationId: string }) {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const rows = await this.prisma.timeEntry.findMany({
      where: { organizationId: data.organizationId, userId: data.userId, ...pendingWhere(since) },
      select: {
        id: true,
        shiftId: true,
        locationId: true,
        clockInAt: true,
        clockOutAt: true,
        expectedClockInAt: true,
        expectedClockOutAt: true,
        endIsDailyLimit: true,
        timezone: true,
        location: { select: { name: true, timezone: true } },
      },
      orderBy: { clockOutAt: 'desc' },
      take: 20,
    });
    const tol = await this.tolerances(rows.map((r) => r.shiftId));
    const items = rows
      .map((r) => ({ r, o: outsideShift(r, tol.get(r.shiftId ?? '') ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN) }))
      .filter((x) => x.o);
    if (!items.length) return success([]);
    // Whom it waits for: who may DECIDE it (A10), through the own-request rule — never a mere watcher.
    const first = items[0]!.r;
    const ask = await askAboutOwnRequest(this.prisma, {
      organizationId: data.organizationId,
      subjectId: data.userId,
      kind: 'extraTime',
      spaceIds: first.locationId ? [first.locationId] : [],
      usual: await this.routing.notifyTargetsFor(
        { locationId: first.locationId, organizationId: data.organizationId, userId: data.userId },
        'outside',
      ),
    });
    const people = ask.ids.length ? await peopleNamesSorted(this.prisma, ask.ids.slice(0, 3)) : [];
    const askedOf = { names: people.map((p) => personName(p)), more: Math.max(0, ask.ids.length - people.length) };
    return success(
      items.map(({ r, o }) => ({
        entryId: r.id,
        date: localPartsIn(r.clockInAt, zoneOf(r.location?.timezone, r.timezone)).dateStr,
        place: r.location?.name ?? null,
        before: o!.before,
        after: o!.after,
        total: o!.total,
        askedOf,
      })),
    );
  }

  /** Count `minutes` of it (all, part — 0 = don't count). Decided once. */
  async decide(data: OutsideDecision) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
    });
    // Another organization's, outside the caller's workspaces, or missing: the same 404.
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.outsideDecidedAt) {
      throw new ConflictException({ code: 'OUTSIDE_ALREADY_DECIDED', message: 'This time was already decided.' });
    }
    const outside = outsideShift(entry, await this.countedTime.toleranceFor(entry.shiftId));
    // A temporary close's clock-out is a guess: nothing to decide until the real one (pendingWhere).
    if (entry.status !== TimeEntryStatus.CLOCKED_OUT || entry.clockOutProvisional || !outside) {
      throw new ConflictException({
        code: 'OUTSIDE_NOTHING',
        message: 'There is no time outside the shift to decide.',
      });
    }
    const allowed = await this.approval.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.approval.assertNotSelfOvertimeDecision(data.approverId, entry.userId, data.organizationId);

    let plan = planAfterCounting(entry, outside, Number.isFinite(data.minutes) ? data.minutes : 0);
    // Its OWN step (never the extra-time one on the same entry: approving one must not finish or cancel the other).
    const stepId = ruleStepItemId('outside', entry.id);
    if (plan.counted === 0) {
      // Not counted: a step half-way under an office rule is dropped, like every refusal.
      await this.rules.clear(data.organizationId, 'overtime', stepId);
      await this.write(entry, plan, data);
    } else {
      // Counting time is overtime — past a threshold it waits for the others, and nothing is written yet.
      const decided = await this.rules.decide(
        overtimeGateInput(entry, plan.counted, await this.approval.approvedOvertimeMinutes(entry.id), data, stepId),
        async (agreed) => {
          // Never more than any approver agreed to.
          if (agreed != null && agreed < plan.counted) plan = planAfterCounting(entry, outside, agreed);
          await this.write(entry, plan, data);
        },
      );
      if (decided.waiting) return waitingReply({ entryId: entry.id }, decided.waiting);
    }
    const after = plan.expectedClockOutAt.getTime() - entry.expectedClockOutAt!.getTime();

    // The member hears every outcome (A9); time counted after the end was told by the overtime path.
    if (after <= 0) {
      emitEvent(this.notificationClient, attendanceOvertimeDecisionEvent, {
        entryId: entry.id,
        userId: entry.userId,
        decision: plan.counted > 0 ? 'approved' : 'rejected',
        ...(plan.counted > 0 ? { minutes: plan.counted } : {}),
        organizationId: data.organizationId,
      });
    }

    const note = plan.counted
      ? `Time outside the shift: ${plan.counted} of ${outside.total} min counted.`
      : `Time outside the shift (${outside.total} min) not counted.`;
    try {
      await this.prisma.activityLog.create({
        data: {
          eventType: 'TIME_ENTRY_EDITED',
          userId: data.approverId,
          resourceType: 'timeEntry',
          resourceId: entry.id,
          organizationId: entry.organizationId,
          metadata: {
            reason: data.reason ? `${note} ${data.reason}` : note,
            changes: [{ field: 'outsideCountedMinutes', from: null, to: String(plan.counted) }],
          },
        },
      });
    } catch (err) {
      this.logger.warn(`Outside-shift history write failed for entry=${entry.id}: ${err}`);
    }
    emitEvent(this.notificationClient, attendanceChangedEvent, {
      organizationId: data.organizationId,
      action: 'outside_decided',
      entryId: entry.id,
      userId: entry.userId,
      spaceId: entry.locationId,
    });
    return success({ entryId: entry.id, counted: plan.counted, of: outside.total }, note);
  }

  /** Claim the decision, move the plan, recount — or put the claim back if any of it fails. */
  private async write(entry: TimeEntry, plan: ReturnType<typeof planAfterCounting>, data: OutsideDecision) {
    const before = entry.expectedClockInAt!.getTime() - plan.expectedClockInAt.getTime();
    const after = plan.expectedClockOutAt.getTime() - entry.expectedClockOutAt!.getTime();
    // Claimed first: two leaders deciding at once cannot both count it. The part before the start is kept: it is
    // overtime an office rule counts (the part after the end becomes a round, counted as one).
    const claimed = await this.prisma.timeEntry.updateMany({
      where: { id: entry.id, outsideDecidedAt: null },
      data: {
        outsideDecidedAt: new Date(),
        outsideDecidedById: data.approverId,
        outsideCountedMinutes: plan.counted,
        outsideBeforeMinutes: Math.max(0, Math.round(before / 60_000)),
      },
    });
    if (!claimed.count)
      throw new ConflictException({ code: 'OUTSIDE_ALREADY_DECIDED', message: 'This time was already decided.' });

    try {
      if (before > 0) {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { expectedClockInAt: plan.expectedClockInAt },
        });
        await this.countedTime.recomputeClosed({ ...entry, expectedClockInAt: plan.expectedClockInAt });
      }
      if (after > 0) {
        // The overtime path: a round on the record, the end moved, recounted, relabelled, the member told.
        await this.decisions.recordDecidedOvertime({
          approverId: data.approverId,
          entryId: entry.id,
          minutes: Math.round(after / 60_000),
          reason: data.reason ?? null,
          organizationId: data.organizationId,
          scopeSpaceIds: data.scopeSpaceIds,
        });
      }
    } catch (err) {
      // Claimed, then not written (B1): put the claim back so it is asked again — never vanish uncounted.
      await this.prisma.timeEntry.updateMany({
        where: { id: entry.id, outsideDecidedById: data.approverId },
        data: {
          outsideDecidedAt: null,
          outsideDecidedById: null,
          outsideCountedMinutes: null,
          outsideBeforeMinutes: null,
          expectedClockInAt: entry.expectedClockInAt,
        },
      });
      if (before > 0) await this.countedTime.recomputeClosed(entry);
      throw err;
    }
  }
}
