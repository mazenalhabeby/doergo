import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { checkEntryLabels, localDateKey, runWithCronLock, zonedParts, zoneOf } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';

/** The local hour from which last night is checked (the first sweep at or after it claims the night). */
export const LABEL_CHECK_LOCAL_HOUR = 3;
/** One organization's night is never more than this many entries. */
export const LABEL_CHECK_MAX_ENTRIES = 2000;
const HOUR_MS = 3_600_000;

export interface LabelCheckRunResult {
  organizationId: string;
  localDate: string;
  checked: number;
  mismatches: number;
}

/**
 * THE NIGHTLY LABEL CHECK (docs/plans/clock-attendance-2026-10.md step 4).
 *
 * Once a night per organization, in its own zone: yesterday's entries judged
 * by the label rules have their labels worked out again from their own facts
 * (shared `checkEntryLabels` — the clock's rules, imported). A disagreement is
 * one structured log line and one `label_check_findings` row.
 *
 * ⚠️ NEVER CORRECTS anything and is never shown to a customer: a finding is a
 * question for an engineer, not an answer. One read per organization, bounded.
 */
@Injectable()
export class LabelCheckService {
  private readonly logger = new Logger(LabelCheckService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('15 * * * *')
  async sweepCron(): Promise<void> {
    await runWithCronLock(this.prisma, { name: 'task:labelCheck', ttlSeconds: 3000, logger: this.logger }, async () => {
      const runs = await this.sweep();
      const found = runs.reduce((n, r) => n + r.mismatches, 0);
      if (runs.length) this.logger.log(`label check: ${runs.length} organization(s), ${found} finding(s)`);
    });
  }

  /** Every organization whose night has come and whose yesterday is not checked yet. */
  async sweep(now = new Date()): Promise<LabelCheckRunResult[]> {
    const orgs = await this.prisma.organization.findMany({
      where: { isActive: true, suspendedAt: null },
      select: { id: true, timezone: true },
    });
    const done: LabelCheckRunResult[] = [];
    for (const org of orgs) {
      const tz = zoneOf(org.timezone);
      if (zonedParts(now, tz).hour < LABEL_CHECK_LOCAL_HOUR) continue;
      const localDate = localDateKey(new Date(now.getTime() - 24 * HOUR_MS), tz);
      try {
        const run = await this.checkNight(org.id, tz, localDate, now);
        if (run) done.push(run);
      } catch (e) {
        this.logger.error(`label check failed for ${org.id} ${localDate}: ${(e as Error).message}`);
      }
    }
    return done;
  }

  /** One organization's night. Null when another sweep already claimed it. */
  async checkNight(organizationId: string, tz: string, localDate: string, now = new Date()) {
    const claimed = await this.claim(organizationId, localDate);
    if (!claimed) return null;
    // Yesterday, with an hour's slack each side for a DST change; filtered to the exact local day below.
    const hour = zonedParts(now, tz).hour;
    const from = new Date(now.getTime() - (hour + 26) * HOUR_MS);
    const to = new Date(now.getTime() - Math.max(0, hour - 1) * HOUR_MS);
    const rows = await this.prisma.timeEntry.findMany({
      where: {
        organizationId,
        labelRules: { not: null },
        status: { not: 'CLOCKED_IN' },
        clockInAt: { gte: from, lt: to },
      },
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        flagReasons: true,
        approvalStatus: true,
        approvedById: true,
        labelFacts: true,
      },
      orderBy: { clockInAt: 'asc' },
      take: LABEL_CHECK_MAX_ENTRIES,
    });
    const night = rows.filter((r) => localDateKey(r.clockInAt, tz) === localDate);
    let mismatches = 0;
    for (const r of night) {
      const finding = checkEntryLabels({
        clockInAt: r.clockInAt,
        clockOutAt: r.clockOutAt,
        flagReasons: r.flagReasons,
        approvalStatus: r.approvalStatus,
        decidedByPerson: r.approvedById != null,
        labelFacts: r.labelFacts,
      });
      if (!finding) continue;
      mismatches++;
      this.logger.warn(
        JSON.stringify({
          event: 'label_check_mismatch',
          organizationId,
          entryId: r.id,
          localDate,
          missing: finding.missing,
          unexpected: finding.unexpected,
          approval: finding.expected.approval ? { expected: 'PENDING', actual: r.approvalStatus } : undefined,
        }),
      );
      await this.prisma.labelCheckFinding.createMany({
        data: [
          {
            organizationId,
            entryId: r.id,
            localDate,
            expected: finding.expected as unknown as Prisma.InputJsonValue,
            actual: finding.actual as unknown as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });
    }
    await this.prisma.labelCheckRun.update({
      where: { organizationId_localDate: { organizationId, localDate } },
      data: { checked: night.length, mismatches },
    });
    return { organizationId, localDate, checked: night.length, mismatches };
  }

  /** The night is claimed by the insert: a second sweep (another hour, another replica) finds it taken. */
  private async claim(organizationId: string, localDate: string): Promise<boolean> {
    const res = await this.prisma.labelCheckRun.createMany({
      data: [{ organizationId, localDate }],
      skipDuplicates: true,
    });
    return res.count === 1;
  }
}
