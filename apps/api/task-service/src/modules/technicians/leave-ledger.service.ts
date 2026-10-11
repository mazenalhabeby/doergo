import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ABSENCE_WHERE,
  OPENING_LIMITS,
  PrismaService,
  assertFoundInOrg,
  assertMemberInScope,
  carryExpiryDate,
  countLeave as countLeaveDays,
  dayKeyIn,
  isLeaveAdjustmentKind,
  leaveBalance,
  leaveLedgerSource,
  leaveSourceKey,
  leaveYearDayFromQuery,
  leaveYearOf,
  memberScopeFilter,
  parseLeaveAdjustment,
  parseOpeningBalances,
  toISODateString,
  type CarryOverRule,
  type LeaveAdjustmentKind,
  type LeaveBalance,
  type LeaveBalanceResponse,
  type LeaveLedgerEntry,
  type LeaveLedgerResponse,
  type LeaveOpeningMatchResponse,
  type LeaveOpeningResponse,
  type LeaveOpeningSaveResponse,
  type LeaveYear,
  type LeaveYearMode,
} from '@hbcfield/shared';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { assertNotSelfDecision } from '../attendance/self-decision';

/* What the ledger needs to know about an organization and a person — selected once, passed down. */
export const ORG_LEAVE_SELECT = {
  id: true,
  createdAt: true,
  timezone: true,
  defaultLeaveAllowance: true,
  leaveYearMode: true,
  carryOverMode: true,
  carryOverMaxDays: true,
  carryExpiresAfterMonths: true,
  leaveTrackingStartedOn: true,
} as const;
export const PERSON_LEAVE_SELECT = { id: true, organizationId: true, leaveAllowance: true, employmentStartDate: true, createdAt: true } as const;

export interface OrgLeave {
  id: string;
  createdAt: Date;
  timezone: string | null;
  defaultLeaveAllowance: number;
  leaveYearMode: LeaveYearMode | string;
  carryOverMode: string;
  carryOverMaxDays: number | null;
  carryExpiresAfterMonths: number | null;
  leaveTrackingStartedOn: Date | null;
}
export interface PersonLeave {
  id: string;
  organizationId?: string | null;
  leaveAllowance: number | null;
  employmentStartDate: Date | null;
  createdAt?: Date;
}

/** One person's leave year, computed: everything the balance, the ledger and the carry-over rule read. */
export interface PersonLeaveYear {
  userId: string;
  leaveYear: LeaveYear;
  allowance: number;
  fullAllowance: number;
  prorated: boolean;
  startedOn: string | null;
  adjustments: Array<{ kind: LeaveAdjustmentKind; days: number; sourceKey: string | null }>;
  balance: LeaveBalance;
  carryExpiresOn: string | null;
  /** Approved vacation taken from the leave year's start up to and including `day` (pure, no query). */
  takenUpTo: (day: string) => number;
}

const half = (n: number) => Math.round(n * 2) / 2;
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date | null | undefined) => (d ? toISODateString(new Date(d)) : null);
const MEMBERS_WHERE = { isActive: true, isExternal: false, role: { not: 'CUSTOMER' } } as const;
const PERSON_BRIEF = { id: true, firstName: true, lastName: true } as const;

export function carryRuleOf(org: Pick<OrgLeave, 'carryOverMode' | 'carryOverMaxDays' | 'carryExpiresAfterMonths'>): CarryOverRule {
  return { mode: org.carryOverMode as CarryOverRule['mode'], maxDays: org.carryOverMaxDays, expiresAfterMonths: org.carryExpiresAfterMonths };
}

