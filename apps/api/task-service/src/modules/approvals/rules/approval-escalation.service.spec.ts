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
  const rule = { id: 'r1', organizationId: 'o', kind: 'expense', spaceId: null, minMinutes: null, minDays: null, minAmountCents: 20000,
    whenCoverShort: false, secondRoleId: null, remindAfterHours: 4, escalateAfterHours: 24, escalateRoleId: 'finance', isActive: true };
  let notices: Array<{ kind: string; itemId: string; stage: string }>;
  const prisma: any = {
    approvalRule: { findMany: jest.fn() },
    assetMoney: { findMany: jest.fn() },
    asset: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', category: { spaceId: 's1' } }]) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'driver', firstName: 'Dan', lastName: 'D' }]) },
    approvalNotice: {
      findMany: jest.fn(async () => notices),
      create: jest.fn(async ({ data }: any) => {
        if (notices.some((n) => n.itemId === data.itemId && n.stage === data.stage)) throw new Error('unique');
        notices.push(data);
        return data;
      }),
    },
  };
  const rules: any = { holdersOf: jest.fn().mockResolvedValue(['fin1']) };
  const route: any = { route: jest.fn().mockResolvedValue({ deciders: [{ id: 'mgr', onLeave: false }, { id: 'away', onLeave: true }], moreDeciders: 0, told: [] }) };
  const notifications: any = { emit: jest.fn() };
  const svc = new ApprovalEscalationService(prisma, rules, route, new RuleFactsReader(prisma, {} as any), notifications);
  const slip = (id: string, ageH: number, cents: number) => ({ id, createdAt: hoursAgo(ageH), amountCents: cents, authorId: 'driver', assetId: 'a1' });

  beforeEach(() => {
    notices = [];
    jest.clearAllMocks();
    prisma.approvalRule.findMany.mockResolvedValue([rule]);
  });

  it('after the reminder hours: the usual deciders, nobody on leave, once', async () => {
    prisma.assetMoney.findMany.mockResolvedValue([slip('e1', 5, 30000)]);
    expect(await svc.sweep(now)).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith('approval_reminder', expect.objectContaining({ recipientIds: ['mgr'], stage: 'REMIND', itemId: 'e1', subjectName: 'Dan D' }));
    expect(await svc.sweep(now)).toBe(0);
  });

  it('after the escalation hours: passed to the role, once — and no reminder after that', async () => {
    prisma.assetMoney.findMany.mockResolvedValue([slip('e2', 30, 30000)]);
    expect(await svc.sweep(now)).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith('approval_reminder', expect.objectContaining({ recipientIds: ['fin1'], stage: 'ESCALATE' }));
    expect(rules.holdersOf).toHaveBeenCalledWith('o', 'finance', ['s1'], ['driver']);
    expect(await svc.sweep(now)).toBe(0);
  });

  it('an escalation to a role nobody holds falls back to the usual deciders', async () => {
    rules.holdersOf.mockResolvedValueOnce([]);
    prisma.assetMoney.findMany.mockResolvedValue([slip('e4', 30, 30000)]);
    expect(await svc.sweep(now)).toBe(1);
    expect(notifications.emit).toHaveBeenCalledWith('approval_reminder', expect.objectContaining({ recipientIds: ['mgr'], stage: 'ESCALATE' }));
  });

  it('an item the rule does not apply to is left alone', async () => {
    prisma.assetMoney.findMany.mockResolvedValue([slip('e3', 30, 5000)]);
    expect(await svc.sweep(now)).toBe(0);
    expect(notifications.emit).not.toHaveBeenCalled();
  });
});
