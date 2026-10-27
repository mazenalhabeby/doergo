import { ApprovalEscalationService } from './approval-escalation.service';
import { RuleFactsReader } from './rule-facts.reader';

/*
  When nobody answers. The sweep reminds the usual deciders (never anybody on
  leave), then passes it to the escalation role — each ONCE, claimed by the
  notice insert, and only for items a rule applies to.
*/
describe('ApprovalEscalationService.sweep', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const rule = {
    id: 'r1',
    organizationId: 'o',
    kind: 'expense',
    spaceId: null,
    minMinutes: null,
    minDays: null,
    minAmountCents: 20000,
    whenCoverShort: false,
    secondRoleId: null,
    remindAfterHours: 4,
    escalateAfterHours: 24,
    escalateRoleId: 'finance',
    isActive: true,
  };
  let notices: Array<{ kind: string; itemId: string; stage: string }>;
  const prisma: any = {
    approvalRule: { findMany: jest.fn() },
    approvalStep: { findMany: jest.fn(async () => openSteps) },
    organization: { findUnique: jest.fn(async () => ({ timezone: 'Europe/Vienna' })) },
    // Who is away today (nobody is reminded on holiday).
    timeOff: { findMany: jest.fn(async () => away.map((technicianId) => ({ technicianId }))) },
    assetMoney: { findMany: jest.fn() },
    asset: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', category: { spaceId: 's1' } }]) },
    // Two reads: the people an item is about, and the holders of the escalation role (`roleHolderIds`, an OR).
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        where.OR ? holders.map((id) => ({ id })) : [{ id: 'driver', firstName: 'Dan', lastName: 'D' }],
      ),
    },
    approvalNotice: {
      findMany: jest.fn(async () => notices),
      create: jest.fn(async ({ data }: any) => {
        if (notices.some((n) => n.itemId === data.itemId && n.stage === data.stage)) throw new Error('unique');
        notices.push(data);
        return data;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        notices = notices.filter((n) => !(n.itemId === where.itemId && n.stage === where.stage));
        return { count: 1 };
      }),
    },
  };
  let holders = ['fin1'];
  let openSteps: unknown[] = [];
  let away: string[] = [];
  const route: any = {
    route: jest.fn().mockResolvedValue({
      deciders: [
        { id: 'mgr', onLeave: false },
        { id: 'away', onLeave: true },
      ],
      moreDeciders: 0,
      told: [],
    }),
  };
  const notifications: any = { emit: jest.fn() };
  const svc = new ApprovalEscalationService(prisma, route, new RuleFactsReader(prisma, {} as any), notifications);
  const slip = (id: string, ageH: number, cents: number) => ({
    id,
    createdAt: hoursAgo(ageH),
    amountCents: cents,
    authorId: 'driver',
    assetId: 'a1',
  });

  beforeEach(() => {
    notices = [];
    holders = ['fin1'];
    openSteps = [];
    away = [];
    jest.clearAllMocks();
    // Two reads: the rules that remind/escalate, and (for half-way items) the rules that ask more people.
    prisma.approvalRule.findMany.mockImplementation(async ({ where }: any) =>
      where.secondRoleId ? [{ ...rule, secondRoleId: 'finance' }] : [rule],
    );
  });

  it('after the reminder hours: the usual deciders, nobody on leave, once', async () => {
    prisma.assetMoney.findMany.mockResolvedValue([slip('e1', 5, 30000)]);
    expect(await svc.sweep(now)).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_reminder',
      expect.objectContaining({ recipientIds: ['mgr'], stage: 'REMIND', itemId: 'e1', subjectName: 'Dan D' }),
    );
    expect(await svc.sweep(now)).toBe(0);
  });

  it('half-way through its approvals: the reminder goes to whom it still waits for, never to who approved', async () => {
    openSteps = [{ itemId: 'e5', requiredRoleIds: ['finance'], doneRoleIds: [], approverIds: ['mgr'] }];
    // The manager who gave step 1 also holds Finance: never reminded about what they already approved.
    holders = ['fin1', 'mgr'];
    prisma.assetMoney.findMany.mockResolvedValue([slip('e5', 5, 30000)]);
    expect(await svc.sweep(now)).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_reminder',
      expect.objectContaining({ recipientIds: ['fin1'], stage: 'REMIND', itemId: 'e5' }),
    );
  });

  it('half-way: a holder of the missing role who is on leave today is not reminded', async () => {
    openSteps = [{ itemId: 'e6', requiredRoleIds: ['finance'], doneRoleIds: [], approverIds: ['mgr'] }];
    holders = ['fin1', 'fin2'];
    away = ['fin1'];
    prisma.assetMoney.findMany.mockResolvedValue([slip('e6', 5, 30000)]);
    await svc.sweep(now);
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_reminder',
      expect.objectContaining({ recipientIds: ['fin2'], stage: 'REMIND' }),
    );
  });

  it('an escalation never reaches somebody on leave, or who already approved it', async () => {
    openSteps = [{ itemId: 'e7', requiredRoleIds: ['finance'], doneRoleIds: [], approverIds: ['fin2'] }];
    holders = ['fin1', 'fin2', 'fin3'];
    away = ['fin3'];
    prisma.assetMoney.findMany.mockResolvedValue([slip('e7', 30, 30000)]);
    await svc.sweep(now);
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_reminder',
      expect.objectContaining({ recipientIds: ['fin1'], stage: 'ESCALATE' }),
    );
  });

  it('after the escalation hours: passed to the role, once — and no reminder after that', async () => {
    prisma.assetMoney.findMany.mockResolvedValue([slip('e2', 30, 30000)]);
    expect(await svc.sweep(now)).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_reminder',
      expect.objectContaining({ recipientIds: ['fin1'], stage: 'ESCALATE' }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'o', id: { notIn: ['driver'] } }) }),
    );
    expect(await svc.sweep(now)).toBe(0);
  });

  it('an escalation to a role nobody holds falls back to the usual deciders', async () => {
    holders = [];
    prisma.assetMoney.findMany.mockResolvedValue([slip('e4', 30, 30000)]);
    expect(await svc.sweep(now)).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith(
      'approval_reminder',
      expect.objectContaining({ recipientIds: ['mgr'], stage: 'ESCALATE' }),
    );
  });

  it('an item the rule does not apply to is left alone', async () => {
    prisma.assetMoney.findMany.mockResolvedValue([slip('e3', 30, 5000)]);
    expect(await svc.sweep(now)).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('nobody to tell today (everyone on leave): the notice is not used up — said once they are back', async () => {
    holders = [];
    route.route.mockResolvedValueOnce({ deciders: [{ id: 'away', onLeave: true }], moreDeciders: 0, told: [] });
    prisma.assetMoney.findMany.mockResolvedValue([slip('e6', 5, 30000)]);
    expect(await svc.sweep(now)).toBe(0);
    expect(notices).toHaveLength(0);
    expect(await svc.sweep(now)).toBe(1);
  });

  it('nobody able to receive it at all (everyone already approved): said once, never claimed again each sweep', async () => {
    holders = ['mgr'];
    openSteps = [{ itemId: 'e7', requiredRoleIds: ['finance'], doneRoleIds: [], approverIds: ['mgr'] }];
    route.route.mockResolvedValueOnce({ deciders: [{ id: 'mgr', onLeave: false }], moreDeciders: 0, told: [] });
    prisma.assetMoney.findMany.mockResolvedValue([slip('e7', 5, 30000)]);
    expect(await svc.sweep(now)).toBe(0);
    expect(notices).toHaveLength(1);
    expect(prisma.approvalNotice.deleteMany).not.toHaveBeenCalled();
  });
});
