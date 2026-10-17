import { breakServices } from './break.service.fixture';
import { BreakReminderService } from '../break-reminder.service';
import { CountedTimeService } from '../counted-time.service';
import { resolveBreakPlan, type BreakRuleLike } from '@hbcfield/shared';

/**
 * Rests, as the services handle them:
 *
 *  - a coffee at 09:00 is not lunch; a tap in lunch's window is;
 *  - a required rest that becomes MISSED ("Later" ran out, or its window closed)
 *    flags the entry for a person — and nothing is deducted;
 *  - a rule with reminders off is never asked about, and not re-armed after a rest;
 *  - nobody adds, removes or ends a rest on their OWN shift from the office side.
 */
const ORG = 'org-1';
const LEADER = 'leader-1';
const MEMBER = 'member-1';
const t = (hm: string) => new Date(`2026-09-07T${hm}:00Z`);
const ctx = { clockInAt: t('07:00'), expectedStartAt: t('07:00'), expectedEndAt: t('16:00'), timezone: 'UTC' };

const lunch: BreakRuleLike = {
  id: 'lunch', name: 'Lunch', trigger: 'LOCAL_WINDOW', earliestLocal: '12:00', latestLocal: '13:30',
  durationMinutes: 30, isPaid: true, isRequired: true, remind: true, snoozeMin: 10, maxSnoozes: 1,
};
const quiet: BreakRuleLike = {
  id: 'quiet', name: 'Quiet', trigger: 'LOCAL_WINDOW', earliestLocal: '10:00', latestLocal: '11:00',
  durationMinutes: 15, isPaid: false, isRequired: true, remind: false, snoozeMin: 10, maxSnoozes: null,
};

function prismaMock() {
  const prisma: any = {
    timeEntry: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    break: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'brk-new', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'brk-1', type: 'SHORT', ...data })),
      delete: jest.fn(),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ firstName: 'M', lastName: 'W' }) },
    shift: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  return prisma;
}

const breaks = (prisma: any) => breakServices(prisma, new CountedTimeService(prisma), { emit: jest.fn() } as any);

