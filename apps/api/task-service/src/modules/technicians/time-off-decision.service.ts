import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { DayHoursReshapeService } from '../attendance/shifts/day-hours-reshape.service';
import { ClientProxy } from '@nestjs/microservices';
import { notEndedWhere, isAbsence, toISODateString, PrismaService, SERVICE_NAMES, success } from '@hbcfield/shared';
import { assertNotSelfDecision } from '../attendance/core/self-decision';
import { ApproveTimeOffDto, CancelTimeOffDto } from './dto';
import { SPACE_BRIEF, requestFacts } from './technicians-helpers';
import { ApprovalRulesService } from '../approvals/rules/approval-rules.service';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { CoverService } from './cover.service';
import { requestFactsFor, type RequestRuleRow } from '../approvals/rules/request-rule-facts';
import { workingDaysOf } from './member-requests';
import { emitEvent, timeOffDecidedEvent } from '@hbcfield/shared/microservices';
import { missedWrite } from '../approvals/rules/conditional-write';
import { waitingReply } from '../approvals/rules/rule-gate-types';

/** Deciding time off: approve or refuse, cancel, change, delete. Cover and working days as the member saw them. */
@Injectable()
export class TimeOffDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cover: CoverService,
    private readonly calendarRules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly rules: ApprovalRulesService,
    @Optional() private readonly reshape?: DayHoursReshapeService,
  ) {}

  /** What a request's office-rule facts are read from (request-rule-facts.ts). */
  private get factDeps() {
    return { rules: this.rules, cover: this.cover, calendar: this.calendarRules, prisma: this.prisma };
  }

  private recountedWorkingDays(organizationId: string, userId: string, start: Date, end: Date) {
    return workingDaysOf(this.calendarRules, organizationId, userId, start, end, true);
  }

  /** `automatic`: the only administrator's own request (approvals/own-request.ts) — never reachable from a request body. */
  async approveTimeOff(dto: ApproveTimeOffDto & { scopeSpaceIds?: string[] }, automatic = false) {
    const { timeOffId, organizationId, approverId, approved, rejectionReason, scopeSpaceIds } = dto;

    // Find the time-off request. The roster comes with it, so the scope check
    // below costs no second query.
    const timeOff = await this.prisma.timeOff.findUnique({
      where: { id: timeOffId },
      include: {
        technician: {
          select: {
            organizationId: true,
            spaceAssignments: {
              where: { ...notEndedWhere() },
              select: { spaceId: true },
            },
          },
        },
      },
    });

    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }

    // Verify the time-off belongs to the organization
    if (timeOff.technician.organizationId !== organizationId) {
      throw new ForbiddenException('You can only approve time-off requests in your organization');
    }

    /*
      And that this approver has a claim on THIS person.

      The list is narrowed to their crew, but the route takes a request id
      directly — so without this a member who leads one site could approve leave
      for anybody in the company by id. Undefined means org-wide; an empty array
      means nowhere, and refuses.
    */
    if (scopeSpaceIds !== undefined) {
      const theirSpaces = timeOff.technician.spaceAssignments.map((a) => a.spaceId);
      if (!theirSpaces.some((id) => scopeSpaceIds.includes(id))) {
        throw new ForbiddenException('That member does not work in a workspace you manage');
      }
    }

    // Verify the request is pending
    if (timeOff.status !== 'PENDING') {
      throw new BadRequestException('Time-off request has already been processed');
    }

    // Nobody decides their own leave, either way — the overtime rule
    // (attendance/core/self-decision.ts). Withdrawing your own request is
    // `cancelTimeOff`, not a decision.
    await assertNotSelfDecision(this.prisma, {
      deciderId: approverId,
      subjectId: timeOff.technicianId,
      organizationId,
      message: 'You cannot decide your own time off. Ask a manager or an administrator.',
    });

    // Recounted at the decision: a holiday confirmed since the request moves the number once, here.
    const workingDays =
      approved && isAbsence(timeOff.kind)
        ? await this.recountedWorkingDays(organizationId, timeOff.technicianId, timeOff.startDate, timeOff.endDate)
        : undefined;

    // Office rules: past a threshold this approval may be one of several and the request stays pending.
    if (!approved) await this.rules.clear(organizationId, 'request', timeOffId);
    // Conditional on still waiting: a refusal landing at the same moment is never overwritten (conditional-write.ts).
    const write = () =>
      this.prisma.timeOff
        .update({
          // …and only the dates, hours and minutes the approvers saw: moved ones are a new decision (leave-edits, day-hours).
          where: {
            id: timeOffId,
            status: 'PENDING',
            startDate: timeOff.startDate,
            endDate: timeOff.endDate,
            startTime: timeOff.startTime,
            endTime: timeOff.endTime,
            minutes: timeOff.minutes,
          },
          data: {
            ...(workingDays !== undefined ? { workingDays } : {}),
            status: approved ? 'APPROVED' : 'REJECTED',
            approvedById: approverId,
            approvedAt: new Date(),
            rejectionReason: approved ? null : rejectionReason,
            ...(automatic ? { autoApproved: true } : {}),
          },
          include: {
            technician: { select: { id: true, firstName: true, lastName: true } },
            approvedBy: { select: { id: true, firstName: true, lastName: true } },
            space: { select: SPACE_BRIEF },
          },
        })
        .catch(
          missedWrite(
            async () => (await this.prisma.timeOff.count({ where: { id: timeOffId, status: 'PENDING' } })) > 0,
            'TIME_OFF_DECIDED',
            'This request was decided a moment ago.',
          ),
        );
    let updated: Awaited<ReturnType<typeof write>>;
    if (approved) {
      // The one reader of a request's facts, shared with the sweep and the rules page; cover only when a rule asks.
      const row: RequestRuleRow = timeOff;
      const decided = await this.rules.decide(
        {
          organizationId,
          kind: 'request',
          itemId: timeOffId,
          facts: await requestFactsFor(this.factDeps, organizationId, row, workingDays),
          deciderId: approverId,
          subjectId: timeOff.technicianId,
        },
        write,
      );
      if (decided.waiting) return waitingReply(timeOff, decided.waiting);
      updated = decided.done;
      // Changed hours for a day already clocked re-shape it, now that they are approved (day-hours' own rule).
      await this.reshape?.reshapeApprovedHours(updated, approverId, organizationId);
    } else {
      updated = await write();
    }

    /*
      And tell the person whose leave it is.

      The other half of the loop, and the half that was missing entirely: a
      member submitted a request and then had to keep opening the app to find
      out whether they had the days. This one is addressed, not routed — the
      answer belongs to the person who asked, and to nobody else.
    */
    // Approved automatically: the owner sees it on screen; no push about their own.
    if (!automatic)
      emitEvent(this.notificationClient, timeOffDecidedEvent, {
        timeOffId: updated.id,
        organizationId,
        memberId: updated.technicianId,
        ...requestFacts(updated),
        approved,
        rejectionReason: approved ? null : (rejectionReason ?? null),
        startDate: toISODateString(updated.startDate),
        endDate: toISODateString(updated.endDate),
      });

    return success(updated);
  }

  /**
   * Cancel a time-off request (by the technician)
   */
  async cancelTimeOff(dto: CancelTimeOffDto) {
    const { timeOffId, technicianId } = dto;

    const timeOff = await this.prisma.timeOff.findUnique({
      where: { id: timeOffId },
    });

    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }

    // Verify the request belongs to the technician
    if (timeOff.technicianId !== technicianId) {
      throw new ForbiddenException('You can only cancel your own time-off requests');
    }

    // Cancelled already: the same answer again. A phone that sent this without
    // signal may send it twice, and the second must not read as a refusal.
    if (timeOff.status === 'CANCELED') return success(timeOff);

    // Can only cancel pending requests
    if (timeOff.status !== 'PENDING') {
      throw new BadRequestException({
        message: 'This request was already decided, so it can no longer be cancelled',
        code: 'TIME_OFF_DECIDED',
      });
    }

    const updated = await this.prisma.timeOff.update({
      where: { id: timeOffId },
      data: { status: 'CANCELED' },
    });
    // Withdrawn: an office rule's approvals half-way through end with it.
    await this.rules.clearItem('request', timeOffId);

    return success(updated);
  }
}
