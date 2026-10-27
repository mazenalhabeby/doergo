import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  noticeDue,
  orgTimezone,
  pickRule,
  roleHolderIds,
  runWithCronLock,
  type NoticeStage,
  type RuleKind,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { ApprovalRouteService } from './approval-route.service';
import { RuleFactsReader, type RuleItem } from './rule-facts.reader';
import { emitEvent, approvalReminderEvent } from '@hbcfield/shared/microservices';
import { awayOn, leaveDay } from './away-today';
import { rolesStillNeeded, stepRules } from './approval-steps';

/**
 * WHEN NOBODY ANSWERS (shared `approval-rules.ts` → `noticeDue`).
 *
 * Every 10 minutes, under the cron lease: for each organization with a rule
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
    private readonly route: ApprovalRouteService,
    private readonly facts: RuleFactsReader,
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
    const rules = (
      await this.prisma.approvalRule.findMany({
        where: { isActive: true, OR: [{ remindAfterHours: { not: null } }, { escalateAfterHours: { not: null } }] },
      })
    ).map((r) => ({ ...r, kind: r.kind as RuleKind }));
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
        const items = await this.facts.read(
          organizationId,
          kind,
          { waitingBefore: cutoff },
          group.some((r) => r.whenCoverShort),
        );
        if (!items.length) continue;
        const notices = await this.prisma.approvalNotice.findMany({
          where: { kind, itemId: { in: items.map((i) => i.itemId) } },
          select: { itemId: true, stage: true },
        });
        // Items half-way through their approvals: the reminder goes to whom they still wait for, never to the
        // people who already approved (one query for the kind).
        const half = new Map(
          (
            await this.prisma.approvalStep.findMany({
              where: { organizationId, kind, itemId: { in: items.map((i) => i.itemId) }, consumedAt: null },
              select: { itemId: true, requiredRoleIds: true, doneRoleIds: true, approverIds: true, facts: true },
            })
          ).map((st) => [st.itemId, st]),
        );
        const gating = half.size ? await stepRules(this.prisma, organizationId, [kind]) : [];
        // The organization's zone, read once for the group when a half-way reminder needs "on leave today".
        let zone: Promise<string | null> | undefined;
        const zoneOf = () => (zone ??= orgTimezone(this.prisma, organizationId).then((o) => o?.timezone ?? null));
        const sentFor = new Map<string, Set<NoticeStage>>();
        for (const n of notices)
          (sentFor.get(n.itemId) ?? sentFor.set(n.itemId, new Set()).get(n.itemId)!).add(n.stage as NoticeStage);

        // Who to tell is the same for every item of one workspace and person: asked once per sweep.
        const once = new Map<string, Promise<string[]>>();
        const cached = (key: string, read: () => Promise<string[]>) =>
          once.get(key) ?? (once.set(key, read()), once.get(key)!);
        for (const item of items) {
          const rule = pickRule(group, item.facts);
          // A rule is about what is raised from the day it exists: switching one on does not nag about the backlog.
          if (!rule || item.since < rule.createdAt) continue;
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
          const who = `${item.facts.spaceIds.join(',')}|${item.subjectId ?? ''}`;
          let recipientIds =
            stage === 'ESCALATE'
              ? await cached(`${rule.escalateRoleId}|${who}`, () =>
                  roleHolderIds(this.prisma, {
                    organizationId,
                    roleId: rule.escalateRoleId!,
                    spaceIds: item.facts.spaceIds,
                    exclude: item.subjectId ? [item.subjectId] : [],
                    now,
                  }),
                )
              : [];
          // Half-way: whom it still waits for by the rules as they are NOW (the gate's own reading), minus who
          // already approved and anybody on leave today.
          const step = half.get(item.itemId);
          const waitingOn = step ? rolesStillNeeded(step, gating)[0] : undefined;
          if (stage === 'REMIND' && step && waitingOn) {
            const holders = await roleHolderIds(this.prisma, {
              organizationId,
              roleId: waitingOn,
              spaceIds: item.facts.spaceIds,
              exclude: [...step.approverIds, ...(item.subjectId ? [item.subjectId] : [])],
              now,
            });
            const away = await awayOn(this.prisma, holders, leaveDay(now, await zoneOf()));
            recipientIds = holders.filter((id) => !away.has(id));
          }
          // Nobody holds the escalation role (here): it must not vanish — the usual deciders hear instead.
          if (!recipientIds.length)
            recipientIds = (await cached(`usual|${who}`, () => this.usualDeciders(organizationId, kind, item))).filter(
              // Never a reminder to somebody who already approved it (they would be refused).
              (id) => !step?.approverIds.includes(id),
            );
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
  private async usualDeciders(organizationId: string, kind: RuleKind, item: RuleItem): Promise<string[]> {
    const r = await this.route.route({
      organizationId,
      callerId: '',
      kind,
      spaceId: item.facts.spaceIds[0] ?? null,
      subjectUserId: item.subjectId,
    });
    return r.deciders.filter((d) => !d.onLeave).map((d) => d.id);
  }
}
