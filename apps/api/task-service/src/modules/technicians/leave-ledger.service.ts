import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PrismaService,
  assertFoundInOrg,
  assertMemberInScope,
  parseLeaveAdjustment,
  toISODateString,
  type LeaveBalanceResponse,
  type LeaveLedgerResponse,
} from '@hbcfield/shared';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import {
  asDate,
  leaveYearFor,
  ADJUSTMENT_REFUSALS,
  type OrgLeave,
  type PersonLeave,
  type PersonLeaveYear,
} from './leave-ledger-helpers';
import {
  LEAVE_ENTRY_SELECT,
  assertMayWriteLeave,
  leaveDayFrom,
  leaveEntryOf,
  loadLeavePerson,
  mayWriteLeave,
} from './leave-ledger-access';
import { leaveBalanceResponse, leaveYears } from './leave-years';

export {
  ORG_LEAVE_SELECT,
  PERSON_LEAVE_SELECT,
  type OrgLeave,
  type PersonLeave,
  type PersonLeaveYear,
  carryRuleOf,
  leaveYearFor,
  nameKey,
  readOpeningRows,
} from './leave-ledger-helpers';

/**
 * THE LEAVE LEDGER — the one place a vacation balance is computed (shared leave/leave-ledger.ts).
 *
 *   allowance (person's, else the organization's; pro-rated in a first calendar year)
 * + the leave year's non-voided adjustments (stored rows: used before HBCField, carried, …)
 * − approved VACATION inside the leave year, in WORKING days (shared calendar countLeave)
 *
 * Every screen that shows a balance — the Requests preview, the decision drawer, the starting
 * balances screen, the carry-over rule — reads `years()`. A fixed number of queries however many
 * people: their requests (1), their adjustments (1), and the calendar rules once when anybody has
 * vacation in the window.
 */
@Injectable()
export class LeaveLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarRules: CalendarRulesService,
  ) {}

  /** Each person's leave year containing the day `onFor` names — the balance core (leave-years.ts). */
  years(
    org: OrgLeave,
    people: PersonLeave[],
    onFor: (p: PersonLeave) => string,
  ): Promise<Map<string, PersonLeaveYear>> {
    return leaveYears(this.prisma, this.calendarRules, org, people, onFor);
  }

  /** The response every client reads — the old fields first, so a phone from before keeps working. */
  toResponse(y: PersonLeaveYear): LeaveBalanceResponse {
    return leaveBalanceResponse(y);
  }

  /** GET /employees/:id/leave-balance — the leave year containing `on` (default today). */
  async getBalance(dto: {
    technicianId: string;
    organizationId: string;
    on?: string;
    year?: number | string;
  }): Promise<LeaveBalanceResponse> {
    const { person, org } = await loadLeavePerson(this.prisma, dto.organizationId, dto.technicianId);
    const on = leaveDayFrom(dto, org);
    const y = (await this.years(org, [person], () => on)).get(person.id)!;
    return this.toResponse(y);
  }

  /**
   * GET /employees/:id/leave-adjustments. The member reads their own; anybody else needs the
   * person in their scope (`scopeSpaceIds`, undefined = org-wide). `editScope` is the caller's
   * WRITE scope ('ORG', the spaces, or null = none) — only to answer `canEdit`, never the read.
   */
  async listAdjustments(dto: {
    technicianId: string;
    organizationId: string;
    callerId: string;
    scopeSpaceIds?: string[];
    editScope?: 'ORG' | string[] | null;
    on?: string;
    year?: number | string;
  }): Promise<LeaveLedgerResponse> {
    const { person, org } = await loadLeavePerson(this.prisma, dto.organizationId, dto.technicianId);
    if (dto.callerId !== dto.technicianId) {
      await assertMemberInScope(this.prisma as never, {
        userId: person.id,
        organizationId: dto.organizationId,
        scopeSpaceIds: dto.scopeSpaceIds,
      });
    }
    const leaveYear = leaveYearFor(org, person, leaveDayFrom(dto, org));
    const [rows, canEdit] = await Promise.all([
      this.prisma.leaveAdjustment.findMany({
        where: { organizationId: dto.organizationId, userId: person.id, leaveYearStart: asDate(leaveYear.start) },
        orderBy: { createdAt: 'desc' },
        select: LEAVE_ENTRY_SELECT,
      }),
      mayWriteLeave(
        this.prisma,
        dto.organizationId,
        person.id,
        dto.callerId,
        dto.editScope === 'ORG' ? undefined : (dto.editScope ?? null),
      ),
    ]);
    return { leaveYear, items: rows.map((r) => leaveEntryOf(r)), canEdit };
  }

  /** POST /employees/:id/leave-adjustments — a hand-entered line (shared parseLeaveAdjustment). */
  async addAdjustment(dto: {
    technicianId: string;
    organizationId: string;
    callerId: string;
    scopeSpaceIds?: string[];
    body: unknown;
  }) {
    const parsed = parseLeaveAdjustment(dto.body);
    if (!parsed.ok) throw new BadRequestException({ code: parsed.code, message: ADJUSTMENT_REFUSALS[parsed.code] });
    const { person, org } = await loadLeavePerson(this.prisma, dto.organizationId, dto.technicianId);
    await assertMayWriteLeave(this.prisma, dto.organizationId, person.id, dto.callerId, dto.scopeSpaceIds);
    const leaveYear = leaveYearFor(org, person, parsed.value.on);
    const row = await this.prisma.leaveAdjustment.create({
      data: {
        organizationId: dto.organizationId,
        userId: person.id,
        kind: parsed.value.kind as never,
        days: parsed.value.days,
        leaveYearStart: asDate(leaveYear.start),
        reason: parsed.value.reason,
        createdById: dto.callerId,
      },
      select: LEAVE_ENTRY_SELECT,
    });
    const y = (await this.years(org, [person], () => leaveYear.start)).get(person.id)!;
    return { entry: leaveEntryOf(row), balance: this.toResponse(y) };
  }

  /**
   * POST /employees/leave-adjustments/:id/void — undo a line. Never deleted, never edited: it
   * stays in the ledger with who undid it. Claimed with a conditional update, so two clicks undo
   * once. A rule-written line keeps its idempotency key, so the rule does not write it again.
   */
  async voidAdjustment(dto: {
    adjustmentId: string;
    organizationId: string;
    callerId: string;
    scopeSpaceIds?: string[];
  }) {
    const found = await this.prisma.leaveAdjustment.findUnique({
      where: { id: dto.adjustmentId },
      select: { id: true, organizationId: true, userId: true, voidedAt: true },
    });
    assertFoundInOrg(found, dto.organizationId, 'Adjustment');
    await assertMayWriteLeave(this.prisma, dto.organizationId, found.userId, dto.callerId, dto.scopeSpaceIds);
    const claimed = await this.prisma.leaveAdjustment.updateMany({
      where: { id: found.id, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: dto.callerId },
    });
    if (claimed.count === 0)
      throw new BadRequestException({ code: 'ADJUSTMENT_ALREADY_VOIDED', message: 'This line was already undone.' });
    const row = await this.prisma.leaveAdjustment.findUniqueOrThrow({
      where: { id: found.id },
      select: LEAVE_ENTRY_SELECT,
    });
    const { person, org } = await loadLeavePerson(this.prisma, dto.organizationId, found.userId);
    const start = toISODateString(row.leaveYearStart);
    const y = (await this.years(org, [person], () => start)).get(person.id)!;
    return { entry: leaveEntryOf(row), balance: this.toResponse(y) };
  }
}
