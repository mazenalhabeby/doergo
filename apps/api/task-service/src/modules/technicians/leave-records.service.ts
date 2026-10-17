import { notEndedWhere, ABSENCE_WHERE, isAbsence, assertMemberInScope, toISODateString } from '@hbcfield/shared';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { success } from '@hbcfield/shared';
import { leaveYearFor } from './leave-ledger.service';
import { GetTimeOffDto, GetOrgTimeOffDto } from './dto';
import { SPACE_BRIEF } from './technicians-helpers';
import { MemberServiceBase } from './member-service.base';

/** Leave as a record: entered by the office, listed, counted in working days, the balance. */
@Injectable()
export class LeaveRecordsService extends MemberServiceBase {
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
    const technician = await this.prisma.user.findFirst({
      where: { id: data.technicianId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }
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
    const workingDays = await this.workingDaysOf(data.organizationId, data.technicianId, start, end, true);
    const timeOff = await this.prisma.timeOff.create({
      data: {
        technicianId: data.technicianId,
        startDate: start,
        endDate: end,
        reason: data.reason?.trim() || null,
        workingDays,
        status: 'APPROVED',
        approvedById: data.editorId,
        approvedAt: new Date(),
      },
    });

    return success(timeOff, 'Day off added');
  }

  /**
   * Get time-off requests for a technician
   */
  async getTimeOff(dto: GetTimeOffDto) {
    const { technicianId, organizationId, status } = dto;

    // Verify technician belongs to organization
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, organizationId },
    });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    const where: any = { technicianId };
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
  async countLeave(dto: { organizationId: string; technicianId: string; from: string; to: string; callerId?: string; scopeSpaceIds?: string[] }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.from) || !/^\d{4}-\d{2}-\d{2}$/.test(dto.to) || dto.from > dto.to) {
      throw new BadRequestException('Choose a start day on or before the end day');
    }
    // A year at most — a longer range would be counted short, not refused, further down.
    if ((Date.parse(dto.to) - Date.parse(dto.from)) / 86400000 > 366) throw new BadRequestException('Count at most a year at a time');
    const exists = await this.prisma.user.findFirst({
      where: { id: dto.technicianId, organizationId: dto.organizationId },
      select: { id: true, employmentStartDate: true, organization: { select: { leaveYearMode: true } } },
    });
    if (!exists) throw new NotFoundException('Employee not found in organization');
    /*
      Somebody else's count shows their rota and days off: only for whoever manages that person —
      the rota permission held in a workspace reaches the people OF that workspace, not the org.
    */
    if (dto.callerId !== dto.technicianId) {
      await assertMemberInScope(this.prisma as any, { userId: dto.technicianId, organizationId: dto.organizationId, scopeSpaceIds: dto.scopeSpaceIds });
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
      from: dto.from, to: dto.to,
      calendarDays: c.calendarDays, counted: c.counted, restDays: c.restDays,
      holidays: c.holidays, byYear: c.byYear, byLeaveYear,
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

  /**
   * Get all time-off requests for an organization
   */
  /**
   * Time off across the organization — or across the spaces a member leads.
   *
   * Leave belongs to a PERSON, not to a site, which is why `TimeOff` has no
   * space column and why this looked unscopeable. But a supervisor's claim was
   * never over the leave: it is over the PEOPLE. So the query narrows through
   * the roster — the crew of the spaces they hold — and needs no schema change
   * to do it.
   *
   * `scopeSpaceIds` follows the three-state convention used everywhere else:
   * undefined means org-wide, and an EMPTY array means granted nowhere and must
   * match nothing. Collapsing those two is how a scoped read becomes an org-wide
   * one by accident.
   */
  async getOrgTimeOff(dto: GetOrgTimeOffDto & { scopeSpaceIds?: string[]; withCover?: boolean }) {
    const { organizationId, status, scopeSpaceIds } = dto;
    // Decided at the gateway, which is where the caller's permissions are known.
    // Default false: a payload that leaks by omission is the wrong default.
    const withCover = dto.withCover === true;

    const where: any = {
      technician: { organizationId },
    };
    if (status) {
      where.status = status;
    }
    if (scopeSpaceIds !== undefined) {
      if (scopeSpaceIds.length === 0) return success([]);
      // One relation filter, served by the space-assignment index — not a
      // roster fetched first and used as an `in` list.
      where.technician = {
        organizationId,
        spaceAssignments: {
          some: {
            spaceId: { in: scopeSpaceIds },
            ...notEndedWhere(),
          },
        },
      };
    }

    /*
      A window, when the screen names one: what touches the dates on screen, plus
      everything still waiting for a decision (it is decided wherever it falls).
      Without it this read is the organization's whole leave history, bounded only
      by the 500 below — slow as history grows, and past 500 rows the leave ON
      screen could be the part cut off.
    */
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (dto.from && dto.to && day.test(dto.from) && day.test(dto.to) && dto.from <= dto.to) {
      where.AND = [{
        OR: [
          { status: 'PENDING' },
          { startDate: { lte: new Date(`${dto.to}T23:59:59.999Z`) }, endDate: { gte: new Date(`${dto.from}T00:00:00.000Z`) } },
        ],
      }];
    }

    const timeOffs = await this.prisma.timeOff.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: {
        technician: {
          select: { id: true, firstName: true, lastName: true, email: true, specialty: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        space: { select: SPACE_BRIEF },
      },
      // Bound the payload — the approvals view shows recent/pending, not all-time
      // history (P6). Newest 500 by the order above.
      take: 500,
    });

    /*
      The cover verdict travels WITH the request.

      This is the whole point of the redesign: deciding leave used to mean
      reading this list, then opening the calendar on another tab to work out
      who would be left — and the calendar could not answer, because it only
      ever drew APPROVED leave and so never showed the effect of the decision
      being made. Four extra queries for the whole page, computed once here
      rather than once per row in a browser that would need the entire roster to
      do it at all.

      Only what is still open is assessed. A verdict on a request decided last
      March is arithmetic nobody reads, and it would double the window this has
      to fetch leave for.
    */
    // Only pending LEAVE thins cover — a remote day or changed hours is a day worked.
    const open = withCover ? timeOffs.filter((t) => t.status === 'PENDING' && isAbsence(t.kind)) : [];
    const verdicts = await this.cover.assessMany(
      organizationId,
      open.map((t) => ({
        id: t.id,
        technicianId: t.technicianId,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
    );

    return success(timeOffs.map((t) => ({ ...t, cover: verdicts.get(t.id) ?? null })));
  }
}
