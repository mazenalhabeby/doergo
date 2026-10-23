import { ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  personName,
  pickRule,
  type ApprovalStepView,
  type RuleFacts,
  type RuleKind,
  roleNames,
  peopleNames,
  personRoleAndName,
  activeWindowWhere,
  SERVICE_NAMES,
  holdsOrgRole,
  roleNameOf,
  roleHolderIds,
  PrismaService,
} from '@hbcfield/shared';
import { emitEvent, approvalSecondStepEvent } from '@hbcfield/shared/microservices';
import { GateVerdict } from './approval-rules-helpers';
import { consumeStep, openStep } from './approval-steps';

export { type GateVerdict } from './approval-rules-helpers';

/**
 * OFFICE RULES, enforced where the decision is made (shared `approval-rules.ts`).
 *
 * Each kind's approve path calls `gate()` after its own permission and
 * second-party checks and before it writes. No rule applies → it finishes as
 * always. A rule applies →
 *   • nobody has approved yet: this approval is recorded as step 1, the item
 *     stays waiting, and the holders of the rule's role are told;
 *   • step 1 is recorded: only somebody ELSE holding the role finishes it
 *     (`SECOND_STEP_SAME_PERSON` / `SECOND_STEP_REQUIRED` otherwise).
 * An administrator finishes at once. A rejection, by anybody who may decide,
 * drops the open step (`clear`).
 *
 * ⚠️ One OPEN step per item is a partial unique index: two people approving
 * first at the same moment cannot both "go first".
 */
