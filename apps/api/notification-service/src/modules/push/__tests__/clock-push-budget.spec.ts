import { CLOCK_PUSH_DAILY_BUDGET, clockPushAllowed } from '@hbcfield/shared';
import { ClockPushBudgetService } from '../clock-push-budget.service';
import { PushService } from '../push.service';

/** An in-memory stand-in for the Redis script: same caps, same counting. */
function fakeRedis(failing = false) {
  const store = new Map<string, number>();
  return {
    store,
    eval: jest.fn(
      async (_script: string, _n: number, totalKey: string, kindKey: string, max: number, perKind: number) => {
        if (failing) throw new Error('redis down');
        const total = store.get(totalKey) ?? 0;
        const kind = store.get(kindKey) ?? 0;
        if (total >= max || kind >= perKind) return 0;
        store.set(totalKey, total + 1);
        store.set(kindKey, kind + 1);
        return 1;
      },
    ),
    disconnect: jest.fn(),
  };
}

function budgetWith(redis: ReturnType<typeof fakeRedis>) {
  const svc = new ClockPushBudgetService();
  (svc as unknown as { redis: unknown }).redis = redis;
  return svc;
}

describe('clock push budget', () => {
  const at = new Date('2026-10-20T08:00:00Z');

  it('the pure rule: under both caps only', () => {
    expect(clockPushAllowed({ total: 0, ofThisKind: 0 })).toBe(true);
    expect(clockPushAllowed({ total: 3, ofThisKind: 1 })).toBe(true);
    expect(clockPushAllowed({ total: 4, ofThisKind: 0 })).toBe(false);
    expect(clockPushAllowed({ total: 1, ofThisKind: 2 })).toBe(false);
  });

  it('a reminder of one kind goes at most twice a day (the first + one repeat)', async () => {
    const svc = budgetWith(fakeRedis());
    const sent = [];
    for (let i = 0; i < 4; i++) sent.push((await svc.allowed(['u1'], 'shift_reminder', at)).length);
    expect(sent).toEqual([1, 1, 0, 0]);
  });

  it('at most four clock nudges per person per day, across kinds', async () => {
    const svc = budgetWith(fakeRedis());
    const kinds = ['noshow_reminder', 'break_due', 'break_over', 'shift_reminder', 'attendance.geofence_excursion_out'];
    const sent = [];
    for (const k of kinds) sent.push((await svc.allowed(['u1'], k, at)).length);
    expect(sent.reduce((a, b) => a + b, 0)).toBe(CLOCK_PUSH_DAILY_BUDGET);
    expect(sent[4]).toBe(0);
  });

  it('counts each person separately, and a new day starts fresh', async () => {
    const svc = budgetWith(fakeRedis());
    for (let i = 0; i < 2; i++) await svc.allowed(['u1'], 'break_due', at);
    expect(await svc.allowed(['u1', 'u2'], 'break_due', at)).toEqual(['u2']);
    expect(await svc.allowed(['u1'], 'break_due', new Date('2026-10-21T08:00:00Z'))).toEqual(['u1']);
  });

  it('answers and leader escalations are never held back', async () => {
    const redis = fakeRedis();
    const svc = budgetWith(redis);
    for (const t of ['overtime_decision', 'shift_escalation', 'noshow_escalation', 'chat_message', undefined]) {
      expect(await svc.allowed(['u1'], t, at)).toEqual(['u1']);
    }
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('fails open when Redis is away', async () => {
    const svc = budgetWith(fakeRedis(true));
    expect(await svc.allowed(['u1'], 'shift_reminder', at)).toEqual(['u1']);
  });

  it('PushService asks the budget and stops when nobody is left', async () => {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', notificationPrefs: null }]) },
      userPushToken: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const budget = { allowed: jest.fn().mockResolvedValue([]) } as unknown as ClockPushBudgetService;
    const push = new PushService({} as never, prisma as never, {} as never, budget);
    const r = await push.sendToUser(
      'u1',
      { title: { key: 'x' } as never, body: { key: 'y' } as never },
      { type: 'shift_reminder' },
    );
    expect(r).toMatchObject({ sent: 0, reason: 'clock_budget' });
    expect(prisma.userPushToken.findMany).not.toHaveBeenCalled();
  });
});
