import { ApprovalStepsReader } from './approval-steps-reader';

/*
  The inbox's "needs …" reads the rules the way the gate does: as they are NOW, against the facts the item was
  last judged on — a limit raised since means nobody else is waited for; a role added since is shown.
*/
describe('ApprovalStepsReader.steps', () => {
  const rule = (id: string, roleId: string, minMinutes: number | null) => ({
    id,
    organizationId: 'o',
    kind: 'overtime',
    spaceId: null,
    minMinutes,
    minDays: null,
    minAmountCents: null,
    secondRoleId: roleId,
    isActive: true,
    createdAt: new Date(0),
  });
  const step = (facts: unknown, done: string[] = [], required = ['role-hr']) => ({
    kind: 'overtime',
    itemId: 'e1',
    firstById: 'leader',
    requiredRoleIds: required,
    doneRoleIds: done,
    approverIds: ['leader'],
    minutes: 90,
    facts,
  });
  function make(steps: unknown[], rules: unknown[], caller: unknown = null) {
    const prisma: any = {
      approvalStep: { findMany: jest.fn().mockResolvedValue(steps) },
      approvalRule: { findMany: jest.fn().mockResolvedValue(rules) },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'leader', firstName: 'Anna', lastName: 'M' }]),
        findFirst: jest.fn().mockResolvedValue(caller),
      },
      accessRole: {
        findMany: jest.fn(async ({ where }: any) =>
          where.id.in.map((id: string) => ({ id, name: id === 'role-hr' ? 'HR' : 'Finance' })),
        ),
      },
    };
    return new ApprovalStepsReader(prisma);
  }
  const ask = [{ kind: 'overtime' as const, itemId: 'e1' }];

  it('names the roles still needed for the facts it was judged on', async () => {
    const got = await make([step({ spaceIds: ['s1'], minutes: 180 })], [rule('r1', 'role-hr', 120)]).steps('o', ask);
    expect(got).toEqual([
      { kind: 'overtime', itemId: 'e1', firstById: 'leader', firstByName: 'Anna M', roleName: 'HR', agreedMinutes: 90 },
    ]);
  });

  it('a limit raised since: nobody else is waited for, so the item shows no "needs …"', async () => {
    const got = await make([step({ spaceIds: ['s1'], minutes: 180 })], [rule('r1', 'role-hr', 240)]).steps('o', ask);
    expect(got).toEqual([]);
  });

  it('a rule added since: its role is shown too, minus what was already given', async () => {
    const rules = [rule('r1', 'role-hr', 120), rule('r2', 'role-fin', 60)];
    const got = await make([step({ spaceIds: ['s1'], minutes: 180 }, ['role-hr'])], rules).steps('o', ask);
    expect(got[0]?.roleName).toBe('Finance');
  });

  it('a step from before the facts were stored reads the roles active rules still name', async () => {
    const got = await make([step(null, [], ['role-hr', 'role-fin'])], [rule('r1', 'role-hr', 120)]).steps('o', ask);
    expect(got[0]?.roleName).toBe('HR');
  });

  describe('for one caller (real use: David could not tell which of 174 waited for him)', () => {
    const person = (over: object = {}) => ({
      id: 'david',
      role: 'EMPLOYEE',
      isActive: true,
      memberRoleId: null,
      memberRole: null,
      spaceAssignments: [],
      ...over,
    });
    const hr = [rule('r1', 'role-hr', 60)];
    const facts = { spaceIds: ['s1'], minutes: 90 };

    it('holds the role still needed (org-wide) → waits for them, and their approval finishes it', async () => {
      const got = await make(
        [step(facts)],
        hr,
        person({ memberRoleId: 'role-hr', memberRole: { isActive: true } }),
      ).steps('o', ask, 'david');
      expect(got[0]).toMatchObject({ agreedMinutes: 90, waitsForCaller: true, callerFinishes: true });
    });

    it('holds it only in ANOTHER workspace → not theirs', async () => {
      const got = await make(
        [step(facts)],
        hr,
        person({ spaceAssignments: [{ roleId: 'role-hr', spaceId: 's2' }] }),
      ).steps('o', ask, 'david');
      expect(got[0]).toMatchObject({ waitsForCaller: false, callerFinishes: false });
    });

    it('holds it in the item’s workspace → theirs', async () => {
      const got = await make(
        [step(facts)],
        hr,
        person({ spaceAssignments: [{ roleId: 'role-hr', spaceId: 's1' }] }),
      ).steps('o', ask, 'david');
      expect(got[0]).toMatchObject({ waitsForCaller: true });
    });

    it('already approved → never asked again, even holding the role', async () => {
      const got = await make(
        [step(facts)],
        hr,
        person({ id: 'leader', memberRoleId: 'role-hr', memberRole: { isActive: true } }),
      ).steps('o', ask, 'leader');
      expect(got[0]).toMatchObject({ waitsForCaller: false, callerFinishes: false });
    });

    it('an active administrator finishes it; an inactive one does not', async () => {
      expect((await make([step(facts)], hr, person({ role: 'ADMIN' })).steps('o', ask, 'david'))[0]).toMatchObject({
        callerFinishes: true,
      });
      expect(
        (await make([step(facts)], hr, person({ role: 'ADMIN', isActive: false })).steps('o', ask, 'david'))[0],
      ).toMatchObject({ callerFinishes: false });
    });

    it('two roles still needed: holding one waits for them but does not finish it', async () => {
      const two = [rule('r1', 'role-hr', 60), rule('r2', 'role-fin', 60)];
      const got = await make(
        [step(facts, [], ['role-hr', 'role-fin'])],
        two,
        person({ memberRoleId: 'role-hr', memberRole: { isActive: true } }),
      ).steps('o', ask, 'david');
      expect(got[0]).toMatchObject({ waitsForCaller: true, callerFinishes: false });
    });
  });
});
