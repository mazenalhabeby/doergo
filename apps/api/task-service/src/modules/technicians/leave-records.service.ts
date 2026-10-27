import { ApprovalRulesService } from '../approvals/rules/approval-rules.service';
import { assertNotSelfDecision } from '../attendance/core/self-decision';
import { REQUEST_RULE_SELECT, requestFactsFor } from '../approvals/rules/request-rule-facts';
import {
  assertMemberInScope,
  toISODateString,
  personEmploymentFacts,
  personPasses,
  ABSENCE_WHERE,
} from '@hbcfield/shared';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService, success } from '@hbcfield/shared';
import { LeaveLedgerService, leaveYearFor } from './leave-ledger.service';
import { GetOrgTimeOffDto, GetTimeOffDto } from './dto';
import { SPACE_BRIEF } from './technicians-helpers';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { CoverService } from './cover.service';
import { workingDaysOf } from './member-requests';
import { orgTimeOff } from './org-leave-list';
import type { Prisma } from '@prisma/client';

/** Leave as a record: entered by the office, listed, counted in working days, the balance. */
@Injectable()
export class LeaveRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    // The org-wide list carries a cover verdict per pending request (org-leave-list.ts).
    private readonly cover: CoverService,
    // What a range of leave COSTS — weekends, rota rest days and holidays left out (shared calendar/days.ts).
    private readonly calendarRules: CalendarRulesService,
    // The ONE vacation balance (allowance + adjustments − taken, in the leave year).
    private readonly leaveLedger: LeaveLedgerService,
    // Office rules: leave the office records follows the same rules as leave a member asks for.
    private readonly rules: ApprovalRulesService,
  ) {}

  /** Time off across the organization — or across the spaces a member leads (org-leave-list.ts). */
  getOrgTimeOff(dto: GetOrgTimeOffDto & { scopeSpaceIds?: string[]; withCover?: boolean }) {
    return orgTimeOff(this.prisma, this.cover, dto);
  }

  /**
   * Admin: add an already-APPROVED day off for an employee. Unlike
   * requestTimeOff (employee self-service), this allows any date (incl. past,
   * for corrections/backfill) and needs no separate approval step.
   */
  async addTimeOff(data: {
    editorId: string;
    organizationId: string;
    technicianId: string;
    startDate: string; // "YYYY-MM-DD"
    endDate: string; // "YYYY-MM-DD" (inclusive)
    reason?: string;
  }) {
    const technician = await personPasses(this.prisma, data.technicianId, { organizationId: data.organizationId });
    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }
    // Recording leave approves it: nobody records their own (an administrator excepted — self-decision.ts).
    await assertNotSelfDecision(this.prisma, {
      deciderId: data.editorId,
      subjectId: data.technicianId,
      organizationId: data.organizationId,
      message: 'You cannot record your own time off. Ask a manager or an administrator.',
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
      throw new BadRequestException('Invalid date');
    }
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (start > end) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    /*
      Block overlapping the same employee's existing time off.

      Two entries covering one day are two answers to "was this person off", and
      everything downstream — absence, payroll, the roster — would pick one of
      them arbitrarily.

      The refusal NAMES the entry it collided with. "This overlaps an existing
      entry" tells somebody they are wrong and then makes them go and find out
      how; the dates and the status are what they need to decide whether to move
      their range, edit the other one, or stop.
    */
    const overlap = await this.prisma.timeOff.findFirst({
      where: {
        technicianId: data.technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        // The office records LEAVE here; it collides with leave only.
        ...ABSENCE_WHERE,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
      orderBy: { startDate: 'asc' },
    });
    if (overlap) {
      /*
        Thrown with an object payload, not a string.

        `code` and `params` let the client render this in the reader's own
        language — the dialog around it is translated and this sentence was not,
        which is how a German screen answers in English. `message` stays as the
        fallback for any client that does not know the code, so nothing regresses
        while translations are added.
      */
      throw new BadRequestException({
        code: 'TIMEOFF_OVERLAP',
        params: {
          from: toISODateString(overlap.startDate),
          to: toISODateString(overlap.endDate),
          status: overlap.status,
        },
        message:
          `This overlaps time off already recorded for this employee ` +
          `(${toISODateString(overlap.startDate)} to ${toISODateString(overlap.endDate)}, ${overlap.status.toLowerCase()}).`,
      });
    }

    // The office recording a day off is never refused — it records what the range costs.
    const workingDays = await workingDaysOf(
      this.calendarRules,
      data.organizationId,
      data.technicianId,
      start,
      end,
      true,
    );
    // Recorded waiting; the office's own entry is the first approval — an office rule may ask more people.
    const created = await this.prisma.timeOff.create({
      data: {
        technicianId: data.technicianId,
        startDate: start,
        endDate: end,
        reason: data.reason?.trim() || null,
        workingDays,
        status: 'PENDING',
      },
      select: REQUEST_RULE_SELECT,
    });
    const decided = await this.rules.decide(
      {
        organizationId: data.organizationId,
        kind: 'request',
        itemId: created.id,
        facts: await requestFactsFor(this.rules, this.cover, data.organizationId, created, workingDays, this.prisma),
        deciderId: data.editorId,
        subjectId: data.technicianId,
      },
      () =>
        this.prisma.timeOff.update({
          where: { id: created.id },
          data: { status: 'APPROVED', approvedById: data.editorId, approvedAt: new Date() },
        }),
    );
    if (decided.waiting)
      return success(
        { id: created.id, ...decided.waiting },
        `Day off added — waiting for ${decided.waiting.waitingFor}`,
      );
    return success(decided.done, 'Day off added');
  }

  /**
   * Get time-off requests for a technician
   */
  async getTimeOff(dto: GetTimeOffDto) {
    const { technicianId, organizationId, status } = dto;

    // Verify technician belongs to organization
    const technician = await personPasses(this.prisma, technicianId, { organizationId });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    const where: Prisma.TimeOffWhereInput = { technicianId };
    if (status) {
      where.status = status;
    }

    const timeOffs = await this.prisma.timeOff.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
    });

    // Shape unchanged on purpose: mobile reads `data` as an array. The balance
    // is its own call (getLeaveBalance) rather than a new key here.
    return success(timeOffs);
  }

  /** What a range WOULD cost — the request form shows it before anything is sent. */
  async countLeave(dto: {
    organizationId: string;
    technicianId: string;
    from: string;
    to: string;
    callerId?: string;
    scopeSpaceIds?: string[];
  }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.from) || !/^\d{4}-\d{2}-\d{2}$/.test(dto.to) || dto.from > dto.to) {
      throw new BadRequestException('Choose a start day on or before the end day');
    }
    // A year at most — a longer range would be counted short, not refused, further down.
    if ((Date.parse(dto.to) - Date.parse(dto.from)) / 86400000 > 366)
      throw new BadRequestException('Count at most a year at a time');
    const exists = await personEmploymentFacts(this.prisma, dto.technicianId, dto.organizationId);
    if (!exists) throw new NotFoundException('Employee not found in organization');
    /*
      Somebody else's count shows their rota and days off: only for whoever manages that person —
      the rota permission held in a workspace reaches the people OF that workspace, not the org.
    */
    if (dto.callerId !== dto.technicianId) {
      await assertMemberInScope(this.prisma, {
        userId: dto.technicianId,
        organizationId: dto.organizationId,
        scopeSpaceIds: dto.scopeSpaceIds,
      });
    }
    const c = await this.calendarRules.countLeaveFor(dto.organizationId, dto.technicianId, dto.from, dto.to);
    // The same days split by LEAVE year (calendar or work year — leave ledger): a request over
    // the turn of a leave year draws on each, and the preview keys it on the balance's year.
    const byLeaveYear: Record<string, number> = {};
    for (const d of c.days) {
      if (!d.cost) continue;
      const start = leaveYearFor(exists.organization ?? { leaveYearMode: 'CALENDAR' }, exists, d.day).start;
      byLeaveYear[start] = (byLeaveYear[start] ?? 0) + d.cost;
    }
    return success({
      from: dto.from,
      to: dto.to,
      calendarDays: c.calendarDays,
      counted: c.counted,
      restDays: c.restDays,
      holidays: c.holidays,
      byYear: c.byYear,
      byLeaveYear,
      days: c.days.map((d) => ({ day: d.day, kind: d.kind, cost: d.cost, holiday: d.holiday ?? null })),
    });
  }

  /**
   * The vacation balance — computed in ONE place, the leave ledger (leave-ledger.service.ts):
   * allowance + the leave year's adjustments − approved vacation in the leave year.
   */
  async getLeaveBalance(dto: { technicianId: string; organizationId: string; on?: string; year?: number | string }) {
    return success(await this.leaveLedger.getBalance(dto));
  }
}
