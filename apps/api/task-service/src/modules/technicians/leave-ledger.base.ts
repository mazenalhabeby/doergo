import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
  assertFoundInOrg,
  assertMemberInScope,
  carryExpiryDate,
  countLeave as countLeaveDays,
  dayKeyIn,
  isLeaveAdjustmentKind,
  leaveBalance,
  leaveLedgerSource,
  leaveYearDayFromQuery,
  toISODateString,
  type LeaveAdjustmentKind,
  type LeaveBalanceResponse,
  type LeaveLedgerEntry,
  orgLeaveFacts,
  leaveRoster,
  personLeaveFacts,
  ABSENCE_WHERE,
} from '@hbcfield/shared';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { assertNotSelfDecision } from '../attendance/self-decision';
import {
  OrgLeave,
  PersonLeave,
  PersonLeaveYear,
  half,
  asDate,
  dayOf,
  PERSON_BRIEF,
  carryRuleOf,
  leaveYearFor,
} from './leave-ledger-helpers';

/**
 * The ONE vacation balance's working parts: the leave years (allowance +
 * adjustments − taken), today's day, the person and the organization read, who may
 * write, and an entry's shape.
 */
@Injectable()
export abstract class LeaveLedgerBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly calendarRules: CalendarRulesService,
  ) {}

  /* ================================================================ the balance core */

  async years(
    org: OrgLeave,
    people: PersonLeave[],
    onFor: (p: PersonLeave) => string,
  ): Promise<Map<string, PersonLeaveYear>> {
    const out = new Map<string, PersonLeaveYear>();
    if (!people.length) return out;
    const windows = new Map(people.map((p) => [p.id, leaveYearFor(org, p, onFor(p))]));
    const all = [...windows.values()];
    const minStart = all.reduce((m, w) => (w.start < m ? w.start : m), all[0]!.start);
    const maxEnd = all.reduce((m, w) => (w.end > m ? w.end : m), all[0]!.end);
    const ids = people.map((p) => p.id);
    const starts = [...new Set(all.map((w) => w.start))].map(asDate);

    const [requests, adjustments] = await Promise.all([
      this.prisma.timeOff.findMany({
        // Leave only, VACATION only: a remote day or a sick day never touches the allowance.
        where: {
          technicianId: { in: ids },
          ...ABSENCE_WHERE,
          type: 'VACATION' as never,
          status: { in: ['APPROVED', 'PENDING'] as never[] },
          startDate: { lte: asDate(maxEnd) },
          endDate: { gte: asDate(minStart) },
        },
        select: { technicianId: true, status: true, startDate: true, endDate: true },
      }),
      this.prisma.leaveAdjustment.findMany({
        where: { organizationId: org.id, userId: { in: ids }, voidedAt: null, leaveYearStart: { in: starts } },
        select: { userId: true, kind: true, days: true, leaveYearStart: true, sourceKey: true },
      }),
    ]);

    // Calendar rules only for people who have vacation in the window, once for all of them.
    const withLeave = [...new Set(requests.map((r) => r.technicianId))];
    const rules = withLeave.length
      ? await this.calendarRules.personRulesMany(org.id, withLeave, minStart, maxEnd)
      : new Map();
    const fallback = withLeave.some((id) => !rules.has(id))
      ? await this.calendarRules.personRules(org.id, '', minStart, maxEnd)
      : null;

    const rule = carryRuleOf(org);
    for (const p of people) {
      const ly = windows.get(p.id)!;
      // Null is "use the default"; 0 is a real answer (no paid leave), so `??` not `||`.
      const fullAllowance = p.leaveAllowance ?? org.defaultLeaveAllowance ?? 25;
      let allowance = fullAllowance;
      let prorated = false;
      /*
        A first calendar year is pro-rated by the months actually here, the start month included.
        Only from a RECORDED start date (createdAt would cut months off everybody imported on one
        afternoon). A work year begins on the start date itself, so it is never pro-rated.
      */
      const started = dayOf(p.employmentStartDate);
      if (ly.mode === 'CALENDAR' && started && started >= ly.start && started <= ly.end) {
        const monthsHere = 13 - Number(started.slice(5, 7));
        allowance = half((fullAllowance * monthsHere) / 12);
        prorated = true;
      }

      const mine = requests.filter((r) => r.technicianId === p.id);
      const r = rules.get(p.id) ?? fallback;
      const clipped = mine.map((q) => {
        const from = toISODateString(q.startDate),
          to = toISODateString(q.endDate);
        return { status: q.status as string, from: from < ly.start ? ly.start : from, to: to > ly.end ? ly.end : to };
      });
      const cost = (from: string, to: string) => (r ? countLeaveDays(from, to, r.rules, r.roster).counted : 0);
      let taken = 0,
        pending = 0;
      for (const c of clipped) {
        if (c.status === 'APPROVED') taken += cost(c.from, c.to);
        else pending += cost(c.from, c.to);
      }
      const adj = adjustments
        .filter(
          (a) => a.userId === p.id && toISODateString(a.leaveYearStart) === ly.start && isLeaveAdjustmentKind(a.kind),
        )
        .map((a) => ({ kind: a.kind as LeaveAdjustmentKind, days: a.days, sourceKey: a.sourceKey }));
      const balance = leaveBalance({ allowance, adjustments: adj, taken, pending });
      const carried = adj.some((a) => a.kind === 'CARRY_OVER' && a.days > 0);
      out.set(p.id, {
        userId: p.id,
        leaveYear: ly,
        allowance,
        fullAllowance,
        prorated,
        startedOn: prorated ? started : null,
        adjustments: adj,
        balance,
        carryExpiresOn: carried ? carryExpiryDate(ly, rule) : null,
        takenUpTo: (day) =>
          clipped
            .filter((c) => c.status === 'APPROVED' && c.from <= day)
            .reduce((s, c) => s + cost(c.from, c.to > day ? day : c.to), 0),
      });
    }
    return out;
  }

  /** The response every client reads — the old fields first, so a phone from before keeps working. */
  toResponse(y: PersonLeaveYear): LeaveBalanceResponse {
    return {
      year: Number(y.leaveYear.start.slice(0, 4)),
      allowance: y.balance.allowance,
      taken: y.balance.taken,
      pending: y.balance.pending,
      remaining: y.balance.remaining,
      prorated: y.prorated,
      fullAllowance: y.fullAllowance,
      startedOn: y.startedOn,
      leaveYear: y.leaveYear,
      adjusted: y.balance.adjusted,
      lines: y.balance.lines,
      carryExpiresOn: y.carryExpiresOn,
    };
  }

  protected today(org: Pick<OrgLeave, 'timezone'>) {
    return dayKeyIn(new Date(), org.timezone);
  }

  protected dayFrom(q: { on?: unknown; year?: unknown }, org: OrgLeave): string {
    const day = leaveYearDayFromQuery(q, this.today(org));
    if (!day)
      throw new BadRequestException({ code: 'LEAVE_DAY_INVALID', message: 'Choose a valid day (YYYY-MM-DD) or year' });
    return day;
  }

  /** One person and their organization — one query. 404 for anybody outside it. */
  protected async loadPerson(organizationId: string, userId: string) {
    const person = await personLeaveFacts(this.prisma, userId, organizationId);
    assertFoundInOrg(person, organizationId, 'Employee');
    return { person, org: person.organization as OrgLeave };
  }

  /* ================================================================ who may write */

  /**
   * The rule for writing somebody's balance is the rule for deciding their leave: the person is
   * in a workspace the caller manages the rota of (`scopeSpaceIds`, server-resolved; undefined =
   * org-wide) and it is not the caller's own balance — an organization administrator excepted
   * (the same exemption as deciding leave, attendance/self-decision.ts).
   */
  protected async assertMayWrite(
    organizationId: string,
    subjectId: string,
    callerId: string,
    scopeSpaceIds?: string[],
  ) {
    await assertMemberInScope(this.prisma as never, { userId: subjectId, organizationId, scopeSpaceIds });
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: callerId,
      subjectId,
      organizationId,
      message: 'You cannot change your own leave balance. Ask a manager or an administrator.',
    });
  }

  protected async mayWrite(
    organizationId: string,
    subjectId: string,
    callerId: string,
    scopeSpaceIds: string[] | undefined | null,
  ) {
    if (scopeSpaceIds === null) return false;
    try {
      await this.assertMayWrite(organizationId, subjectId, callerId, scopeSpaceIds);
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException) return false;
      throw e;
    }
  }

  /* ================================================================ the ledger */

  protected entryOf(row: {
    id: string;
    kind: string;
    days: number;
    leaveYearStart: Date;
    reason: string | null;
    sourceKey: string | null;
    createdAt: Date;
    voidedAt: Date | null;
    createdBy: { id: string; firstName: string; lastName: string } | null;
    voidedBy: { id: string; firstName: string; lastName: string } | null;
  }): LeaveLedgerEntry {
    return {
      id: row.id,
      kind: row.kind as LeaveAdjustmentKind,
      days: row.days,
      leaveYearStart: toISODateString(row.leaveYearStart),
      reason: row.reason,
      source: leaveLedgerSource(row.sourceKey),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
      voidedBy: row.voidedBy,
    };
  }

  protected readonly entrySelect = {
    id: true,
    kind: true,
    days: true,
    leaveYearStart: true,
    reason: true,
    sourceKey: true,
    createdAt: true,
    voidedAt: true,
    userId: true,
    createdBy: { select: PERSON_BRIEF },
    voidedBy: { select: PERSON_BRIEF },
  } as const;

  /* ================================================================ starting balances */

  protected async membersInScope(organizationId: string, scopeSpaceIds?: string[]) {
    return leaveRoster(this.prisma, organizationId, scopeSpaceIds);
  }

  protected async loadOrg(organizationId: string): Promise<OrgLeave> {
    const org = await orgLeaveFacts(this.prisma, organizationId);
    if (!org) throw new NotFoundException('Organization not found');
    return org as OrgLeave;
  }
}
