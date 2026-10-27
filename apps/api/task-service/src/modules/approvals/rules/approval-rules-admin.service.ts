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
import { roleCanDecide, ruleKindsByRole } from './rule-role-deciders';

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
      /*
        Held in some workspaces only: their own rules, AND the every-workspace ones — read-only (\`editable: false\`),
        because those apply in their workspaces too and the page would otherwise say "only the first approval"
        where the company already asks for more. Never another workspace's.
      */
      where: { organizationId, ...(spaceIds ? { OR: [{ spaceId: { in: spaceIds } }, { spaceId: null }] } : {}) },
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
      editable: !spaceIds || (!!r.spaceId && spaceIds.includes(r.spaceId)),
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
    // The role it asks must be able to give that approval — else its items wait for somebody who cannot.
    if (second.id && !(await roleCanDecide(this.prisma, organizationId, second.id, input.kind, space.id ?? null)))
      throw new BadRequestException({
        message: RULE_MESSAGES.RULE_ROLE_CANNOT_DECIDE,
        code: 'RULE_ROLE_CANNOT_DECIDE',
      });
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
      // An edit that says nothing about on/off keeps it as it is; a new rule starts on.
      ...(input.isActive != null || !id ? { isActive: input.isActive ?? true } : {}),
    };
    if (id) {
      /*
        Items half-way through keep the approvals already given: every decision recomputes what the rules ask NOW
        (approval-rules.service `gate`), so an edit, a switch-off or a delete never sends people back to step 1.
      */
      const { count } = await this.prisma.approvalRule.updateMany({ where: { id, organizationId }, data });
      if (!count) throw new NotFoundException('Rule not found');
      return { id };
    }
    return this.prisma.approvalRule.create({
      data: { ...data, organizationId, createdById: userId },
      select: { id: true },
    });
  }

  /** Which rule kinds each role's holders could approve — the rules page marks a role that cannot. */
  roleKinds(organizationId: string, roleIds: string[]) {
    return ruleKindsByRole(this.prisma, organizationId, roleIds);
  }

  async deleteRule(organizationId: string, id: string, spaceIds?: string[]): Promise<{ deleted: true }> {
    if (spaceIds) await this.assertRuleInScope(organizationId, id, spaceIds);
    const { count } = await this.prisma.approvalRule.deleteMany({ where: { id, organizationId } });
    if (!count) throw new NotFoundException('Rule not found');
    // Items half-way under it keep what was given; the next decision is judged by the rules that remain.
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
