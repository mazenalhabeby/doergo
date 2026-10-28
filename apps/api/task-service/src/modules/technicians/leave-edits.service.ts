import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isAbsence, PrismaService, success } from '@hbcfield/shared';
import { assertNotSelfDecision } from '../attendance/core/self-decision';
import { ApprovalRulesService } from '../approvals/rules/approval-rules.service';
import { alreadyDecided, CHANGED_MEANWHILE } from '../approvals/rules/conditional-write';
import { REQUEST_RULE_SELECT, requestFactsFor } from '../approvals/rules/request-rule-facts';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { CoverService } from './cover.service';
import { workingDaysOf } from './member-requests';
import { waitingReply } from '../approvals/rules/rule-gate-types';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The office changing or removing a day off already on the record. Changing the DATES is a new decision: the
 * approvals given for the old dates end, nobody changes their own, and approved leave that now falls under an
 * office rule goes back to waiting — the editor's change counts as its first approval (`rules.decide`).
 */
@Injectable()
export class LeaveEditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: ApprovalRulesService,
    private readonly cover: CoverService,
    private readonly calendarRules: CalendarRulesService,
  ) {}

  /** What a request's office-rule facts are read from (request-rule-facts.ts). */
  private get factDeps() {
    return { rules: this.rules, cover: this.cover, calendar: this.calendarRules, prisma: this.prisma };
  }

  /** Admin edit of an existing day off (dates / reason), scoped to the org. */
  async updateTimeOff(data: {
    editorId: string;
    organizationId: string;
    timeOffId: string;
    startDate?: string; // "YYYY-MM-DD"
    endDate?: string; // "YYYY-MM-DD" (inclusive)
    reason?: string | null;
  }) {
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { id: data.timeOffId, technician: { organizationId: data.organizationId } },
      select: { ...REQUEST_RULE_SELECT, status: true },
    });
    if (!timeOff) throw new NotFoundException('Time-off request not found');
    if ((data.startDate && !DAY_KEY.test(data.startDate)) || (data.endDate && !DAY_KEY.test(data.endDate)))
      throw new BadRequestException('Invalid date');
    const start = data.startDate ? new Date(data.startDate) : timeOff.startDate;
    const end = data.endDate ? new Date(data.endDate) : timeOff.endDate;
    if (start > end) throw new BadRequestException('Start date must be before or equal to end date');
    const datesChanged = start.getTime() !== timeOff.startDate.getTime() || end.getTime() !== timeOff.endDate.getTime();
    if (datesChanged)
      await assertNotSelfDecision(this.prisma, {
        deciderId: data.editorId,
        subjectId: timeOff.technicianId,
        organizationId: data.organizationId,
        message: 'You cannot change the dates of your own time off. Ask a manager or an administrator.',
      });

    // Block overlap with the SAME employee's OTHER time off of the same kind (exclude this one).
    const overlap = await this.prisma.timeOff.findFirst({
      where: {
        id: { not: data.timeOffId },
        technicianId: timeOff.technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        kind: timeOff.kind,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('This overlaps an existing time-off entry for the employee');

    const workingDays =
      datesChanged && isAbsence(timeOff.kind)
        ? await workingDaysOf(this.calendarRules, data.organizationId, timeOff.technicianId, start, end, true)
        : undefined;
    const fields = {
      ...(workingDays !== undefined ? { workingDays } : {}),
      ...(datesChanged ? { startDate: start, endDate: end } : {}),
      ...(data.reason !== undefined ? { reason: data.reason?.trim() || null } : {}),
    };
    // Conditional on the request as read (conditional-write.ts): cancelled, decided or re-dated meanwhile → 409, never
    // a request brought back to life.
    const asRead = {
      id: data.timeOffId,
      status: timeOff.status,
      startDate: timeOff.startDate,
      endDate: timeOff.endDate,
    };
    const changedMeanwhile = alreadyDecided(CHANGED_MEANWHILE, 'This day off changed a moment ago — look again.');
    const write = () => this.prisma.timeOff.update({ where: asRead, data: fields }).catch(changedMeanwhile);
    if (!datesChanged) return success(await write(), 'Day off updated');

    // Approvals given for the old dates end with them.
    await this.rules.clear(data.organizationId, 'request', data.timeOffId);
    if (timeOff.status !== 'APPROVED') return success(await write(), 'Day off updated');
    const row = { ...timeOff, startDate: start, endDate: end };
    const decided = await this.rules.decide(
      {
        organizationId: data.organizationId,
        kind: 'request',
        itemId: data.timeOffId,
        facts: await requestFactsFor(this.factDeps, data.organizationId, row, workingDays),
        deciderId: data.editorId,
        subjectId: timeOff.technicianId,
      },
      write,
    );
    if (decided.done) return success(decided.done, 'Day off updated');
    // Past an office rule: the new dates wait for the others.
    const waiting = await this.prisma.timeOff
      .update({ where: asRead, data: { ...fields, status: 'PENDING', approvedById: null, approvedAt: null } })
      .catch(async (e) => {
        await this.rules.clear(data.organizationId, 'request', data.timeOffId); // the step just opened goes too
        return changedMeanwhile(e);
      });
    return waitingReply(waiting, decided.waiting, 'Day off updated');
  }

  /** Admin delete of a day off, scoped to the org. Its half-way approvals end with it. */
  async adminDeleteTimeOff(data: { organizationId: string; timeOffId: string }) {
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { id: data.timeOffId, technician: { organizationId: data.organizationId } },
      select: { id: true },
    });
    if (!timeOff) throw new NotFoundException('Time-off request not found');
    await this.prisma.timeOff.delete({ where: { id: data.timeOffId } });
    await this.rules.clearItem('request', data.timeOffId);
    return success({ id: data.timeOffId }, 'Day off removed');
  }
}