@Injectable()
export class ApprovalRulesService {
  private readonly logger = new Logger(ApprovalRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  async gate(
    input: {
      organizationId: string;
      kind: RuleKind;
      itemId: string;
      facts: RuleFacts;
      deciderId: string;
      subjectId?: string | null;
      subjectName?: string | null;
    },
    retried = false,
  ): Promise<GateVerdict> {
    // Only rules with a SECOND STEP gate a decision; reminder-only rules are the sweep's.
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId: input.organizationId, kind: input.kind, isActive: true, secondRoleId: { not: null } },
    });
    const open = await openStep(this.prisma, input.organizationId, input.kind, input.itemId);
    // Rules changed since step 1: the step's own rule still governs it, if it exists.
    const rule =
      (open && rules.find((r) => r.id === open.ruleId)) ||
      (pickRule(rules as never[], input.facts) as (typeof rules)[number] | null);
    if (!rule) {
      if (open) await consumeStep(this.prisma, open.id);
      return { finalize: true };
    }

    const decider = await personRoleAndName(this.prisma, input.deciderId, input.organizationId);
    const secondRoleId = rule.secondRoleId as string;
    const roleName = await this.roleName(secondRoleId);

    if (decider?.role === 'ADMIN') {
      if (open) await consumeStep(this.prisma, open.id);
      return { finalize: true };
    }

    if (!open) {
      try {
        await this.prisma.approvalStep.create({
          data: {
            organizationId: input.organizationId,
            kind: input.kind,
            itemId: input.itemId,
            ruleId: rule.id,
            firstById: input.deciderId,
            minutes: input.facts.minutes ?? null,
          },
        });
      } catch (e) {
        // Somebody went first a moment ago: this is now the second step, judged as one (once).
        if (retried) throw e;
        return this.gate(input, true);
      }
      await this.tellSecondStep(secondRoleId, input, decider ? personName(decider) : '');
      return { finalize: false, roleName };
    }

    if (open.firstById === input.deciderId) {
      throw new ConflictException({
        message: `This needs a second approval by ${roleName}.`,
        code: 'SECOND_STEP_SAME_PERSON',
        params: { role: roleName },
      });
    }
    if (!(await this.holdsRole(input.organizationId, input.deciderId, secondRoleId, input.facts.spaceIds))) {
      throw new ForbiddenException({
        message: `The second approval is for ${roleName}.`,
        code: 'SECOND_STEP_REQUIRED',
        params: { role: roleName },
      });
    }
    // Claimed, not read-then-written: two second approvals cannot both finish it.
    const { count } = await this.prisma.approvalStep.updateMany({
      where: { id: open.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (!count)
      throw new ConflictException({ message: 'Somebody else decided this a moment ago.', code: 'SECOND_STEP_TAKEN' });
    // Overtime: never more than the first person agreed to.
    const minutes =
      open.minutes != null && input.facts.minutes != null ? Math.min(open.minutes, input.facts.minutes) : undefined;
    return { finalize: true, ...(minutes != null ? { minutes } : {}) };
  }

  /** Would a decision like this need a second approval, and by which role? For the member's pre-check. */
  async secondStepFor(organizationId: string, kind: RuleKind, facts: RuleFacts): Promise<string | null> {
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId, kind, isActive: true, secondRoleId: { not: null } },
    });
    const rule = pickRule(rules as never[], facts) as (typeof rules)[number] | null;
    return rule?.secondRoleId ? this.roleName(rule.secondRoleId) : null;
  }

  /** Does any active rule of this kind ask about cover? (Cover is only computed then.) */
  async asksAboutCover(organizationId: string): Promise<boolean> {
    return (
      (await this.prisma.approvalRule.count({
        where: { organizationId, kind: 'request', isActive: true, whenCoverShort: true },
      })) > 0
    );
  }

  /** A rejection — by anybody who may decide — ends the two-step for this item. */
  async clear(organizationId: string, kind: RuleKind, itemId: string): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, kind, itemId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /** The open first steps for these items, for the inbox. ONE query each for steps, people and roles. */
  async steps(organizationId: string, items: Array<{ kind: RuleKind; itemId: string }>): Promise<ApprovalStepView[]> {
    if (!items.length) return [];
    const rows = await this.prisma.approvalStep.findMany({
      where: {
        organizationId,
        consumedAt: null,
        OR: items.slice(0, 2000).map((i) => ({ kind: i.kind, itemId: i.itemId })),
      },
      select: { kind: true, itemId: true, firstById: true, ruleId: true },
    });
    if (!rows.length) return [];
    const [people, rules] = await Promise.all([
      peopleNames(this.prisma, [...new Set(rows.map((r) => r.firstById))]),
      this.prisma.approvalRule.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.ruleId))] } },
        select: { id: true, secondRoleId: true },
      }),
    ]);
    const roles = await roleNames(this.prisma, [
      ...new Set(rules.map((r) => r.secondRoleId).filter(Boolean) as string[]),
    ]);
    const personById = new Map(people.map((p) => [p.id, personName(p)]));
    const roleByRule = new Map(rules.map((r) => [r.id, roles.find((x) => x.id === r.secondRoleId)?.name ?? '']));
    return rows.map((r) => ({
      kind: r.kind as RuleKind,
      itemId: r.itemId,
      firstById: r.firstById,
      firstByName: personById.get(r.firstById) ?? '',
      roleName: roleByRule.get(r.ruleId) ?? '',
    }));
  }

  // ── who holds the second step's role, and telling them ─────────────────

  private async roleName(roleId: string): Promise<string> {
    return roleNameOf(this.prisma, roleId);
  }

  /** Holds the role org-wide, or as a workspace role in one of the item's workspaces — and it is active. */
  private async holdsRole(
    organizationId: string,
    userId: string,
    roleId: string,
    spaceIds: string[],
  ): Promise<boolean> {
    const now = new Date();
    const [org, space] = await Promise.all([
      holdsOrgRole(this.prisma, userId, organizationId, roleId),
      spaceIds.length
        ? this.prisma.spaceAssignment.findFirst({
            where: {
              userId,
              organizationId,
              roleId,
              spaceId: { in: spaceIds },
              role: { isActive: true },
              ...activeWindowWhere(now),
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return !!org || !!space;
  }

  /** Active holders of a role — org-wide, or as a workspace role in one of these workspaces. */
  async holdersOf(
    organizationId: string,
    roleId: string,
    spaceIds: string[],
    exclude: string[] = [],
  ): Promise<string[]> {
    const now = new Date();
    return roleHolderIds(this.prisma, { organizationId, roleId, spaceIds, exclude, now });
  }

  /** Push the holders of the second role (never the first approver or the person it is about). */
  private async tellSecondStep(
    roleId: string,
    input: {
      organizationId: string;
      kind: RuleKind;
      itemId: string;
      facts: RuleFacts;
      deciderId: string;
      subjectId?: string | null;
      subjectName?: string | null;
    },
    firstName: string,
  ) {
    try {
      const recipientIds = await this.holdersOf(input.organizationId, roleId, input.facts.spaceIds, [
        input.deciderId,
        ...(input.subjectId ? [input.subjectId] : []),
      ]);
      if (!recipientIds.length) return;
      emitEvent(this.notifications, approvalSecondStepEvent, {
        organizationId: input.organizationId,
        recipientIds,
        kind: input.kind,
        itemId: input.itemId,
        firstName,
        subjectName: input.subjectName ?? '',
      });
    } catch (e) {
      this.logger.warn(`second-step notice failed: ${(e as Error).message}`);
    }
  }
}
