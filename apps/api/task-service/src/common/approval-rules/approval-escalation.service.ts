import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import {
  ABSENCE_WHERE,
  SERVICE_NAMES,
  noticeDue,
  personName,
  pickRule,
  runWithCronLock,
  type NoticeStage,
  type RuleFacts,
  type RuleKind,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { ApprovalRouteService } from './approval-route.service';
import { ApprovalRulesService } from './approval-rules.service';
import { CoverService } from '../../modules/technicians/cover.service';
import { emitEvent, approvalReminderEvent } from '@hbcfield/shared/microservices';

/** One sweep looks at no more than this many waiting items per organization and kind. */
const MAX_ITEMS = 500;

interface Waiting {
  itemId: string;
  since: Date;
  subjectId: string | null;
  subjectName: string;
  facts: RuleFacts;
}

/**
 * WHEN NOBODY ANSWERS (shared `approval-rules.ts` → `noticeDue`).
 *
 * Every 15 minutes, under the cron lease: for each organization with a rule
 * that reminds or escalates, the items of that kind still waiting are read
 * (one query per organization and kind), and for each the rule that applies
 * decides what is due — remind the usual deciders, then pass it to the holders
 * of another role. Each is said ONCE (`ApprovalNotice`, unique per item and
 * stage, claimed by the insert). Nobody on leave is reminded; nobody is told
 * about their own item. Telling only — who may DECIDE is unchanged.
 */
@Injectable()
export class ApprovalEscalationService {
  private readonly logger = new Logger(ApprovalEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: ApprovalRulesService,
    private readonly route: ApprovalRouteService,
    private readonly moduleRef: ModuleRef,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'task:approvalEscalation', ttlSeconds: 540, logger: this.logger },
      async () => {
        const sent = await this.sweep();
        if (sent) this.logger.log(`approval notices sent: ${sent}`);
      },
    );
  }

  async sweep(now = new Date()): Promise<number> {
    const rules = await this.prisma.approvalRule.findMany({
      where: { isActive: true, OR: [{ remindAfterHours: { not: null } }, { escalateAfterHours: { not: null } }] },
    });
    const groups = new Map<string, typeof rules>();
    for (const r of rules)
      groups.set(`${r.organizationId}|${r.kind}`, [...(groups.get(`${r.organizationId}|${r.kind}`) ?? []), r]);

    let sent = 0;
    for (const [key, group] of groups) {
      const [organizationId, kind] = key.split('|') as [string, RuleKind];
      // Nothing can be due before the shortest wait any of these rules asks for.
      const shortest = Math.min(
        ...group.flatMap((r) => [r.remindAfterHours, r.escalateAfterHours].filter((h): h is number => h != null)),
      );
      const cutoff = new Date(now.getTime() - shortest * 3_600_000);
      try {
        const items = await this.waiting(
          organizationId,
          kind,
          cutoff,
          group.some((r) => r.whenCoverShort),
        );
        if (!items.length) continue;
        const notices = await this.prisma.approvalNotice.findMany({
          where: { kind, itemId: { in: items.map((i) => i.itemId) } },
          select: { itemId: true, stage: true },
        });
        const sentFor = new Map<string, Set<NoticeStage>>();
        for (const n of notices)
          (sentFor.get(n.itemId) ?? sentFor.set(n.itemId, new Set()).get(n.itemId)!).add(n.stage as NoticeStage);

        for (const item of items) {
          const rule = pickRule(group as never[], item.facts) as (typeof group)[number] | null;
          if (!rule) continue;
          const stage = noticeDue(rule, item.since, now, sentFor.get(item.itemId) ?? new Set());
          if (!stage) continue;
          // Claimed by the insert: two replicas, or two sweeps, say it once.
          try {
            await this.prisma.approvalNotice.create({
              data: { organizationId, kind, itemId: item.itemId, ruleId: rule.id, stage },
            });
          } catch {
            continue;
          }
          let recipientIds =
            stage === 'ESCALATE'
              ? await this.rules.holdersOf(
                  organizationId,
                  rule.escalateRoleId!,
                  item.facts.spaceIds,
                  item.subjectId ? [item.subjectId] : [],
                )
              : [];
          // Nobody holds the escalation role (here): it must not vanish — the usual deciders hear instead.
          if (!recipientIds.length) recipientIds = await this.usualDeciders(organizationId, kind, item);
          if (!recipientIds.length) continue;
          emitEvent(this.notifications, approvalReminderEvent, {
            organizationId,
            recipientIds,
            kind,
            itemId: item.itemId,
            stage,
            subjectName: item.subjectName,
            hours: Math.floor((now.getTime() - item.since.getTime()) / 3_600_000),
          });
          sent++;
        }
      } catch (e) {
        this.logger.warn(`escalation sweep ${key} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }

  /** Who decides it today, from the one resolver "who else can decide" uses — minus anybody on leave. */
  private async usualDeciders(organizationId: string, kind: RuleKind, item: Waiting): Promise<string[]> {
    const r = await this.route.route({
      organizationId,
      callerId: '',
      kind,
      spaceId: item.facts.spaceIds[0] ?? null,
      subjectUserId: item.subjectId,
    });
    return r.deciders.filter((d) => !d.onLeave).map((d) => d.id);
  }

  /** The items of a kind still waiting since before `cutoff`, as a rule reads them. */
  private async waiting(organizationId: string, kind: RuleKind, cutoff: Date, needCover: boolean): Promise<Waiting[]> {
    if (kind === 'request') {
      const rows = await this.prisma.timeOff.findMany({
        where: { status: 'PENDING', createdAt: { lte: cutoff }, technician: { organizationId, isActive: true } },
        select: {
          id: true,
          createdAt: true,
          startDate: true,
          endDate: true,
          workingDays: true,
          kind: true,
          spaceId: true,
          technicianId: true,
          technician: { select: { firstName: true, lastName: true, spaceAssignments: { select: { spaceId: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_ITEMS,
      });
      const cover = needCover ? await this.coverShort(organizationId, rows) : new Map<string, boolean>();
      return rows.map((t) => ({
        itemId: t.id,
        since: t.createdAt,
        subjectId: t.technicianId,
        subjectName: personName(t.technician),
        facts: {
          spaceIds: t.spaceId ? [t.spaceId] : t.technician.spaceAssignments.map((a) => a.spaceId),
          days: t.workingDays ?? Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86_400_000) + 1,
          coverShort: cover.get(t.id) ?? false,
        },
      }));
    }
    if (kind === 'expense') {
      const rows = await this.prisma.assetMoney.findMany({
        where: { organizationId, status: 'SUBMITTED', createdAt: { lte: cutoff } },
        select: { id: true, createdAt: true, amountCents: true, authorId: true, assetId: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_ITEMS,
      });
      // The asset's workspace is its KIND's; the author is a plain id — both read in one query each.
      const [assets, authors] = await Promise.all([
        this.prisma.asset.findMany({
          where: { id: { in: [...new Set(rows.map((m) => m.assetId))] } },
          select: { id: true, category: { select: { spaceId: true } } },
        }),
        this.prisma.user.findMany({
          where: { id: { in: [...new Set(rows.map((m) => m.authorId).filter(Boolean) as string[])] } },
          select: { id: true, firstName: true, lastName: true },
        }),
      ]);
      const spaceOf = new Map(assets.map((a) => [a.id, a.category?.spaceId ?? null]));
      const nameOf = new Map(authors.map((a) => [a.id, personName(a)]));
      return rows.map((m) => ({
        itemId: m.id,
        since: m.createdAt,
        subjectId: m.authorId,
        subjectName: m.authorId ? (nameOf.get(m.authorId) ?? '') : '',
        facts: { spaceIds: spaceOf.get(m.assetId) ? [spaceOf.get(m.assetId)!] : [], amountCents: m.amountCents },
      }));
    }
    // Overtime: the formal round waiting for a leader — keyed by its shift, like the second step.
    const rows = await this.prisma.overtimeRequest.findMany({
      where: {
        organizationId,
        status: 'PENDING_APPROVAL',
        OR: [{ technicianRespondedAt: { lte: cutoff } }, { technicianRespondedAt: null, createdAt: { lte: cutoff } }],
      },
      select: {
        timeEntryId: true,
        createdAt: true,
        technicianRespondedAt: true,
        locationId: true,
        maxDurationMinutes: true,
        technicianId: true,
        technician: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ITEMS,
    });
    return rows.map((o) => ({
      itemId: o.timeEntryId,
      since: o.technicianRespondedAt ?? o.createdAt,
      subjectId: o.technicianId,
      subjectName: personName(o.technician),
      facts: { spaceIds: [o.locationId], minutes: o.maxDurationMinutes ?? null },
    }));
  }

  /** The wallchart's verdict for pending LEAVE, only when a rule asks about cover. */
  private async coverShort(
    organizationId: string,
    rows: Array<{ id: string; technicianId: string; startDate: Date; endDate: Date; kind: string }>,
  ): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    try {
      // CoverService lives with the technicians; asked through the container, never imported into this module.
      const cover = this.moduleRef.get(CoverService, { strict: false });
      const leave = rows.filter((r) => r.kind === ABSENCE_WHERE.kind);
      const verdicts = await cover.assessMany(
        organizationId,
        leave.map((r) => ({ id: r.id, technicianId: r.technicianId, startDate: r.startDate, endDate: r.endDate })),
      );
      for (const [id, v] of verdicts)
        out.set(
          id,
          (v as { level?: string } | null)?.level === 'short' || (v as { level?: string } | null)?.level === 'skill',
        );
    } catch {
      // Unreadable cover: a cover-only rule does not fire, rather than firing on a guess.
    }
    return out;
  }
}
