import { ApprovalRulesService } from './approval-rules.service';

/*
  Office rules, at the gate every rule-bound approve path calls. These pin the
  behaviour that makes a rule real: step 1 is recorded and nothing is written,
  the SAME person cannot finish it, somebody without the role cannot either,
  the role holder finishes it (never above the first person's minutes), an
  administrator finishes at once, and a rejection drops the open step.
*/
describe('ApprovalRulesService.gate', () => {
  const rule = {
    id: 'r1',
    organizationId: 'o',
    kind: 'overtime',
    spaceId: null,
    minMinutes: 120,
    minDays: null,
    minAmountCents: null,
    secondRoleId: 'role-mgr',
    isActive: true,
  };
  let steps: any[];
  /** Who holds which role: org-wide, or [role, workspace] pairs. */
  let holds: Record<string, { org?: string; spaces?: Array<[string, string]> }>;
  const prisma: any = {
    approvalRule: { findMany: jest.fn() },
    approvalStep: {
      // Newest first, as `openStep` orders them.
      findMany: jest.fn(async ({ where }: any) =>
        steps.filter((s) => where.itemId.in.includes(s.itemId) && !s.consumedAt).reverse(),
      ),
      createMany: jest.fn(async ({ data }: any) => {
        for (const d of data)
          steps.push({
            id: `s${steps.length}`,
            doneRoleIds: [],
            approverIds: [],
            firstAt: new Date(),
            ...d,
            consumedAt: null,
          });
        return { count: data.length };
      }),
      create: jest.fn(async ({ data }: any) => {
        steps.push({
          id: `s${steps.length}`,
          doneRoleIds: [],
          approverIds: [],
          requiredRoleIds: [],
          firstAt: new Date(),
          ...data,
          consumedAt: null,
        });
        return steps[steps.length - 1];
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
        const hit = steps.filter(
          (s) =>
            (!where.id || s.id === where.id) &&
            (!where.itemId || (where.itemId.in ? where.itemId.in.includes(s.itemId) : s.itemId === where.itemId)) &&
            (!('consumedAt' in where) || !s.consumedAt) &&
            (!where.doneRoleIds || same(s.doneRoleIds, where.doneRoleIds.equals)),
        );
        hit.forEach((s) => Object.assign(s, data));
        return { count: hit.length };
      }),
    },
    user: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'mgr' }]) },
    approvalDelegation: { count: jest.fn() },
    accessRole: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Space Manager' }),
      findMany: jest.fn(async ({ where }: any) =>
        where.id.in.map((id: string) => ({ id, name: id === 'role-fin' ? 'Finance' : 'Space Manager' })),
      ),
    },
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
    holds = { mgr: { org: 'role-mgr' } };
    prisma.approvalDelegation.count.mockResolvedValue(0);
    // user.findFirst answers two questions: the decider's role, and which of the roles they hold (`heldRoleIds`).
    prisma.user.findFirst.mockImplementation(async ({ where, select }: any) => {
      if (select?.spaceAssignments) {
        const h = holds[where.id];
        if (!h) return null;
        const w = select.spaceAssignments.where;
        return {
          memberRoleId: h.org ?? null,
          memberRole: { isActive: true },
          spaceAssignments: (h.spaces ?? [])
            .filter(([r, sp]) => w.roleId.in.includes(r) && w.spaceId.in.includes(sp))
            .map(([roleId]) => ({ roleId })),
        };
      }
      return {
        role: where.id.endsWith('owner') ? 'ADMIN' : 'EMPLOYEE',
        firstName: where.id,
        lastName: '',
        isActive: where.id !== 'gone-owner',
      };
    });
  });

  it('under the threshold: finishes as always', async () => {
    expect(await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 90 }, deciderId: 'leader' })).toEqual({
      finalize: true,
    });
    expect(steps).toHaveLength(0);
  });

  it('over it: step 1 is recorded, nothing finishes, the role holders are told', async () => {
    const v = await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    expect(v).toEqual({ finalize: false, roleName: 'Space Manager' });
    expect(steps).toHaveLength(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_second_step',
      expect.objectContaining({ recipientIds: ['mgr'], itemId: 'entry1' }),
    );
  });

  it('the same person cannot finish it; somebody without the role cannot either', async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    await expect(
      svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' }),
    ).rejects.toMatchObject({ response: { code: 'SECOND_STEP_SAME_PERSON' } });
    await expect(
      svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'colleague' }),
    ).rejects.toMatchObject({ response: { code: 'SECOND_STEP_REQUIRED' } });
    expect(steps[0].consumedAt).toBeNull();
  });

  it('the role holder finishes it — never above what the first person agreed', async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 150 }, deciderId: 'leader' });
    const v = await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 240 }, deciderId: 'mgr' });
    expect(v).toEqual({ finalize: true, minutes: 150, stepId: 's0' });
    expect(steps[0].consumedAt).not.toBeNull();
  });

  it("a workspace role counts only in the item's workspace", async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    holds.siteMgr = { spaces: [['role-mgr', 's1']] };
    expect(await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'siteMgr' })).toEqual({
      finalize: true,
      minutes: 180,
      stepId: 's0',
    });
  });

  it('an administrator finishes at once', async () => {
    expect(await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 600 }, deciderId: 'owner' })).toEqual({
      finalize: true,
    });
  });

  it("a DEACTIVATED administrator finishes nothing — the step opens like anybody else's", async () => {
    const v = await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 600 }, deciderId: 'gone-owner' });
    expect(v).toEqual({ finalize: false, roleName: 'Space Manager' });
  });

  it('the cap is the SMALLEST minutes any approver agreed to — and the rule is judged on the whole', async () => {
    // Earlier rounds take the shift to 3 h; this round agrees 50 min. The rule (over 2 h) applies; the cap is 50.
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, agreeMinutes: 50, deciderId: 'leader' });
    expect(steps[0].minutes).toBe(50);
    const v = await svc['gate']({
      ...base,
      facts: { spaceIds: ['s1'], minutes: 180 },
      agreeMinutes: 90,
      deciderId: 'mgr',
    });
    expect(v).toEqual({ finalize: true, minutes: 50, stepId: 's0' });
  });

  /*
    ⚠️ decide(): the write runs only when every approval is in, and a write that fails opens the step again —
    the approvals already given stay, and the people who gave them may try again.
  */
  it('decide() writes nothing while waiting, and keeps the approvals when the write fails', async () => {
    const write = jest.fn(async () => 'written');
    const first = await svc.decide({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' }, write);
    expect(first).toEqual({ waiting: { stage: 'FIRST_STEP', waitingFor: 'Space Manager' } });
    expect(write).not.toHaveBeenCalled();
    const boom = jest.fn(async () => {
      throw new Error('the write failed');
    });
    await expect(
      svc.decide({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' }, boom),
    ).rejects.toThrow('the write failed');
    expect(steps[0].consumedAt).toBeNull();
    // Every role is given: the retry is the same decision — the manager who approved may finish it.
    await expect(
      svc.decide({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' }, write),
    ).resolves.toEqual({ done: 'written' });
  });

  it('a rejection drops the open step', async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    await svc.clear('o', 'overtime', 'entry1');
    expect(steps[0].consumedAt).not.toBeNull();
  });

  it('a rejection of a run drops the step whichever of its days it was opened under', async () => {
    await svc['gate']({ ...base, itemId: 'day1', facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    await svc.clear('o', 'overtime', ['day1', 'day2', 'day3']);
    expect(steps[0].consumedAt).not.toBeNull();
  });

  it("EVERY rule that applies counts: a workspace rule adds an approver, it never takes the company's away", async () => {
    // Company: over 2 h → Finance. The Depot's own: over 2 h → Space Manager. Both are needed, by two people.
    prisma.approvalRule.findMany.mockResolvedValue([
      { ...rule, id: 'company', secondRoleId: 'role-fin' },
      { ...rule, id: 'depot', spaceId: 's1', secondRoleId: 'role-mgr' },
    ]);
    holds.fin = { org: 'role-fin' };
    const facts = { spaceIds: ['s1'], minutes: 180 };
    expect(await svc['gate']({ ...base, facts, deciderId: 'leader' })).toEqual({
      finalize: false,
      roleName: 'Space Manager + Finance',
    });
    expect(await svc['gate']({ ...base, facts, deciderId: 'mgr' })).toEqual({ finalize: false, roleName: 'Finance' });
    await expect(svc['gate']({ ...base, facts, deciderId: 'mgr' })).rejects.toMatchObject({
      response: { code: 'SECOND_STEP_SAME_PERSON' },
    });
    expect(await svc['gate']({ ...base, facts, deciderId: 'fin' })).toEqual({
      finalize: true,
      minutes: 180,
      stepId: 's0',
    });
  });

  it('a step opened under an earlier id of the item (a run that grew) is found and follows the item', async () => {
    await svc['gate']({ ...base, itemId: 'day1', facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    const v = await svc['gate']({
      ...base,
      itemId: 'day2',
      itemAliases: ['day1'],
      facts: { spaceIds: ['s1'], minutes: 180 },
      deciderId: 'mgr',
    });
    expect(v).toMatchObject({ finalize: true });
    expect(steps).toHaveLength(1);
  });

  it('a rule for one workspace leaves the others alone', async () => {
    prisma.approvalRule.findMany.mockResolvedValue([{ ...rule, spaceId: 's9' }]);
    expect(await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 600 }, deciderId: 'leader' })).toEqual({
      finalize: true,
    });
  });
  it('a leader and the stand-in deciding with their authority are ONE approver, not two', async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    prisma.approvalDelegation.count.mockResolvedValue(1);
    await expect(
      svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' }),
    ).rejects.toMatchObject({ response: { code: 'SECOND_STEP_SAME_PERSON' } });
    expect(prisma.approvalDelegation.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'o' }) }),
    );
  });

  it('the facts it was judged on are stored on the step (the inbox reads the rules against them)', async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    expect(steps[0].facts).toEqual({ spaceIds: ['s1'], minutes: 180 });
  });

  it('two runs that became one: the newest step stands, the older is closed (never a unique-index crash)', async () => {
    await svc['gate']({ ...base, itemId: 'day1', facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    await svc['gate']({ ...base, itemId: 'day3', facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader2' });
    const v = await svc['gate']({
      ...base,
      itemId: 'day3',
      itemAliases: ['day1'],
      facts: { spaceIds: ['s1'], minutes: 180 },
      deciderId: 'mgr',
    });
    expect(v).toMatchObject({ finalize: true, stepId: 's1' });
    expect(steps.every((st) => st.consumedAt)).toBe(true);
  });

  it('nobody holds the role for this workspace: the administrators are told — it never waits for nobody', async () => {
    prisma.user.findMany.mockImplementation(async ({ where }: any) =>
      where.role === 'ADMIN' ? [{ id: 'owner' }] : [],
    );
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_second_step',
      expect.objectContaining({ recipientIds: ['owner'] }),
    );
  });

  it('decide(): the item decided or removed meanwhile (404 / 409) — the step is NOT opened again', async () => {
    const { ConflictException } = jest.requireActual('@nestjs/common');
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    const gone = jest.fn(async () => {
      throw new ConflictException('already decided');
    });
    await expect(
      svc.decide({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' }, gone),
    ).rejects.toThrow('already decided');
    expect(steps[0].consumedAt).not.toBeNull();
  });
  it('somebody gave the same approval a moment ago: refused, nothing given twice (SECOND_STEP_TAKEN)', async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    prisma.approvalStep.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' }),
    ).rejects.toMatchObject({ response: { code: 'SECOND_STEP_TAKEN' } });
  });

  it('two people approving first at once: the second is judged as the next approval, never a second step 1', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const taken = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
    prisma.approvalStep.create.mockImplementationOnce(async ({ data }: any) => {
      // Somebody else's step lands first.
      steps.push({
        ...data,
        id: 'other',
        doneRoleIds: [],
        approverIds: ['leader'],
        requiredRoleIds: ['role-mgr'],
        firstAt: new Date(),
        firstById: 'leader',
        consumedAt: null,
      });
      throw taken;
    });
    const v = await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' });
    expect(v).toMatchObject({ finalize: true, stepId: 'other' });
  });

  it('any other error creating the step is thrown — never retried as if somebody went first', async () => {
    prisma.approvalStep.create.mockRejectedValueOnce(new Error('database down'));
    await expect(
      svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' }),
    ).rejects.toThrow('database down');
  });

  it('reopen: a step opened meanwhile (unique index) is fine; any other failure is thrown, not swallowed', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    prisma.approvalStep.updateMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(svc.reopen('s0')).resolves.toBeUndefined();
    prisma.approvalStep.updateMany.mockRejectedValueOnce(new Error('database down'));
    await expect(svc.reopen('s0')).rejects.toThrow('database down');
  });

  it('no rule of the kind at all: finished with one query, no step read', async () => {
    prisma.approvalRule.findMany.mockResolvedValue([]);
    expect(await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 600 }, deciderId: 'leader' })).toEqual({
      finalize: true,
    });
    expect(prisma.approvalStep.findMany).not.toHaveBeenCalled();
  });

  it('the stand-in check covers the whole wait — from the first approval, ended stand-ins included', async () => {
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' });
    const where = prisma.approvalDelegation.count.mock.calls[0][0].where;
    expect(where.endsOn.gte.getTime()).toBeLessThanOrEqual(steps[0].firstAt?.getTime?.() ?? Date.now());
    expect(where.OR).toEqual([{ revokedAt: null }, { revokedAt: { gte: expect.any(Date) } }]);
  });

  it('a batch of new items (days typed in together): judged at once, steps opened together, told once', async () => {
    const items = [
      { itemId: 'd1', facts: { spaceIds: ['s1'], minutes: 60 } },
      { itemId: 'd2', facts: { spaceIds: ['s1'], minutes: 180 } },
      { itemId: 'd3', facts: { spaceIds: ['s1'], minutes: 240 } },
    ];
    const finished = await svc.firstOfMany(
      { organizationId: 'o', kind: 'overtime', deciderId: 'leader', subjectId: 'worker' },
      items,
    );
    expect(finished).toEqual(['d1']);
    expect(steps.map((st) => st.itemId)).toEqual(['d2', 'd3']);
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    // An administrator finishes the whole batch.
    expect(await svc.firstOfMany({ organizationId: 'o', kind: 'overtime', deciderId: 'owner' }, items)).toEqual([
      'd1',
      'd2',
      'd3',
    ]);
  });

  it('a batch reaching two workspaces tells each group once — the second is never left silent', async () => {
    const items = [
      { itemId: 'w1', facts: { spaceIds: ['s1'], minutes: 180 } },
      { itemId: 'w2', facts: { spaceIds: ['s1'], minutes: 240 } },
      { itemId: 'w3', facts: { spaceIds: ['s2'], minutes: 240 } },
    ];
    await svc.firstOfMany({ organizationId: 'o', kind: 'overtime', deciderId: 'leader', subjectId: 'worker' }, items);
    expect(notifications.emit).toHaveBeenCalledTimes(2);
  });

  it('decide(): changed meanwhile (new hours, new dates) — the approvals END: they were given for what it was', async () => {
    const { ChangedMeanwhileException } = jest.requireActual('./already-decided');
    await svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'leader' });
    const moved = jest.fn(async () => {
      throw new ChangedMeanwhileException('moved');
    });
    await expect(
      svc.decide({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' }, moved),
    ).rejects.toThrow('moved');
    expect(steps[0].consumedAt).not.toBeNull();
  });

  it('a "finished" step only this person ever approved is no way to finish alone', async () => {
    steps.push({
      id: 'solo',
      itemId: 'entry1',
      firstById: 'mgr',
      approverIds: ['mgr'],
      doneRoleIds: ['role-mgr'],
      requiredRoleIds: ['role-mgr'],
      firstAt: new Date(),
      consumedAt: null,
    });
    await expect(
      svc['gate']({ ...base, facts: { spaceIds: ['s1'], minutes: 180 }, deciderId: 'mgr' }),
    ).rejects.toMatchObject({ response: { code: 'SECOND_STEP_SAME_PERSON' } });
  });
});
