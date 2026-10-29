import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  PrismaService,
  carryExpiredDays,
  carryExpiryDate,
  carryOverDays,
  dayKeyIn,
  leaveSourceKey,
  runWithCronLock,
  toISODateString,
  leavePeoplePage,
  orgsCarryingOver,
} from '@hbcfield/shared';
import { LeaveLedgerService, carryRuleOf, type OrgLeave, type PersonLeave } from './leave-ledger.service';

/** People per batch: one set of queries per batch, never one per person. */
const BATCH = 500;
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayBefore = (k: string) => {
  const t = asDate(k);
  t.setUTCDate(t.getUTCDate() - 1);
  return toISODateString(t);
};

/**
 * The carry-over rule, applied (shared leave/leave-ledger.ts carryOverDays / carryExpiredDays).
 *
 * For every organization whose rule is not NONE, on or after each person's leave-year start:
 *   · CARRY_OVER  = carryOverDays(what was left of the previous leave year, less its PENDING leave)
 *     — written once, then kept in step on every run as that year's requests are decided
 *   · after the rule's expiry date, CARRY_EXPIRED = −carryExpiredDays(carried, taken up to it)
 * Both are ordinary ledger lines — visible, with no author (the rule), and undoable.
 *
 * ⚠️ Idempotent by `sourceKey` ("carry:{user}:{yearStart}", "carry-expired:{user}:{yearStart}")
 * and `createMany({ skipDuplicates })`: running twice, or in two replicas, writes once. An undone
 * line keeps its key, so the rule does not write it back the next night.
 *
 * ⚠️ Never carries a year HBCField did not count: the previous leave year must end on or after the
 * day the organization started counting leave here (`leaveTrackingStartedOn`, else the day it
 * signed up). Before that, the starting-balances screen is where carried days come from — and a
 * person with an opening carry for the year gets no second one from the rule.
 *
 * Every @Cron runs in every replica: under the cron lease, and four times a day so a leave year
 * that starts on 1 January in Los Angeles is not a day late.
 */
@Injectable()
export class LeaveCarryOverService {
  private readonly logger = new Logger(LeaveCarryOverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LeaveLedgerService,
  ) {}

  @Cron('15 */6 * * *')
  async sweepCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'task:leaveCarryOver', ttlSeconds: 3000, logger: this.logger },
      async () => {
        const written = await this.sweep();
        if (written) this.logger.log(`Carry-over: ${written} ledger line(s) written`);
      },
    );
  }

  /** Directly callable (tests, a one-off run). Returns the number of lines written. */
  async sweep(now: Date = new Date()): Promise<number> {
    const orgs = await orgsCarryingOver(this.prisma);
    let written = 0;
    for (const org of orgs) {
      try {
        written += await this.sweepOrg(org as OrgLeave, now);
      } catch (e) {
        // One organization's bad data never stops everybody else's carry-over.
        this.logger.error(`Carry-over failed for org ${org.id}: ${(e as Error).message}`);
      }
    }
    return written;
  }

  async sweepOrg(org: OrgLeave, now: Date = new Date()): Promise<number> {
    const today = dayKeyIn(now, org.timezone);
    const countedSince = toISODateString(org.leaveTrackingStartedOn ?? org.createdAt);
    const rule = carryRuleOf(org);
    let written = 0;
    let cursor: string | undefined;
    for (;;) {
      const people: PersonLeave[] = await leavePeoplePage(this.prisma, org.id, BATCH, cursor);
      if (!people.length) break;
      cursor = people[people.length - 1]!.id;
      written += await this.sweepBatch(org, people, today, countedSince, rule);
      if (people.length < BATCH) break;
    }
    return written;
  }

  private async sweepBatch(
    org: OrgLeave,
    people: PersonLeave[],
    today: string,
    countedSince: string,
    rule: ReturnType<typeof carryRuleOf>,
  ): Promise<number> {
    // This leave year, and the one before it, for everybody — two batched balance reads.
    const current = await this.ledger.years(org, people, () => today);
    const eligible = people.filter((p) => {
      const ly = current.get(p.id)!.leaveYear;
      const prevEnd = dayBefore(ly.start);
      const joined = toISODateString(p.employmentStartDate ?? p.createdAt ?? new Date(0));
      return prevEnd >= countedSince && joined <= prevEnd;
    });
    const previous = eligible.length
      ? await this.ledger.years(org, eligible, (p) => dayBefore(current.get(p.id)!.leaveYear.start))
      : new Map();

    const rows: Array<{
      organizationId: string;
      userId: string;
      kind: 'CARRY_OVER' | 'CARRY_EXPIRED';
      days: number;
      leaveYearStart: Date;
      reason: string;
      sourceKey: string;
    }> = [];
    let updated = 0;
    for (const p of people) {
      const cur = current.get(p.id)!;
      const start = cur.leaveYear.start;
      const has = (key: string) => cur.adjustments.some((a) => a.sourceKey === key);
      const openingCarry = has(leaveSourceKey.openingCarry(p.id, start));

      // 1. Carry into this leave year — once, unless the starting balances already carried.
      let carriedNow = cur.adjustments.filter((a) => a.kind === 'CARRY_OVER').reduce((s, a) => s + a.days, 0);
      const prev = previous.get(p.id);
      const carryKey = leaveSourceKey.carry(p.id, start);
      /*
        ⚠️ PENDING leave of that year is not unspent: it is taken the moment it is approved. Carried
        as remaining, an approval a week later spent the same days twice.
      */
      const unspent = prev ? prev.balance.remaining - prev.balance.pending : 0;
      const written = cur.adjustments.find((a) => a.sourceKey === carryKey);
      if (prev && !openingCarry && written) {
        /*
          Already carried: a request of that year decided since (refused, cancelled, recorded) moves
          what was unspent — the line follows, ONE conditional update on the days it was written
          with (an undone line is voided and never read here, so it is never brought back).
        */
        const days = carryOverDays(unspent, rule);
        if (days !== written.days) {
          const res = await this.prisma.leaveAdjustment.updateMany({
            where: { organizationId: org.id, sourceKey: carryKey, voidedAt: null, days: written.days },
            data: { days },
          });
          if (res.count) {
            carriedNow += days - written.days;
            updated += res.count;
          }
        }
      } else if (prev && !openingCarry && !has(carryKey)) {
        const days = carryOverDays(unspent, rule);
        if (days > 0) {
          rows.push({
            organizationId: org.id,
            userId: p.id,
            kind: 'CARRY_OVER',
            days,
            leaveYearStart: asDate(start),
            reason: `Carried over from the leave year ${prev.leaveYear.start} – ${prev.leaveYear.end}`,
            sourceKey: carryKey,
          });
          carriedNow += days;
        }
      }

      // 2. Carried days not used by the expiry — after the last day they could be used.
      const expiry = carryExpiryDate(cur.leaveYear, rule);
      if (expiry && today > expiry && carriedNow > 0 && !has(leaveSourceKey.carryExpired(p.id, start))) {
        const lost = carryExpiredDays({ carried: carriedNow, takenUpToExpiry: cur.takenUpTo(expiry) });
        if (lost > 0) {
          rows.push({
            organizationId: org.id,
            userId: p.id,
            kind: 'CARRY_EXPIRED',
            days: -lost,
            leaveYearStart: asDate(start),
            reason: `Carried days not used by ${expiry}`,
            sourceKey: leaveSourceKey.carryExpired(p.id, start),
          });
        }
      }
    }
    if (!rows.length) return updated;
    const res = await this.prisma.leaveAdjustment.createMany({ data: rows as never, skipDuplicates: true });
    return res.count + updated;
  }
}