export function leaveYearFor(org: Pick<OrgLeave, 'leaveYearMode'>, person: Pick<PersonLeave, 'employmentStartDate'>, on: string): LeaveYear {
  return leaveYearOf({ mode: (org.leaveYearMode as LeaveYearMode) ?? 'CALENDAR', employmentStartDate: dayOf(person.employmentStartDate), on });
}

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

  /* ================================================================ the balance core */

  async years(org: OrgLeave, people: PersonLeave[], onFor: (p: PersonLeave) => string): Promise<Map<string, PersonLeaveYear>> {
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
          technicianId: { in: ids }, ...ABSENCE_WHERE, type: 'VACATION' as never,
          status: { in: ['APPROVED', 'PENDING'] as never[] },
          startDate: { lte: asDate(maxEnd) }, endDate: { gte: asDate(minStart) },
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
    const rules = withLeave.length ? await this.calendarRules.personRulesMany(org.id, withLeave, minStart, maxEnd) : new Map();
    const fallback = withLeave.some((id) => !rules.has(id)) ? await this.calendarRules.personRules(org.id, '', minStart, maxEnd) : null;

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
        const from = toISODateString(q.startDate), to = toISODateString(q.endDate);
        return { status: q.status as string, from: from < ly.start ? ly.start : from, to: to > ly.end ? ly.end : to };
      });
      const cost = (from: string, to: string) => (r ? countLeaveDays(from, to, r.rules, r.roster).counted : 0);
      let taken = 0, pending = 0;
      for (const c of clipped) {
        if (c.status === 'APPROVED') taken += cost(c.from, c.to);
        else pending += cost(c.from, c.to);
      }
      const adj = adjustments
        .filter((a) => a.userId === p.id && toISODateString(a.leaveYearStart) === ly.start && isLeaveAdjustmentKind(a.kind))
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
        takenUpTo: (day) => clipped
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

  private today(org: Pick<OrgLeave, 'timezone'>) {
    return dayKeyIn(new Date(), org.timezone);
  }

  private dayFrom(q: { on?: unknown; year?: unknown }, org: OrgLeave): string {
    const day = leaveYearDayFromQuery(q, this.today(org));
    if (!day) throw new BadRequestException({ code: 'LEAVE_DAY_INVALID', message: 'Choose a valid day (YYYY-MM-DD) or year' });
    return day;
  }

  /** One person and their organization — one query. 404 for anybody outside it. */
  private async loadPerson(organizationId: string, userId: string) {
    const person = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { ...PERSON_LEAVE_SELECT, organization: { select: ORG_LEAVE_SELECT } },
    });
    assertFoundInOrg(person, organizationId, 'Employee');
    return { person, org: person.organization as OrgLeave };
  }

  /** GET /employees/:id/leave-balance — the leave year containing `on` (default today). */
  async getBalance(dto: { technicianId: string; organizationId: string; on?: string; year?: number | string }): Promise<LeaveBalanceResponse> {
    const { person, org } = await this.loadPerson(dto.organizationId, dto.technicianId);
    const on = this.dayFrom(dto, org);
    const y = (await this.years(org, [person], () => on)).get(person.id)!;
    return this.toResponse(y);
  }

  /* ================================================================ who may write */

  /**
   * The rule for writing somebody's balance is the rule for deciding their leave: the person is
   * in a workspace the caller manages the rota of (`scopeSpaceIds`, server-resolved; undefined =
   * org-wide) and it is not the caller's own balance — an organization administrator excepted
   * (the same exemption as deciding leave, attendance/self-decision.ts).
   */
  private async assertMayWrite(organizationId: string, subjectId: string, callerId: string, scopeSpaceIds?: string[]) {
    await assertMemberInScope(this.prisma as never, { userId: subjectId, organizationId, scopeSpaceIds });
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: callerId,
      subjectId,
      organizationId,
      message: 'You cannot change your own leave balance. Ask a manager or an administrator.',
    });
  }

  private async mayWrite(organizationId: string, subjectId: string, callerId: string, scopeSpaceIds: string[] | undefined | null) {
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

  private entryOf(row: {
    id: string; kind: string; days: number; leaveYearStart: Date; reason: string | null; sourceKey: string | null; createdAt: Date; voidedAt: Date | null;
    createdBy: { id: string; firstName: string; lastName: string } | null; voidedBy: { id: string; firstName: string; lastName: string } | null;
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

  private readonly entrySelect = {
    id: true, kind: true, days: true, leaveYearStart: true, reason: true, sourceKey: true, createdAt: true, voidedAt: true, userId: true,
    createdBy: { select: PERSON_BRIEF }, voidedBy: { select: PERSON_BRIEF },
  } as const;

  /**
   * GET /employees/:id/leave-adjustments. The member reads their own; anybody else needs the
   * person in their scope (`scopeSpaceIds`, undefined = org-wide). `editScope` is the caller's
   * WRITE scope ('ORG', the spaces, or null = none) — only to answer `canEdit`, never the read.
   */
  async listAdjustments(dto: {
    technicianId: string; organizationId: string; callerId: string;
    scopeSpaceIds?: string[]; editScope?: 'ORG' | string[] | null; on?: string; year?: number | string;
  }): Promise<LeaveLedgerResponse> {
    const { person, org } = await this.loadPerson(dto.organizationId, dto.technicianId);
    if (dto.callerId !== dto.technicianId) {
      await assertMemberInScope(this.prisma as never, { userId: person.id, organizationId: dto.organizationId, scopeSpaceIds: dto.scopeSpaceIds });
    }
    const leaveYear = leaveYearFor(org, person, this.dayFrom(dto, org));
    const [rows, canEdit] = await Promise.all([
      this.prisma.leaveAdjustment.findMany({
        where: { organizationId: dto.organizationId, userId: person.id, leaveYearStart: asDate(leaveYear.start) },
        orderBy: { createdAt: 'desc' },
        select: this.entrySelect,
      }),
      this.mayWrite(dto.organizationId, person.id, dto.callerId, dto.editScope === 'ORG' ? undefined : dto.editScope ?? null),
    ]);
    return { leaveYear, items: rows.map((r) => this.entryOf(r)), canEdit };
  }

  /** POST /employees/:id/leave-adjustments — a hand-entered line (shared parseLeaveAdjustment). */
  async addAdjustment(dto: { technicianId: string; organizationId: string; callerId: string; scopeSpaceIds?: string[]; body: unknown }) {
    const parsed = parseLeaveAdjustment(dto.body);
    if (!parsed.ok) throw new BadRequestException({ code: parsed.code, message: ADJUSTMENT_REFUSALS[parsed.code] });
    const { person, org } = await this.loadPerson(dto.organizationId, dto.technicianId);
    await this.assertMayWrite(dto.organizationId, person.id, dto.callerId, dto.scopeSpaceIds);
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
      select: this.entrySelect,
    });
    const y = (await this.years(org, [person], () => leaveYear.start)).get(person.id)!;
    return { entry: this.entryOf(row), balance: this.toResponse(y) };
  }

  /**
   * POST /employees/leave-adjustments/:id/void — undo a line. Never deleted, never edited: it
   * stays in the ledger with who undid it. Claimed with a conditional update, so two clicks undo
   * once. A rule-written line keeps its idempotency key, so the rule does not write it again.
   */
  async voidAdjustment(dto: { adjustmentId: string; organizationId: string; callerId: string; scopeSpaceIds?: string[] }) {
    const found = await this.prisma.leaveAdjustment.findUnique({ where: { id: dto.adjustmentId }, select: { id: true, organizationId: true, userId: true, voidedAt: true } });
    assertFoundInOrg(found, dto.organizationId, 'Adjustment');
    await this.assertMayWrite(dto.organizationId, found.userId, dto.callerId, dto.scopeSpaceIds);
    const claimed = await this.prisma.leaveAdjustment.updateMany({
      where: { id: found.id, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: dto.callerId },
    });
    if (claimed.count === 0) throw new BadRequestException({ code: 'ADJUSTMENT_ALREADY_VOIDED', message: 'This line was already undone.' });
    const row = await this.prisma.leaveAdjustment.findUniqueOrThrow({ where: { id: found.id }, select: this.entrySelect });
    const { person, org } = await this.loadPerson(dto.organizationId, found.userId);
    const start = toISODateString(row.leaveYearStart);
    const y = (await this.years(org, [person], () => start)).get(person.id)!;
    return { entry: this.entryOf(row), balance: this.toResponse(y) };
  }

  /* ================================================================ starting balances */

  private async membersInScope(organizationId: string, scopeSpaceIds?: string[]) {
    return this.prisma.user.findMany({
      where: { organizationId, ...MEMBERS_WHERE, ...memberScopeFilter(scopeSpaceIds) },
      select: { ...PERSON_LEAVE_SELECT, firstName: true, lastName: true, email: true, avatarUrl: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 2000,
    });
  }

  private async loadOrg(organizationId: string): Promise<OrgLeave> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: ORG_LEAVE_SELECT });
    if (!org) throw new NotFoundException('Organization not found');
    return org as OrgLeave;
  }

  /** GET /employees/leave-opening — everybody in the caller's scope, with what is saved for the leave year containing `on`. */
  async getOpening(dto: { organizationId: string; scopeSpaceIds?: string[]; on?: string }): Promise<LeaveOpeningResponse> {
    const org = await this.loadOrg(dto.organizationId);
    const on = dto.on ? this.dayFrom({ on: dto.on }, org) : dayOf(org.leaveTrackingStartedOn) ?? this.today(org);
    const people = await this.membersInScope(dto.organizationId, dto.scopeSpaceIds);
    const years = await this.years(org, people, () => on);
    const keyed = (y: PersonLeaveYear, key: string) => y.adjustments.find((a) => a.sourceKey === key)?.days ?? 0;
    return {
      on,
      trackingStartedOn: dayOf(org.leaveTrackingStartedOn),
      mode: org.leaveYearMode as LeaveYearMode,
      rows: people.map((p) => {
        const y = years.get(p.id)!;
        return {
          userId: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, avatarUrl: p.avatarUrl ?? null,
          leaveYear: y.leaveYear,
          used: -keyed(y, leaveSourceKey.opening(p.id, y.leaveYear.start)),
          carried: keyed(y, leaveSourceKey.openingCarry(p.id, y.leaveYear.start)),
          allowance: y.balance.allowance,
          remaining: y.balance.remaining,
        };
      }),
    };
  }

  /**
   * POST /employees/leave-opening — one transaction for the whole table. Each row sets that
   * person's OPENING_USED and opening CARRY_OVER for the leave year containing `on`. Replacing is
   * never an edit: the old line is undone (its key renamed so the new one can take it) and a new
   * line written. A number that did not change writes nothing, so saving twice is a no-op.
   */
  async saveOpening(dto: { organizationId: string; callerId: string; scopeSpaceIds?: string[]; on?: unknown; rows?: unknown }): Promise<LeaveOpeningSaveResponse> {
    const org = await this.loadOrg(dto.organizationId);
    if (typeof dto.on !== 'string' || !dto.on) throw new BadRequestException({ code: 'LEAVE_DAY_INVALID', message: 'Choose the day you started counting leave in HBCField' });
    const on = this.dayFrom({ on: dto.on }, org);
    const rows = readOpeningRows(dto.rows);
    const ids = rows.map((r) => r.userId);

    // Every person: in this organization, a member, in the caller's scope. Anything else is 404.
    const people = await this.prisma.user.findMany({
      where: { id: { in: ids }, organizationId: dto.organizationId, ...MEMBERS_WHERE, ...memberScopeFilter(dto.scopeSpaceIds) },
      select: PERSON_LEAVE_SELECT,
    });
    if (people.length !== ids.length) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Employee not found' });
    if (ids.includes(dto.callerId)) {
      await assertNotSelfDecision(this.prisma as never, {
        deciderId: dto.callerId, subjectId: dto.callerId, organizationId: dto.organizationId,
        message: 'You cannot set your own starting balance. Ask a manager or an administrator.',
      });
    }

    const byId = new Map(people.map((p) => [p.id, p]));
    const wanted = new Map<string, { userId: string; kind: 'OPENING_USED' | 'CARRY_OVER'; days: number; start: string }>();
    for (const r of rows) {
      const start = leaveYearFor(org, byId.get(r.userId)!, on).start;
      wanted.set(leaveSourceKey.opening(r.userId, start), { userId: r.userId, kind: 'OPENING_USED', days: r.used ? -r.used : 0, start });
      wanted.set(leaveSourceKey.openingCarry(r.userId, start), { userId: r.userId, kind: 'CARRY_OVER', days: r.carried, start });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.leaveAdjustment.findMany({
        where: { sourceKey: { in: [...wanted.keys()] } },
        select: { id: true, sourceKey: true, days: true, voidedAt: true },
      });
      const current = new Map(existing.map((e) => [e.sourceKey!, e]));
      const release: string[] = [];
      const voidNow: string[] = [];
      const create: Array<{ key: string; userId: string; kind: 'OPENING_USED' | 'CARRY_OVER'; days: number; start: string }> = [];
      let unchanged = 0;
      for (const [key, w] of wanted) {
        const e = current.get(key);
        const live = e && !e.voidedAt;
        if (live && e.days === w.days) { unchanged++; continue; }
        if (!live && w.days === 0) { unchanged++; continue; }
        if (e) { release.push(e.id); if (live) voidNow.push(e.id); }
        if (w.days !== 0) create.push({ key, ...w });
      }
      if (release.length) {
        // The old line gives its key up (renamed) and, if still live, is undone — in one statement.
        await tx.$executeRaw`
          UPDATE "leave_adjustments"
             SET "sourceKey" = "sourceKey" || '#void:' || "id",
                 "voidedAt" = COALESCE("voidedAt", now()),
                 "voidedById" = COALESCE("voidedById", ${dto.callerId})
           WHERE "id" = ANY(${release}::text[])`;
      }
      if (create.length) {
        await tx.leaveAdjustment.createMany({
          data: create.map((c) => ({
            organizationId: dto.organizationId,
            userId: c.userId,
            kind: c.kind as never,
            days: c.days,
            leaveYearStart: asDate(c.start),
            reason: c.kind === 'OPENING_USED' ? 'Used before HBCField' : 'Carried over before HBCField',
            createdById: dto.callerId,
            sourceKey: c.key,
          })),
        });
      }
      /*
        WHY THIS SERVICE WRITES `Organization` (auth-service owns it): the day this organization
        started counting leave here is a consequence of the FIRST starting-balances save and must
        commit with its rows — a save that wrote the lines and not the date (or the reverse) leaves
        the screen offering the start-of-tracking question again over balances already entered.
        One column, only while it is still empty; changing it later is the leave policy's
        (PATCH /organizations/leave-policy, ADMIN, auth-service).
      */
      await tx.organization.updateMany({ where: { id: dto.organizationId, leaveTrackingStartedOn: null }, data: { leaveTrackingStartedOn: asDate(on) } });
      const after = await tx.organization.findUnique({ where: { id: dto.organizationId }, select: { leaveTrackingStartedOn: true } });
      return { on, trackingStartedOn: dayOf(after?.leaveTrackingStartedOn), written: create.length, voided: voidNow.length, unchanged };
    });
  }

  /**
   * POST /employees/leave-opening/match — read a pasted table (shared parseOpeningBalances) and
   * find each person among the members the caller may set: by email first (case-insensitive),
   * then by full name. The server never trusts an id from a paste; nothing is written.
   */
  async matchOpening(dto: { organizationId: string; scopeSpaceIds?: string[]; text?: unknown }): Promise<LeaveOpeningMatchResponse> {
    if (typeof dto.text !== 'string' || !dto.text.trim()) throw new BadRequestException({ code: 'OPENING_TEXT_EMPTY', message: 'Paste the table first' });
    if (dto.text.length > OPENING_LIMITS.MAX_TEXT) throw new BadRequestException({ code: 'OPENING_TOO_MANY_ROWS', message: `At most ${OPENING_LIMITS.MAX_ROWS} people at a time` });
    const { rows, errors } = parseOpeningBalances(dto.text);
    if (rows.length > OPENING_LIMITS.MAX_ROWS) throw new BadRequestException({ code: 'OPENING_TOO_MANY_ROWS', message: `At most ${OPENING_LIMITS.MAX_ROWS} people at a time` });
    const people = await this.membersInScope(dto.organizationId, dto.scopeSpaceIds);
    const byEmail = new Map(people.map((p) => [p.email.trim().toLowerCase(), p]));
    const byName = new Map<string, typeof people>();
    for (const p of people) {
      for (const k of new Set([nameKey(`${p.firstName} ${p.lastName}`), nameKey(`${p.lastName} ${p.firstName}`)])) {
        byName.set(k, [...(byName.get(k) ?? []), p]);
      }
    }
    const out: LeaveOpeningMatchResponse = { matched: [], unmatched: [], errors };
    const seen = new Set<string>();
    for (const r of rows) {
      const email = byEmail.get(r.person.trim().toLowerCase());
      const named = email ? null : byName.get(nameKey(r.person)) ?? [];
      const hit = email ?? (named && named.length === 1 ? named[0] : null);
      if (!hit) {
        out.unmatched.push({ line: r.line, person: r.person, used: r.used, carried: r.carried, reason: named && named.length > 1 ? 'AMBIGUOUS' : 'NOT_FOUND' });
        continue;
      }
      if (seen.has(hit.id)) {
        out.unmatched.push({ line: r.line, person: r.person, used: r.used, carried: r.carried, reason: 'DUPLICATE' });
        continue;
      }
      seen.add(hit.id);
      out.matched.push({ line: r.line, person: r.person, userId: hit.id, firstName: hit.firstName, lastName: hit.lastName, email: hit.email, used: r.used, carried: r.carried, by: email ? 'EMAIL' : 'NAME' });
    }
    return out;
  }
}

