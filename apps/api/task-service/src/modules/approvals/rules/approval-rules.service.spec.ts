import { ApprovalRulesService } from './approval-rules.service';

/*
  Office rules, at the gate every rule-bound approve path calls. These pin the
  behaviour that makes a rule real: step 1 is recorded and nothing is written,
  the SAME person cannot finish it, somebody without the role cannot either,
  the role holder finishes it (never above the first person's minutes), an
  administrator finishes at once, and a rejection drops the open step.
*/
describe('ApprovalRulesService.gate', () => {
  const rule = { id: 'r1', organizationId: 'o', kind: 'overtime', spaceId: null, minMinutes: 120, minDays: null, minAmountCents: null, secondRoleId: 'role-mgr', isActive: true };
  let steps: any[];
  const prisma: any = {
    approvalRule: { findMany: jest.fn() },
    approvalStep: {
      findFirst: jest.fn(async ({ where }: any) => steps.find((s) => s.itemId === where.itemId && !s.consumedAt) ?? null),
      create: jest.fn(async ({ data }: any) => { steps.push({ id: `s${steps.length}`, ...data, consumedAt: null }); return steps[steps.length - 1]; }),
      updateMany: jest.fn(async ({ where }: any) => {
        const hit = steps.filter((s) => (!where.id || s.id === where.id) && (!where.itemId || s.itemId === where.itemId) && !s.consumedAt);
        hit.forEach((s) => (s.consumedAt = new Date()));
        return { count: hit.length };
      }),
    },
    user: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'mgr' }]) },
    spaceAssignment: { findFirst: jest.fn() },
    accessRole: { findUnique: jest.fn().mockResolvedValue({ name: 'Space Manager' }) },
  };
  const notifications: any = { emit: jest.fn() };
  const svc = new ApprovalRulesService(prisma, notifications);
  const base = { organizationId: 'o', kind: 'overtime' as const, itemId: 'entry1', subjectId: 'worker' };

  beforeEach(() => {
    steps = [];
    jest.clearAllMocks();
    prisma.approvalRule.findMany.mockResolvedValue([rule]);
    prisma.accessRole.findUnique.mockResolvedValue({ name: 'Space Manager' });
    prisma.user.findMany.mockResolvedValue([{ id: 'mgr' }]);
    // user.findFirst answers two questions: the decider's role, and "holds the role org-wide".
    prisma.user.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.memberRoleId) return where.id === 'mgr' ? { id: 'mgr' } : null;
      return { role: where.id === 'owner' ? 'ADMIN' : 'EMPLOYEE', firstName: where.id, lastName: '' };
    });
    prisma.spaceAssignment.findFirst.mockResolvedValue(null);
  });

  it('under the threshold: finishes as always', async () => {
    expect(await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 90 }, deciderId: 'leader' })).toEqual({ finalize: true });
    expect(steps).toHaveLength(0);
  });

  it('over it: step 1 is recorded, nothing finishes, the role holders are told', async () => {
    const v = await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    expect(v).toEqual({ finalize: false, roleName: 'Space Manager' });
    expect(steps).toHaveLength(1);
    expect(notifications.emit).toHaveBeenCalledWith('approval_second_step', expect.objectContaining({ recipientIds: ['mgr'], itemId: 'entry1' }));
  });

  it('the same person cannot finish it; somebody without the role cannot either', async () => {
    await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    await expect(svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' }))
      .rejects.toMatchObject({ response: { code: 'SECOND_STEP_SAME_PERSON' } });
    await expect(svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'colleague' }))
      .rejects.toMatchObject({ response: { code: 'SECOND_STEP_REQUIRED' } });
    expect(steps[0].consumedAt).toBeNull();
  });

  it('the role holder finishes it — never above what the first person agreed', async () => {
    await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 150 }, deciderId: 'leader' });
    const v = await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 240 }, deciderId: 'mgr' });
    expect(v).toEqual({ finalize: true, minutes: 150 });
    expect(steps[0].consumedAt).not.toBeNull();
  });

  it('a workspace role counts only in the item\'s workspace', async () => {
    await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    prisma.spaceAssignment.findFirst.mockImplementation(async ({ where }: any) =>
      where.userId === 'siteMgr' && where.spaceId.in.includes('s1') ? { id: 'a' } : null);
    expect(await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'siteMgr' })).toEqual({ finalize: true, minutes: 180 });
  });

  it('an administrator finishes at once', async () => {
    expect(await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 600 }, deciderId: 'owner' })).toEqual({ finalize: true });
  });

  it('a rejection drops the open step', async () => {
    await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    await svc.clear('o', 'overtime', 'entry1');
    expect(steps[0].consumedAt).not.toBeNull();
  });

  it('a rule for one workspace leaves the others alone', async () => {
    prisma.approvalRule.findMany.mockResolvedValue([{ ...rule, spaceId: 's9' }]);
    expect(await svc.gate({ ...base, facts: { spaceIds: ['s1'], minutes: 600 }, deciderId: 'leader' })).toEqual({ finalize: true });
  });
});