describe('a tap takes a planned rest only when it is that rest', () => {
  const openEntry = (plan: unknown) => ({ id: 'e1', userId: MEMBER, clockInAt: t('07:00'), breakPlan: plan, breaks: [] });

  it('a 09:00 coffee is unplanned: lunch stays pending, the coffee is not counted as work', async () => {
    jest.useFakeTimers().setSystemTime(t('09:00'));
    try {
      const prisma = prismaMock();
      prisma.timeEntry.findFirst.mockResolvedValue(openEntry(resolveBreakPlan([lunch], ctx)));
      await breaks(prisma).startBreak({ userId: MEMBER, organizationId: ORG });
      expect(prisma.break.create.mock.calls[0][0].data).toMatchObject({ ruleId: null, isPaid: false });
      // The plan is not touched: lunch is still to come.
      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a tap in lunch\'s window is lunch, with lunch\'s setting', async () => {
    jest.useFakeTimers().setSystemTime(t('12:05'));
    try {
      const prisma = prismaMock();
      prisma.timeEntry.findFirst.mockResolvedValue(openEntry(resolveBreakPlan([lunch], ctx)));
      await breaks(prisma).startBreak({ userId: MEMBER, organizationId: ORG });
      expect(prisma.break.create.mock.calls[0][0].data).toMatchObject({ ruleId: 'lunch', isPaid: true });
      const plan = prisma.timeEntry.update.mock.calls[0][0].data.breakPlan;
      expect(plan[0].state).toBe('TAKEN');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('"Later" past the cap on a required rest', () => {
  it('records it missed AND flags the entry — nothing deducted', async () => {
    const prisma = prismaMock();
    const plan = resolveBreakPlan([lunch], ctx).map((i) => ({ ...i, state: 'SNOOZED', snoozeCount: 1 }));
    prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1', breakPlan: plan, flagReasons: ['LATE_ARRIVAL'] });
    const r: any = await breaks(prisma).snoozeBreak({ userId: MEMBER, organizationId: ORG });
    expect(r.data.state).toBe('MISSED');
    const data = prisma.timeEntry.update.mock.calls[0][0].data;
    expect(data.flagReasons).toEqual(['LATE_ARRIVAL', 'MISSED_BREAK']);
    expect(Object.keys(data)).not.toEqual(expect.arrayContaining(['paidMinutes', 'unpaidBreakMinutes', 'breakMinutes']));
  });

  it('an ordinary "Later" leaves the flags alone', async () => {
    const prisma = prismaMock();
    prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1', breakPlan: resolveBreakPlan([lunch], ctx), flagReasons: [] });
    await breaks(prisma).snoozeBreak({ userId: MEMBER, organizationId: ORG });
    expect(prisma.timeEntry.update.mock.calls[0][0].data).not.toHaveProperty('flagReasons');
  });
});

describe('a rule with reminders off', () => {
  it('is not re-armed when another rest ends', async () => {
    const prisma = prismaMock();
    const plan = resolveBreakPlan([quiet], ctx);
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: 'e1', userId: MEMBER, clockInAt: t('07:00'), breakPlan: plan,
      breaks: [{ id: 'brk-1', startedAt: t('08:00'), notes: null }],
    });
    jest.useFakeTimers().setSystemTime(t('08:10'));
    try {
      await breaks(prisma).endBreak({ userId: MEMBER, organizationId: ORG });
    } finally {
      jest.useRealTimers();
    }
    // Woken only for the silent rest's window closing (11:00), never its due time (10:00).
    const data = prisma.timeEntry.update.mock.calls.find((c: any) => 'nextBreakRemindAt' in c[0].data)[0].data;
    expect(data.nextBreakRemindAt).toEqual(t('11:00'));
  });
});

describe('the rest sweep', () => {
  const due = (plan: unknown, flagReasons: string[] = []) => ({
    id: 'e1', userId: MEMBER, organizationId: ORG, locationId: 'loc-1', breakPlan: plan, flagReasons,
    timezone: 'UTC', location: { name: 'Site' }, user: { firstName: 'M', lastName: 'W' }, breaks: [],
  });

  it('never asks about a rule with reminders off', async () => {
    const prisma = prismaMock();
    const notify = { emit: jest.fn() };
    prisma.timeEntry.findMany.mockResolvedValue([due(resolveBreakPlan([quiet], ctx))]);
    await new BreakReminderService(prisma, notify as any).sweep(t('10:01'));
    expect(notify.emit).not.toHaveBeenCalled();
    expect(prisma.timeEntry.update.mock.calls[0][0].data.nextBreakRemindAt).toEqual(t('11:00'));
  });

  it('a required rest whose window closed is recorded missed and flagged', async () => {
    const prisma = prismaMock();
    prisma.timeEntry.findMany.mockResolvedValue([due(resolveBreakPlan([quiet], ctx), ['UNSCHEDULED_DAY'])]);
    const r = await new BreakReminderService(prisma, { emit: jest.fn() } as any).sweep(t('11:00'));
    expect(r.missed).toBe(1);
    const data = prisma.timeEntry.update.mock.calls[0][0].data;
    expect(data.breakPlan[0].state).toBe('MISSED');
    expect(data.flagReasons).toEqual(['UNSCHEDULED_DAY', 'MISSED_BREAK']);
  });

  it('an unanswered ask past the cap flags too', async () => {
    const prisma = prismaMock();
    const plan = resolveBreakPlan([lunch], ctx).map((i) => ({ ...i, state: 'SNOOZED', snoozeCount: 1, dueAt: t('12:10').toISOString() }));
    prisma.timeEntry.findMany.mockResolvedValue([due(plan)]);
    await new BreakReminderService(prisma, { emit: jest.fn() } as any).sweep(t('12:10'));
    expect(prisma.timeEntry.update.mock.calls[0][0].data.flagReasons).toEqual(['MISSED_BREAK']);
  });
});

describe('nobody changes the rests on their own shift from the office side', () => {
  const ownEntry = { id: 'e1', userId: LEADER, clockInAt: t('07:00'), clockOutAt: t('16:00'), breaks: [], approvalStatus: 'AUTO' };

  it('adding one is refused', async () => {
    const prisma = prismaMock();
    prisma.timeEntry.findFirst.mockResolvedValue(ownEntry);
    await expect(
      breaks(prisma).addBreakForMember({
        timeEntryId: 'e1', organizationId: ORG, editorId: LEADER, startedAt: t('12:00'), endedAt: t('12:30'), reason: 'x',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.break.create).not.toHaveBeenCalled();
  });

  it('deleting one is refused', async () => {
    const prisma = prismaMock();
    prisma.break.findFirst.mockResolvedValue({ id: 'brk-1', timeEntryId: 'e1', endedAt: t('12:30'), timeEntry: { ...ownEntry } });
    await expect(breaks(prisma).deleteBreak({ breakId: 'brk-1', organizationId: ORG, editorId: LEADER })).rejects.toMatchObject({ status: 403 });
    expect(prisma.break.delete).not.toHaveBeenCalled();
  });

  it('ending one is refused', async () => {
    const prisma = prismaMock();
    prisma.break.findFirst.mockResolvedValue({ id: 'brk-1', timeEntryId: 'e1', startedAt: t('12:00'), timeEntry: { ...ownEntry, user: {}, breaks: [] } });
    await expect(breaks(prisma).endBreakManually({ breakId: 'brk-1', adminId: LEADER, organizationId: ORG })).rejects.toMatchObject({ status: 403 });
    expect(prisma.break.update).not.toHaveBeenCalled();
  });

  it('the org owner is exempt — there is nobody above them', async () => {
    const prisma = prismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: LEADER });
    prisma.timeEntry.findFirst.mockResolvedValue(ownEntry);
    const r: any = await breaks(prisma).addBreakForMember({
      timeEntryId: 'e1', organizationId: ORG, editorId: LEADER, startedAt: t('12:00'), endedAt: t('12:30'), reason: 'x',
    });
    expect(r.success).toBe(true);
  });
});

describe('the office ending somebody\'s rest', () => {
  it('recomputes BOTH totals and the counted time, in one transaction', async () => {
    const prisma = prismaMock();
    const entry = {
      id: 'e1', userId: MEMBER, status: 'CLOCKED_OUT', clockInAt: t('07:00'), clockOutAt: t('16:00'),
      expectedClockInAt: t('07:00'), expectedClockOutAt: t('16:00'), shiftId: null, breakPlan: null,
      user: { id: MEMBER, firstName: 'M', lastName: 'W' },
      breaks: [
        { id: 'brk-0', startedAt: t('09:00'), endedAt: t('09:15'), durationMinutes: 15, isPaid: true },
        { id: 'brk-1', startedAt: t('12:00'), endedAt: null, durationMinutes: null, isPaid: false },
      ],
    };
    prisma.break.findFirst.mockResolvedValue({ id: 'brk-1', timeEntryId: 'e1', startedAt: t('12:00'), timeEntry: entry });
    jest.useFakeTimers().setSystemTime(t('12:30'));
    try {
      await breaks(prisma).endBreakManually({ breakId: 'brk-1', adminId: LEADER, organizationId: ORG });
    } finally {
      jest.useRealTimers();
    }
    expect(prisma.$transaction).toHaveBeenCalled();
    const totals = prisma.timeEntry.update.mock.calls[0][0].data;
    expect(totals).toMatchObject({ breakMinutes: 45, unpaidBreakMinutes: 30 });
    // The closed shift is recounted: 9h less the 30 unpaid minutes.
    expect(prisma.timeEntry.update.mock.calls[1][0].data.paidMinutes).toBe(510);
  });
});
