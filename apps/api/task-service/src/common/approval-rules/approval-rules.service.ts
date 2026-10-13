import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  personName,
  pickRule,
  ruleInputProblem,
  type ApprovalRuleInput,
  type ApprovalRuleView,
  type ApprovalStepView,
  type RuleFacts,
  type RuleKind,
} from '@hbcfield/shared';
import { PrismaService } from '../prisma/prisma.service';

/** What a decision's approve path learns from the gate. */
export type GateVerdict =
  | { finalize: true; minutes?: number }
  | { finalize: false; roleName: string };

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

  async gate(input: {
    organizationId: string;
    kind: RuleKind;
    itemId: string;
    facts: RuleFacts;
    deciderId: string;
    subjectId?: string | null;
    subjectName?: string | null;
  }, retried = false): Promise<GateVerdict> {
    // Only rules with a SECOND STEP gate a decision; reminder-only rules are the sweep's.
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId: input.organizationId, kind: input.kind, isActive: true, secondRoleId: { not: null } },
    });
    const open = await this.openStep(input.organizationId, input.kind, input.itemId);
    // Rules changed since step 1: the step's own rule still governs it, if it exists.
    const rule = (open && rules.find((r) => r.id === open.ruleId)) || pickRule(rules as never[], input.facts) as (typeof rules)[number] | null;
    if (!rule) {
      if (open) await this.consume(open.id);
      return { finalize: true };
    }

    const decider = await this.prisma.user.findFirst({
      where: { id: input.deciderId, organizationId: input.organizationId },
      select: { role: true, firstName: true, lastName: true },
    });
    const secondRoleId = rule.secondRoleId as string;
    const roleName = await this.roleName(secondRoleId);

    if (decider?.role === 'ADMIN') {
      if (open) await this.consume(open.id);
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
      throw new ConflictException({ message: `This needs a second approval by ${roleName}.`, code: 'SECOND_STEP_SAME_PERSON', params: { role: roleName } });
    }
    if (!(await this.holdsRole(input.organizationId, input.deciderId, secondRoleId, input.facts.spaceIds))) {
      throw new ForbiddenException({ message: `The second approval is for ${roleName}.`, code: 'SECOND_STEP_REQUIRED', params: { role: roleName } });
    }
    // Claimed, not read-then-written: two second approvals cannot both finish it.
    const { count } = await this.prisma.approvalStep.updateMany({ where: { id: open.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (!count) throw new ConflictException({ message: 'Somebody else decided this a moment ago.', code: 'SECOND_STEP_TAKEN' });
    // Overtime: never more than the first person agreed to.
    const minutes = open.minutes != null && input.facts.minutes != null ? Math.min(open.minutes, input.facts.minutes) : undefined;
    return { finalize: true, ...(minutes != null ? { minutes } : {}) };
  }

  /** Would a decision like this need a second approval, and by which role? For the member's pre-check. */
  async secondStepFor(organizationId: string, kind: RuleKind, facts: RuleFacts): Promise<string | null> {
    const rules = await this.prisma.approvalRule.findMany({ where: { organizationId, kind, isActive: true, secondRoleId: { not: null } } });
    const rule = pickRule(rules as never[], facts) as (typeof rules)[number] | null;
    return rule?.secondRoleId ? this.roleName(rule.secondRoleId) : null;
  }

  /** Does any active rule of this kind ask about cover? (Cover is only computed then.) */
  async asksAboutCover(organizationId: string): Promise<boolean> {
    return (await this.prisma.approvalRule.count({ where: { organizationId, kind: 'request', isActive: true, whenCoverShort: true } })) > 0;
  }

  /** A rejection — by anybody who may decide — ends the two-step for this item. */
  async clear(organizationId: string, kind: RuleKind, itemId: string): Promise<void> {
    await this.prisma.approvalStep.updateMany({ where: { organizationId, kind, itemId, consumedAt: null }, data: { consumedAt: new Date() } });
  }

  /** The open first steps for these items, for the inbox. ONE query each for steps, people and roles. */
  async steps(organizationId: string, items: Array<{ kind: RuleKind; itemId: string }>): Promise<ApprovalStepView[]> {
    if (!items.length) return [];
    const rows = await this.prisma.approvalStep.findMany({
      where: { organizationId, consumedAt: null, OR: items.slice(0, 2000).map((i) => ({ kind: i.kind, itemId: i.itemId })) },
      select: { kind: true, itemId: true, firstById: true, ruleId: true },
    });
    if (!rows.length) return [];
    const [people, rules] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.firstById))] } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.approvalRule.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ruleId))] } }, select: { id: true, secondRoleId: true } }),
    ]);
    const roles = await this.prisma.accessRole.findMany({ where: { id: { in: [...new Set(rules.map((r) => r.secondRoleId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
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

  // ── The office's rules ────────────────────────────────────────────────

  async listRules(organizationId: string): Promise<ApprovalRuleView[]> {
    const rules = await this.prisma.approvalRule.findMany({ where: { organizationId }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
    const roleIds = [...new Set(rules.flatMap((r) => [r.secondRoleId, r.escalateRoleId]).filter(Boolean) as string[])];
    const [roles, spaces] = await Promise.all([
      this.prisma.accessRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }),
      this.prisma.companyLocation.findMany({ where: { id: { in: rules.map((r) => r.spaceId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    ]);
    return rules.map((r) => ({
      id: r.id,
      kind: r.kind as RuleKind,
      spaceId: r.spaceId,
      spaceName: spaces.find((s) => s.id === r.spaceId)?.name ?? null,
      minMinutes: r.minMinutes,
      minDays: r.minDays,
      minAmountCents: r.minAmountCents,
      whenCoverShort: r.whenCoverShort,
      secondRoleId: r.secondRoleId,
      secondRoleName: roles.find((x) => x.id === r.secondRoleId)?.name ?? null,
      remindAfterHours: r.remindAfterHours,
      escalateAfterHours: r.escalateAfterHours,
      escalateRoleId: r.escalateRoleId,
      escalateRoleName: roles.find((x) => x.id === r.escalateRoleId)?.name ?? null,
      isActive: r.isActive,
    }));
  }

  async saveRule(organizationId: string, userId: string, input: ApprovalRuleInput, id?: string): Promise<{ id: string }> {
    const problem = ruleInputProblem(input);
    if (problem) throw new BadRequestException({ message: RULE_MESSAGES[problem], code: problem });
    // Any of the organization's SHARED roles — never somebody's personal role.
    const sharedRole = (id: string) => this.prisma.accessRole.findFirst({ where: { id, organizationId, personalAssignmentId: null }, select: { id: true } });
    const [second, escalate, space] = await Promise.all([
      input.secondRoleId ? sharedRole(input.secondRoleId) : Promise.resolve({ id: null }),
      input.escalateRoleId ? sharedRole(input.escalateRoleId) : Promise.resolve({ id: null }),
      input.spaceId ? this.prisma.companyLocation.findFirst({ where: { id: input.spaceId, organizationId }, select: { id: true } }) : Promise.resolve({ id: null }),
    ]);
    if (!second || !escalate) throw new BadRequestException({ message: RULE_MESSAGES.RULE_ROLE_REQUIRED, code: 'RULE_ROLE_REQUIRED' });
    if (!space) throw new NotFoundException('Workspace not found');
    const data = {
      kind: input.kind,
      spaceId: input.spaceId ?? null,
      minMinutes: input.kind === 'overtime' ? input.minMinutes ?? null : null,
      minDays: input.kind === 'request' ? input.minDays ?? null : null,
      minAmountCents: input.kind === 'expense' ? input.minAmountCents ?? null : null,
      whenCoverShort: input.kind === 'request' ? input.whenCoverShort === true : false,
      secondRoleId: input.secondRoleId || null,
      remindAfterHours: input.remindAfterHours ?? null,
      escalateAfterHours: input.escalateAfterHours ?? null,
      escalateRoleId: input.escalateRoleId || null,
      isActive: input.isActive ?? true,
    };
    if (id) {
      const { count } = await this.prisma.approvalRule.updateMany({ where: { id, organizationId }, data });
      if (!count) throw new NotFoundException('Rule not found');
      // Switched off: items half-way under it finish on their next approval, and stop saying "needs …" now.
      if (!data.isActive) await this.closeStepsOf(organizationId, id);
      return { id };
    }
    return this.prisma.approvalRule.create({ data: { ...data, organizationId, createdById: userId }, select: { id: true } });
  }

  async deleteRule(organizationId: string, id: string): Promise<{ deleted: true }> {
    const { count } = await this.prisma.approvalRule.deleteMany({ where: { id, organizationId } });
    if (!count) throw new NotFoundException('Rule not found');
    // Items half-way under it finish on their next approval, and stop saying "needs …" now.
    await this.closeStepsOf(organizationId, id);
    return { deleted: true };
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private openStep(organizationId: string, kind: RuleKind, itemId: string) {
    return this.prisma.approvalStep.findFirst({ where: { organizationId, kind, itemId, consumedAt: null } });
  }

  private async closeStepsOf(organizationId: string, ruleId: string) {
    await this.prisma.approvalStep.updateMany({ where: { organizationId, ruleId, consumedAt: null }, data: { consumedAt: new Date() } });
  }

  private async consume(id: string) {
    await this.prisma.approvalStep.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
  }

  private async roleName(roleId: string): Promise<string> {
    return (await this.prisma.accessRole.findUnique({ where: { id: roleId }, select: { name: true } }))?.name ?? '';
  }

  /** Holds the role org-wide, or as a workspace role in one of the item's workspaces — and it is active. */
  private async holdsRole(organizationId: string, userId: string, roleId: string, spaceIds: string[]): Promise<boolean> {
    const now = new Date();
    const [org, space] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, organizationId, isActive: true, memberRoleId: roleId, memberRole: { isActive: true } }, select: { id: true } }),
      spaceIds.length
        ? this.prisma.spaceAssignment.findFirst({
            where: { userId, organizationId, roleId, spaceId: { in: spaceIds }, role: { isActive: true }, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return !!org || !!space;
  }

  /** Active holders of a role — org-wide, or as a workspace role in one of these workspaces. */
  async holdersOf(organizationId: string, roleId: string, spaceIds: string[], exclude: string[] = []): Promise<string[]> {
    const now = new Date();
    const holders = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        id: { notIn: exclude },
        OR: [
          { memberRoleId: roleId, memberRole: { isActive: true } },
          ...(spaceIds.length
            ? [{ spaceAssignments: { some: { roleId, spaceId: { in: spaceIds }, role: { isActive: true }, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } } }]
            : []),
        ],
      },
      select: { id: true },
      take: 50,
    });
    return holders.map((h) => h.id);
  }

  /** Push the holders of the second role (never the first approver or the person it is about). */
  private async tellSecondStep(roleId: string, input: { organizationId: string; kind: RuleKind; itemId: string; facts: RuleFacts; deciderId: string; subjectId?: string | null; subjectName?: string | null }, firstName: string) {
    try {
      const recipientIds = await this.holdersOf(input.organizationId, roleId, input.facts.spaceIds, [input.deciderId, ...(input.subjectId ? [input.subjectId] : [])]);
      if (!recipientIds.length) return;
      this.notifications.emit('approval_second_step', {
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

const RULE_MESSAGES: Record<string, string> = {
  RULE_KIND_INVALID: 'Rules exist for overtime, requests and expenses.',
  RULE_THRESHOLD_INVALID: 'The threshold is not a valid number.',
  RULE_ROLE_REQUIRED: 'Choose one of the organization\'s roles.',
  RULE_EMPTY: 'A rule needs a second approval, a reminder or an escalation.',
  RULE_HOURS_INVALID: 'Hours must be a whole number between 1 and 720.',
  RULE_ESCALATE_ROLE_REQUIRED: 'Choose who it passes to when nobody answers.',
};
