/** The organization's leave list — moved here unchanged from leave-records.service.ts. */
import { notEndedWhere, isAbsence } from '@hbcfield/shared';
import { success } from '@hbcfield/shared';
import { GetOrgTimeOffDto } from './dto';
import { SPACE_BRIEF } from './technicians-helpers';
import { MemberServiceBase } from './member-service.base';
import type { Prisma } from '@prisma/client';

export abstract class LeaveRecordsOrgBase extends MemberServiceBase {
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

    const where: Prisma.TimeOffWhereInput = {
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
      where.AND = [
        {
          OR: [
            { status: 'PENDING' },
            {
              startDate: { lte: new Date(`${dto.to}T23:59:59.999Z`) },
              endDate: { gte: new Date(`${dto.from}T00:00:00.000Z`) },
            },
          ],
        },
      ];
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
