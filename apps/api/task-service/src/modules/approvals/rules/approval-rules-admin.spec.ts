import { NotFoundException } from '@nestjs/common';
import { ApprovalRulesAdminService } from './approval-rules-admin.service';

/*
  Saving an office rule. The input is checked by the shared `ruleInputProblem`
  (its own tests in shared); here: only this organization's SHARED roles and
  workspaces may be named, a threshold belongs to its kind only, another
  organization's rule reads as missing, and switching a rule off or deleting it
  closes the steps it left open — an item must not go on saying "needs …".
*/
const ORG = 'org-1';
const rule = { kind: 'overtime' as const, minMinutes: 120, secondRoleId: 'role-mgr' };

function setup() {
  const prisma: any = {
    approvalRule: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async () => ({ id: 'r-new' })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    approvalStep: { updateMany: jest.fn() },
    accessRole: {
      findFirst: jest.fn(async ({ where }: any) => (where.id.startsWith('role-') ? { id: where.id } : null)),
      findMany: jest.fn().mockResolvedValue([]),
    },
    companyLocation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'site' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return { prisma, svc: new ApprovalRulesAdminService(prisma) };
}

describe('saving an office rule', () => {
  it('an invalid rule is refused with its code, nothing written', async () => {
    const { prisma, svc } = setup();
    await expect(svc.saveRule(ORG, 'u1', { kind: 'overtime', minMinutes: 120 } as any)).rejects.toMatchObject({
      response: { code: 'RULE_EMPTY' },
    });
    await expect(svc.saveRule(ORG, 'u1', { kind: 'payroll' } as any)).rejects.toMatchObject({
      response: { code: 'RULE_KIND_INVALID' },
    });
    expect(prisma.approvalRule.create).not.toHaveBeenCalled();
  });

  it("a role must be one of THIS organization's shared roles — never a personal one", async () => {
    const { prisma, svc } = setup();
    await expect(svc.saveRule(ORG, 'u1', { ...rule, secondRoleId: 'someone-elses' })).rejects.toMatchObject({
      response: { code: 'RULE_ROLE_REQUIRED' },
    });
    expect(prisma.accessRole.findFirst.mock.calls[0][0].where).toEqual({
      id: 'someone-elses',
      organizationId: ORG,
      personalAssignmentId: null,
    });
    expect(prisma.approvalRule.create).not.toHaveBeenCalled();
  });

  it('the escalation role is checked the same way', async () => {
    const { svc } = setup();
    const input = { kind: 'request' as const, escalateAfterHours: 24, escalateRoleId: 'nope' };
    await expect(svc.saveRule(ORG, 'u1', input)).rejects.toMatchObject({ response: { code: 'RULE_ROLE_REQUIRED' } });
  });

  it("a workspace must be this organization's", async () => {
    const { prisma, svc } = setup();
    prisma.companyLocation.findFirst.mockResolvedValueOnce(null);
    await expect(svc.saveRule(ORG, 'u1', { ...rule, spaceId: 'theirs' })).rejects.toThrow(NotFoundException);
    expect(prisma.companyLocation.findFirst.mock.calls[0][0].where).toEqual({ id: 'theirs', organizationId: ORG });
  });

  it('only the threshold of its own kind is kept; cover applies to requests only', async () => {
    const { prisma, svc } = setup();
    await svc.saveRule(ORG, 'u1', { ...rule, minDays: 3, minAmountCents: 500, whenCoverShort: true });
    expect(prisma.approvalRule.create.mock.calls[0][0].data).toMatchObject({
      kind: 'overtime',
      minMinutes: 120,
      minDays: null,
      minAmountCents: null,
      whenCoverShort: false,
      spaceId: null,
      isActive: true,
      organizationId: ORG,
      createdById: 'u1',
    });

    await svc.saveRule(ORG, 'u1', {
      kind: 'request',
      minDays: 3,
      minMinutes: 60,
      whenCoverShort: true,
      secondRoleId: 'role-hr',
    });
    expect(prisma.approvalRule.create.mock.calls[1][0].data).toMatchObject({
      minDays: 3,
      minMinutes: null,
      whenCoverShort: true,
    });
  });

  it("editing another organization's rule reads as missing", async () => {
    const { prisma, svc } = setup();
    prisma.approvalRule.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.saveRule(ORG, 'u1', rule, 'r1')).rejects.toThrow(NotFoundException);
    expect(prisma.approvalRule.updateMany.mock.calls[0][0].where).toEqual({ id: 'r1', organizationId: ORG });
    expect(prisma.approvalStep.updateMany).not.toHaveBeenCalled();
  });

  it('switching a rule off closes its open steps; editing an active one leaves them', async () => {
    const { prisma, svc } = setup();
    await svc.saveRule(ORG, 'u1', rule, 'r1');
    expect(prisma.approvalStep.updateMany).not.toHaveBeenCalled();
    await svc.saveRule(ORG, 'u1', { ...rule, isActive: false }, 'r1');
    expect(prisma.approvalStep.updateMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      ruleId: 'r1',
      consumedAt: null,
    });
  });
});

describe('deleting an office rule', () => {
  it('closes the steps it left open', async () => {
    const { prisma, svc } = setup();
    await expect(svc.deleteRule(ORG, 'r1')).resolves.toEqual({ deleted: true });
    expect(prisma.approvalRule.deleteMany.mock.calls[0][0].where).toEqual({ id: 'r1', organizationId: ORG });
    expect(prisma.approvalStep.updateMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      ruleId: 'r1',
      consumedAt: null,
    });
  });

  it("another organization's rule: 404, no step touched", async () => {
    const { prisma, svc } = setup();
    prisma.approvalRule.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.deleteRule(ORG, 'r1')).rejects.toThrow(NotFoundException);
    expect(prisma.approvalStep.updateMany).not.toHaveBeenCalled();
  });
});

describe('listing office rules', () => {
  it('names the roles and workspaces, and asks only for the ones used', async () => {
    const { prisma, svc } = setup();
    prisma.approvalRule.findMany.mockResolvedValueOnce([
      { id: 'r1', kind: 'overtime', spaceId: 'site', secondRoleId: 'role-mgr', escalateRoleId: null, isActive: true },
    ]);
    prisma.accessRole.findMany.mockResolvedValueOnce([{ id: 'role-mgr', name: 'Site Manager' }]);
    prisma.companyLocation.findMany.mockResolvedValueOnce([{ id: 'site', name: 'Depot' }]);
    const [view] = await svc.listRules(ORG);
    expect(prisma.approvalRule.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG });
    expect(prisma.companyLocation.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['site'] } });
    expect(view).toMatchObject({ spaceName: 'Depot', secondRoleName: 'Site Manager', escalateRoleName: null });
  });
});