/** "Müller, Anna" / "anna  müller" → "anna muller". */
export function nameKey(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/,/g, ' ').trim().toLowerCase().split(/\s+/).join(' ');
}

const ADJUSTMENT_REFUSALS: Record<string, string> = {
  ADJUSTMENT_KIND_INVALID: 'Choose: used before HBCField, a correction, or extra days granted',
  ADJUSTMENT_DAYS_INVALID: 'Enter a number of days in half days, not zero',
  ADJUSTMENT_REASON_REQUIRED: 'Say why — a correction or a grant needs a reason',
  ADJUSTMENT_REASON_TOO_LONG: 'The reason is too long',
  ADJUSTMENT_DATE_INVALID: 'Choose a day inside the leave year (YYYY-MM-DD)',
};

/** The table a starting-balances save sends: ≤ 500 people, each once, half days 0–366. */
export function readOpeningRows(raw: unknown): Array<{ userId: string; used: number; carried: number }> {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException({ code: 'OPENING_ROWS_EMPTY', message: 'Nothing to save' });
  if (raw.length > OPENING_LIMITS.MAX_ROWS) throw new BadRequestException({ code: 'OPENING_TOO_MANY_ROWS', message: `At most ${OPENING_LIMITS.MAX_ROWS} people at a time` });
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 366 && half(n) === n;
  const seen = new Set<string>();
  return raw.map((r) => {
    const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const used = row.used ?? 0, carried = row.carried ?? 0;
    if (typeof row.userId !== 'string' || !row.userId || seen.has(row.userId) || !ok(used) || !ok(carried)) {
      throw new BadRequestException({ code: 'OPENING_ROW_INVALID', message: 'Each person once, with days in half days from 0 to 366' });
    }
    seen.add(row.userId);
    return { userId: row.userId, used: used as number, carried: carried as number };
  });
}
