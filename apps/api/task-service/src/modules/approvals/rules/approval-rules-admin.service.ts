import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ruleInputProblem,
  RULE_LIMITS,
  type ApprovalRuleInput,
  type ApprovalRuleView,
  type RuleKind,
  sharedRoleInOrg,
  roleNames,
  PrismaService,
} from '@hbcfield/shared';
import { RULE_MESSAGES } from './approval-rules-helpers';
import { closeStepsOf } from './approval-steps';

/**
 * The office rules themselves: listing, saving and deleting them (closing the
 * steps a removed rule left open).
 */
@Injectable()
export class ApprovalRulesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── The office's rules ────────────────────────────────────────────────

  async listRules(organizationId: string, spaceIds?: string[]): Promise<ApprovalRuleView[]> {
    const rules = await this.prisma.approvalRule.findMany({
      // Held in some workspaces only: their rules, never the every-workspace ones or another workspace's.
      where: { organizationId, ...(spaceIds ? { spaceId: { in: spaceIds } } : {}) },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
    const roleIds = [...new Set(rules.flatMap((r) => [r.secondRoleId, r.escalateRoleId]).filter(Boolean) as string[])];
    const [roles, spaces, categories] = await Promise.all([
      roleNames(this.prisma, roleIds),
      this.prisma.companyLocation.findMany({
        where: { id: { in: rules.map((r) => r.spaceId).filter(Boolean) as string[] } },
        select: { id: true, name: true },
      }),
      this.prisma.assetCategory.findMany({
        where: { id: { in: rules.map((r) => r.categoryId).filter(Boolean) as string[] } },
        select: { id: true, name: true },
      }),
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
      categoryId: r.categoryId,
      categoryName: categories.find((c) => c.id === r.categoryId)?.name ?? null,
      urgentOnly: r.urgentOnly,
      isActive: r.isActive,
    }));
  }

  async saveRule(
    organizationId: string,
    userId: string,
    input: ApprovalRuleInput,
    id?: string,
    spaceIds?: string[],
  ): Promise<{ id: string }> {
    const problem = ruleInputProblem(input);
    if (problem) throw new BadRequestException({ message: RULE_MESSAGES[problem], code: problem });
    // A workspace-scoped caller writes only their workspaces' rules — the new place AND the rule's current one.
    if (spaceIds) {
      if (!input.spaceId || !spaceIds.includes(input.spaceId)) throw outOfScope();
      if (id) await this.assertRuleInScope(organizationId, id, spaceIds);
    }
    // Any of the organization's SHARED roles — never somebody's personal role.
    const sharedRole = (id: string) => sharedRoleInOrg(this.prisma, id, organizationId);
    const [second, escalate, space, category] = await Promise.all([
      input.secondRoleId ? sharedRole(input.secondRoleId) : Promise.resolve({ id: null }),
      input.escalateRoleId ? sharedRole(input.escalateRoleId) : Promise.resolve({ id: null }),
      input.spaceId
        ? this.prisma.companyLocation.findFirst({ where: { id: input.spaceId, organizationId }, select: { id: true } })
        : Promise.resolve({ id: null }),
      // An asset kind only for asset papers, and only one of this organization's.
      input.kind === 'assetProposal' && input.categoryId
        ? this.prisma.assetCategory.findFirst({ where: { id: input.categoryId, organizationId }, select: { id: true } })
        : Promise.resolve({ id: null }),
    ]);
    if (!category) throw new NotFoundException('Asset kind not found');
    if (!second || !escalate)
      throw new BadRequestException({ message: RULE_MESSAGES.RULE_ROLE_REQUIRED, code: 'RULE_ROLE_REQUIRED' });
    if (!space) throw new NotFoundException('Workspace not found');
    const limit = RULE_LIMITS[input.kind];
    const data = {
      kind: input.kind,
      spaceId: input.spaceId ?? null,
      // Only the limit the kind has (shared RULE_LIMITS) — never a stray number from another kind.
      minMinutes: limit?.field === 'minMinutes' ? (input.minMinutes ?? null) : null,
      minDays: limit?.field === 'minDays' ? (input.minDays ?? null) : null,
      minAmountCents: limit?.field === 'minAmountCents' ? (input.minAmountCents ?? null) : null,
      whenCoverShort: input.kind === 'request' ? input.whenCoverShort === true : false,
      categoryId: input.kind === 'assetProposal' ? (category.id ?? null) : null,
      urgentOnly: input.kind === 'clientRequest' ? input.urgentOnly === true : false,
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
      if (!data.isActive) await closeStepsOf(this.prisma, organizationId, id);
      return { id };
    }
    return this.prisma.approvalRule.create({
      data: { ...data, organizationId, createdById: userId },
      select: { id: true },
    });
  }

  async deleteRule(organizationId: string, id: string, spaceIds?: string[]): Promise<{ deleted: true }> {
    if (spaceIds) await this.assertRuleInScope(organizationId, id, spaceIds);
    const { count } = await this.prisma.approvalRule.deleteMany({ where: { id, organizationId } });
    if (!count) throw new NotFoundException('Rule not found');
    // Items half-way under it finish on their next approval, and stop saying "needs …" now.
    await closeStepsOf(this.prisma, organizationId, id);
    return { deleted: true };
  }

  /** A rule outside the caller's workspaces is "not found" — never a hint that it exists. */
  private async assertRuleInScope(organizationId: string, id: string, spaceIds: string[]): Promise<void> {
    const rule = await this.prisma.approvalRule.findFirst({ where: { id, organizationId }, select: { spaceId: true } });
    if (!rule || !rule.spaceId || !spaceIds.includes(rule.spaceId)) throw new NotFoundException('Rule not found');
  }
}

function outOfScope() {
  return new ForbiddenException({
    message: 'You can set approval rules only for the workspaces where you may manage them.',
    code: 'RULE_OUT_OF_SCOPE',
  });
}
