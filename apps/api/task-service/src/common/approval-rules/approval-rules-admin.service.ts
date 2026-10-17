import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ruleInputProblem, type ApprovalRuleInput, type ApprovalRuleView, type RuleKind } from '@hbcfield/shared';
import { RULE_MESSAGES } from './approval-rules-helpers';
import { ApprovalRulesBase } from './approval-rules.base';

/**
 * The office rules themselves: listing, saving and deleting them (closing the
 * steps a removed rule left open).
 */
@Injectable()
export class ApprovalRulesAdminService extends ApprovalRulesBase {
  // ── The office's rules ────────────────────────────────────────────────

  async listRules(organizationId: string): Promise<ApprovalRuleView[]> {
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
    const roleIds = [...new Set(rules.flatMap((r) => [r.secondRoleId, r.escalateRoleId]).filter(Boolean) as string[])];
    const [roles, spaces] = await Promise.all([
      this.prisma.accessRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }),
      this.prisma.companyLocation.findMany({
        where: { id: { in: rules.map((r) => r.spaceId).filter(Boolean) as string[] } },
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
      isActive: r.isActive,
    }));
  }

  async saveRule(
    organizationId: string,
    userId: string,
    input: ApprovalRuleInput,
    id?: string,
  ): Promise<{ id: string }> {
    const problem = ruleInputProblem(input);
    if (problem) throw new BadRequestException({ message: RULE_MESSAGES[problem], code: problem });
    // Any of the organization's SHARED roles — never somebody's personal role.
    const sharedRole = (id: string) =>
      this.prisma.accessRole.findFirst({
        where: { id, organizationId, personalAssignmentId: null },
        select: { id: true },
      });
    const [second, escalate, space] = await Promise.all([
      input.secondRoleId ? sharedRole(input.secondRoleId) : Promise.resolve({ id: null }),
      input.escalateRoleId ? sharedRole(input.escalateRoleId) : Promise.resolve({ id: null }),
      input.spaceId
        ? this.prisma.companyLocation.findFirst({ where: { id: input.spaceId, organizationId }, select: { id: true } })
        : Promise.resolve({ id: null }),
    ]);
    if (!second || !escalate)
      throw new BadRequestException({ message: RULE_MESSAGES.RULE_ROLE_REQUIRED, code: 'RULE_ROLE_REQUIRED' });
    if (!space) throw new NotFoundException('Workspace not found');
    const data = {
      kind: input.kind,
      spaceId: input.spaceId ?? null,
      minMinutes: input.kind === 'overtime' ? (input.minMinutes ?? null) : null,
      minDays: input.kind === 'request' ? (input.minDays ?? null) : null,
      minAmountCents: input.kind === 'expense' ? (input.minAmountCents ?? null) : null,
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
    return this.prisma.approvalRule.create({
      data: { ...data, organizationId, createdById: userId },
      select: { id: true },
    });
  }

  async deleteRule(organizationId: string, id: string): Promise<{ deleted: true }> {
    const { count } = await this.prisma.approvalRule.deleteMany({ where: { id, organizationId } });
    if (!count) throw new NotFoundException('Rule not found');
    // Items half-way under it finish on their next approval, and stop saying "needs …" now.
    await this.closeStepsOf(organizationId, id);
    return { deleted: true };
  }
}
