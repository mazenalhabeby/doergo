import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { notEndedWhere, isAbsence, toISODateString, PrismaService, SERVICE_NAMES, success } from '@hbcfield/shared';
import { assertNotSelfDecision } from '../attendance/core/self-decision';
import { ApproveTimeOffDto, CancelTimeOffDto } from './dto';
import { SPACE_BRIEF, requestFacts } from './technicians-helpers';
import { ApprovalRulesService } from '../approvals/rules/approval-rules.service';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { CoverService } from './cover.service';
import { workingDaysOf } from './member-requests';
import { emitEvent, timeOffDecidedEvent } from '@hbcfield/shared/microservices';

/** Deciding time off: approve or refuse, cancel, change, delete. Cover and working days as the member saw them. */
@Injectable()
export class TimeOffDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cover: CoverService,
    private readonly calendarRules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    @Optional() private readonly rules?: ApprovalRulesService, // office rules; absent only in narrow unit tests
  ) {}

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
    await assertNotSelfDecision(this.prisma as never, {
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

    // Office rules: past a threshold this approval is step 1 of 2 and the request stays pending.
    if (!approved) await this.rules?.clear(organizationId, 'request', timeOffId);
    if (approved && this.rules) {
      const days =
        workingDays ??
        (timeOff as { workingDays?: number | null }).workingDays ??
        Math.round((timeOff.endDate.getTime() - timeOff.startDate.getTime()) / 86_400_000) + 1;
      const spaceIds = (timeOff as { spaceId?: string | null }).spaceId
        ? [(timeOff as { spaceId: string }).spaceId]
        : timeOff.technician.spaceAssignments.map((a) => a.spaceId);
      // Cover is asked only when a rule cares — it is the wallchart's own verdict (CoverService).
      const coverShort =
        isAbsence(timeOff.kind) &&
        (await this.prisma.approvalRule.count({
          where: { organizationId, kind: 'request', isActive: true, whenCoverShort: true },
        })) > 0
          ? ['short', 'skill'].includes(
              (
                await this.cover.assessMany(organizationId, [
                  {
                    id: timeOff.id,
                    technicianId: timeOff.technicianId,
                    startDate: timeOff.startDate,
                    endDate: timeOff.endDate,
                  },
                ])
              ).get(timeOff.id)?.level ?? 'ok',
            )
          : false;
      const verdict = await this.rules.gate({
        organizationId,
        kind: 'request',
        itemId: timeOffId,
        facts: { spaceIds, days, coverShort },
        deciderId: approverId,
        subjectId: timeOff.technicianId,
      });
      if (!verdict.finalize) {
        return success(
          { ...timeOff, stage: 'FIRST_STEP', waitingFor: verdict.roleName },
          `Approved — waiting for ${verdict.roleName}`,
        );
      }
    }
    const updated = await this.prisma.timeOff.update({
      where: { id: timeOffId },
      data: {
        ...(workingDays !== undefined ? { workingDays } : {}),
        status: approved ? 'APPROVED' : 'REJECTED',
        approvedById: approverId,
        approvedAt: new Date(),
        rejectionReason: approved ? null : rejectionReason,
        ...(automatic ? { autoApproved: true } : {}),
      },
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
    });

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

    return success(updated);
  }

  /** Admin edit of an existing day off (dates / reason), scoped to the org. */
  async updateTimeOff(data: {
    organizationId: string;
    timeOffId: string;
    startDate?: string; // "YYYY-MM-DD"
    endDate?: string; // "YYYY-MM-DD" (inclusive)
    reason?: string | null;
  }) {
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { id: data.timeOffId, technician: { organizationId: data.organizationId } },
    });
    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }
    if (data.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) {
      throw new BadRequestException('Invalid date');
    }
    if (data.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
      throw new BadRequestException('Invalid date');
    }
    const start = data.startDate ? new Date(data.startDate) : timeOff.startDate;
    const end = data.endDate ? new Date(data.endDate) : timeOff.endDate;
    if (start > end) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    // Block overlap with the SAME employee's OTHER time off (exclude this one).
    const overlap = await this.prisma.timeOff.findFirst({
      where: {
        id: { not: data.timeOffId },
        technicianId: timeOff.technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        // Two answers to the same question: the same kind on the same day.
        kind: timeOff.kind,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('This overlaps an existing time-off entry for the employee');
    }

    const workingDays =
      (data.startDate || data.endDate) && isAbsence(timeOff.kind)
        ? await this.recountedWorkingDays(data.organizationId, timeOff.technicianId, start, end)
        : undefined;
    const updated = await this.prisma.timeOff.update({
      where: { id: data.timeOffId },
      data: {
        ...(workingDays !== undefined ? { workingDays } : {}),
        ...(data.startDate ? { startDate: start } : {}),
        ...(data.endDate ? { endDate: end } : {}),
        ...(data.reason !== undefined ? { reason: data.reason?.trim() || null } : {}),
      },
    });
    return success(updated, 'Day off updated');
  }

  /** Admin delete of a day off, scoped to the org. */
  async adminDeleteTimeOff(data: { organizationId: string; timeOffId: string }) {
    const timeOff = await this.prisma.timeOff.findFirst({
      where: { id: data.timeOffId, technician: { organizationId: data.organizationId } },
      select: { id: true },
    });
    if (!timeOff) {
      throw new NotFoundException('Time-off request not found');
    }
    await this.prisma.timeOff.delete({ where: { id: data.timeOffId } });
    return success({ id: data.timeOffId }, 'Day off removed');
  }
}
