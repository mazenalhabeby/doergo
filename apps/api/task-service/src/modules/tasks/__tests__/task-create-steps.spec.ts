import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { resolveCreatePlacement, settleCreateSpace, writeCreateAssignees } from '../task-create-steps';

jest.mock('../../../common/space-workflow.util', () => ({
  resolveSpaceDefaultWorkflowId: jest.fn().mockResolvedValue('wf-space'),
  listSpaceWorkflowIds: jest.fn().mockResolvedValue([]),
}));

const space = { organizationId: 'org', lat: 1, lng: 2, address: 'Main St', workflowId: null };

describe('task create steps', () => {
  it('a SPACE-scoped member with exactly one workspace gets it; with two is asked', async () => {
    const one: any = { spaceAssignment: { findMany: jest.fn().mockResolvedValue([{ spaceId: 's1' }]) } };
    const data: any = { taskCreationScope: 'SPACE', userId: 'u', organizationId: 'org' };
    await settleCreateSpace(one, data, false);
    expect(data.spaceId).toBe('s1');

    const two: any = {
      spaceAssignment: { findMany: jest.fn().mockResolvedValue([{ spaceId: 'a' }, { spaceId: 'b' }]) },
    };
    await expect(settleCreateSpace(two, { taskCreationScope: 'SPACE' }, false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('an un-triaged request stays space-less', async () => {
    const prisma: any = { companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'def' }) } };
    const data: any = { organizationId: 'org' };
    await settleCreateSpace(prisma, data, true);
    expect(data.spaceId).toBeUndefined();
    await settleCreateSpace(prisma, data, false);
    expect(data.spaceId).toBe('def');
  });

  it('fills the location from the space only when none was given', async () => {
    const prisma: any = { companyLocation: { findUnique: jest.fn().mockResolvedValue(space) } };
    const p = await resolveCreatePlacement(prisma, { spaceId: 's', organizationId: 'org' });
    expect(p).toMatchObject({
      locationLat: 1,
      locationAddress: 'Main St',
      effectiveOrgId: 'org',
      spaceWorkflowId: 'wf-space',
    });
    const kept = await resolveCreatePlacement(prisma, { spaceId: 's', organizationId: 'org', locationAddress: 'Here' });
    expect(kept.locationAddress).toBe('Here');
    expect(kept.locationLat).toBeUndefined();
  });

  it('a foreign space: 404 without any relationship, owner org with a create grant', async () => {
    const prisma: any = {
      companyLocation: { findUnique: jest.fn().mockResolvedValue({ ...space, organizationId: 'owner' }) },
    };
    await expect(resolveCreatePlacement(prisma, { spaceId: 's', organizationId: 'org' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const access = { perSpace: { s: { canCreateTasks: true } } };
    const p = await resolveCreatePlacement(prisma, { spaceId: 's', organizationId: 'org', access });
    expect(p.effectiveOrgId).toBe('owner');
  });

  it('the named primary becomes LEAD, added when missing from the list', async () => {
    const tx: any = { taskAssignee: { createMany: jest.fn(), create: jest.fn().mockResolvedValue({}) } };
    await writeCreateAssignees(tx, 't', ['a', 'b'], 'a');
    expect(tx.taskAssignee.createMany.mock.calls[0][0].data).toEqual([
      { taskId: 't', userId: 'a', role: 'LEAD' },
      { taskId: 't', userId: 'b', role: 'MEMBER' },
    ]);
    expect(tx.taskAssignee.create).not.toHaveBeenCalled();
    await writeCreateAssignees(tx, 't', [], 'c');
    expect(tx.taskAssignee.create).toHaveBeenCalledWith({ data: { taskId: 't', userId: 'c', role: 'LEAD' } });
  });
});
