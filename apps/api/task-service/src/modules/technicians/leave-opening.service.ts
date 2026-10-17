import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  personName,
  OPENING_LIMITS,
  leaveSourceKey,
  memberScopeFilter,
  parseOpeningBalances,
  type LeaveOpeningMatchResponse,
  type LeaveOpeningResponse,
  type LeaveOpeningSaveResponse,
  type LeaveYearMode,
} from '@hbcfield/shared';
import { assertNotSelfDecision } from '../attendance/self-decision';
import {
  PERSON_LEAVE_SELECT,
  PersonLeaveYear,
  asDate,
  dayOf,
  MEMBERS_WHERE,
  leaveYearFor,
  nameKey,
  readOpeningRows,
} from './leave-ledger-helpers';
import { LeaveLedgerBase } from './leave-ledger.base';

/**
 * Starting balances: what the organization opens the ledger with, matching people
 * from a sheet, saving it.
 */
@Injectable()
export class LeaveOpeningService extends LeaveLedgerBase {
  /** GET /employees/leave-opening — everybody in the caller's scope, with what is saved for the leave year containing `on`. */
  async getOpening(dto: {
    organizationId: string;
    scopeSpaceIds?: string[];
    on?: string;
  }): Promise<LeaveOpeningResponse> {
    const org = await this.loadOrg(dto.organizationId);
    const on = dto.on ? this.dayFrom({ on: dto.on }, org) : (dayOf(org.leaveTrackingStartedOn) ?? this.today(org));
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
          userId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          avatarUrl: p.avatarUrl ?? null,
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
  async saveOpening(dto: {
    organizationId: string;
    callerId: string;
    scopeSpaceIds?: string[];
    on?: unknown;
    rows?: unknown;
  }): Promise<LeaveOpeningSaveResponse> {
    const org = await this.loadOrg(dto.organizationId);
    if (typeof dto.on !== 'string' || !dto.on)
      throw new BadRequestException({
        code: 'LEAVE_DAY_INVALID',
        message: 'Choose the day you started counting leave in HBCField',
      });
    const on = this.dayFrom({ on: dto.on }, org);
    const rows = readOpeningRows(dto.rows);
    const ids = rows.map((r) => r.userId);

    // Every person: in this organization, a member, in the caller's scope. Anything else is 404.
    const people = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        organizationId: dto.organizationId,
        ...MEMBERS_WHERE,
        ...memberScopeFilter(dto.scopeSpaceIds),
      },
      select: PERSON_LEAVE_SELECT,
    });
    if (people.length !== ids.length)
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Employee not found' });
    if (ids.includes(dto.callerId)) {
      await assertNotSelfDecision(this.prisma as never, {
        deciderId: dto.callerId,
        subjectId: dto.callerId,
        organizationId: dto.organizationId,
        message: 'You cannot set your own starting balance. Ask a manager or an administrator.',
      });
    }

    const byId = new Map(people.map((p) => [p.id, p]));
    const wanted = new Map<
      string,
      { userId: string; kind: 'OPENING_USED' | 'CARRY_OVER'; days: number; start: string }
    >();
    for (const r of rows) {
      const start = leaveYearFor(org, byId.get(r.userId)!, on).start;
      wanted.set(leaveSourceKey.opening(r.userId, start), {
        userId: r.userId,
        kind: 'OPENING_USED',
        days: r.used ? -r.used : 0,
        start,
      });
      wanted.set(leaveSourceKey.openingCarry(r.userId, start), {
        userId: r.userId,
        kind: 'CARRY_OVER',
        days: r.carried,
        start,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.leaveAdjustment.findMany({
        where: { sourceKey: { in: [...wanted.keys()] } },
        select: { id: true, sourceKey: true, days: true, voidedAt: true },
      });
      const current = new Map(existing.map((e) => [e.sourceKey!, e]));
      const release: string[] = [];
      const voidNow: string[] = [];
      const create: Array<{
        key: string;
        userId: string;
        kind: 'OPENING_USED' | 'CARRY_OVER';
        days: number;
        start: string;
      }> = [];
      let unchanged = 0;
      for (const [key, w] of wanted) {
        const e = current.get(key);
        const live = e && !e.voidedAt;
        if (live && e.days === w.days) {
          unchanged++;
          continue;
        }
        if (!live && w.days === 0) {
          unchanged++;
          continue;
        }
        if (e) {
          release.push(e.id);
          if (live) voidNow.push(e.id);
        }
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
      await tx.organization.updateMany({
        where: { id: dto.organizationId, leaveTrackingStartedOn: null },
        data: { leaveTrackingStartedOn: asDate(on) },
      });
      const after = await tx.organization.findUnique({
        where: { id: dto.organizationId },
        select: { leaveTrackingStartedOn: true },
      });
      return {
        on,
        trackingStartedOn: dayOf(after?.leaveTrackingStartedOn),
        written: create.length,
        voided: voidNow.length,
        unchanged,
      };
    });
  }

  /**
   * POST /employees/leave-opening/match — read a pasted table (shared parseOpeningBalances) and
   * find each person among the members the caller may set: by email first (case-insensitive),
   * then by full name. The server never trusts an id from a paste; nothing is written.
   */
  async matchOpening(dto: {
    organizationId: string;
    scopeSpaceIds?: string[];
    text?: unknown;
  }): Promise<LeaveOpeningMatchResponse> {
    if (typeof dto.text !== 'string' || !dto.text.trim())
      throw new BadRequestException({ code: 'OPENING_TEXT_EMPTY', message: 'Paste the table first' });
    if (dto.text.length > OPENING_LIMITS.MAX_TEXT)
      throw new BadRequestException({
        code: 'OPENING_TOO_MANY_ROWS',
        message: `At most ${OPENING_LIMITS.MAX_ROWS} people at a time`,
      });
    const { rows, errors } = parseOpeningBalances(dto.text);
    if (rows.length > OPENING_LIMITS.MAX_ROWS)
      throw new BadRequestException({
        code: 'OPENING_TOO_MANY_ROWS',
        message: `At most ${OPENING_LIMITS.MAX_ROWS} people at a time`,
      });
    const people = await this.membersInScope(dto.organizationId, dto.scopeSpaceIds);
    const byEmail = new Map(people.map((p) => [p.email.trim().toLowerCase(), p]));
    const byName = new Map<string, typeof people>();
    for (const p of people) {
      for (const k of new Set([nameKey(personName(p)), nameKey(`${p.lastName} ${p.firstName}`)])) {
        byName.set(k, [...(byName.get(k) ?? []), p]);
      }
    }
    const out: LeaveOpeningMatchResponse = { matched: [], unmatched: [], errors };
    const seen = new Set<string>();
    for (const r of rows) {
      const email = byEmail.get(r.person.trim().toLowerCase());
      const named = email ? null : (byName.get(nameKey(r.person)) ?? []);
      const hit = email ?? (named && named.length === 1 ? named[0] : null);
      if (!hit) {
        out.unmatched.push({
          line: r.line,
          person: r.person,
          used: r.used,
          carried: r.carried,
          reason: named && named.length > 1 ? 'AMBIGUOUS' : 'NOT_FOUND',
        });
        continue;
      }
      if (seen.has(hit.id)) {
        out.unmatched.push({ line: r.line, person: r.person, used: r.used, carried: r.carried, reason: 'DUPLICATE' });
        continue;
      }
      seen.add(hit.id);
      out.matched.push({
        line: r.line,
        person: r.person,
        userId: hit.id,
        firstName: hit.firstName,
        lastName: hit.lastName,
        email: hit.email,
        used: r.used,
        carried: r.carried,
        by: email ? 'EMAIL' : 'NAME',
      });
    }
    return out;
  }
}
