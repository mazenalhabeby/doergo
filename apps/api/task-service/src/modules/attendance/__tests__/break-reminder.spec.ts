import { Test } from '@nestjs/testing';
import { BreakReminderService } from '../break-reminder.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SERVICE_NAMES, resolveBreakPlan, type BreakRuleLike } from '@hbcfield/shared';

/**
 * The rest alarm, as it behaves against a database.
 *
 * The properties worth holding still are the ones that decide whether this is a
 * useful nudge or a notification storm: what the sweep is allowed to READ, that
 * it never starts or ends a rest by itself, and that an entry with nothing
 * pending stops being selected at all.
 */
describe('rest sweep', () => {
  let service: BreakReminderService;
  let prisma: any;
  let notify: { emit: jest.Mock };

  const now = new Date('2026-09-06T10:00:00Z');
  const lunch: BreakRuleLike = {
    id: 'r1', name: 'Lunch', trigger: 'LOCAL_WINDOW', earliestLocal: '11:30', latestLocal: '13:30',
    durationMinutes: 30, isPaid: false, isRequired: true, remind: true, snoozeMin: 15, maxSnoozes: null,
  };
  const plan = resolveBreakPlan([lunch], {
    clockInAt: new Date('2026-09-06T03:55:00Z'),
    expectedStartAt: new Date('2026-09-06T04:00:00Z'),
    expectedEndAt: new Date('2026-09-06T16:00:00Z'),
    timezone: 'Europe/Vienna',
  });

  const entry = (over: Partial<any> = {}) => ({
    id: 'e1', userId: 'u1', organizationId: 'org1', locationId: 'loc1',
    breakPlan: plan, timezone: 'Europe/Vienna',
    location: { id: 'loc1', name: 'Main Office', timezone: 'Europe/Vienna' },
    user: { id: 'u1', firstName: 'Mike', lastName: 'Weber' },
    breaks: [],
    ...over,
  });

  beforeEach(async () => {
    prisma = { timeEntry: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) } };
    notify = { emit: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        BreakReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notify },
      ],
    }).compile();
    service = mod.get(BreakReminderService);
  });

  it('reads ONLY entries whose rest is actually due, through the index', async () => {
    await service.sweep(now);
    const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: 'CLOCKED_IN',
      nextBreakRemindAt: { not: null, lte: now },
    });
    // Capped, so a backlog drains over later ticks instead of one enormous tick.
    expect(prisma.timeEntry.findMany.mock.calls[0][0].take).toBe(500);
    expect(prisma.timeEntry.findMany.mock.calls[0][0].orderBy).toEqual({ nextBreakRemindAt: 'asc' });
  });

  it('asks the member when a rest falls due', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry()]);
    const r = await service.sweep(new Date('2026-09-06T09:31:00Z'));
    expect(r.asked).toBe(1);
    expect(notify.emit).toHaveBeenCalledWith('attendance_break_due', expect.objectContaining({
      entryId: 'e1', userId: 'u1', ruleId: 'r1', name: 'Lunch',
    }));
  });

  it('never starts the rest itself — every path out of it is a person tapping', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry()]);
    await service.sweep(new Date('2026-09-06T09:31:00Z'));
    // The only write is the deadline; no break row is created anywhere.
    for (const call of prisma.timeEntry.update.mock.calls) {
      expect(Object.keys(call[0].data)).not.toContain('breaks');
    }
  });

  it('nudges once when the rest has run its length, and not again', async () => {
    const taken = plan.map((i) => ({ ...i, state: 'TAKEN' as const, breakId: 'b1' }));
    prisma.timeEntry.findMany.mockResolvedValue([
      entry({
        breakPlan: taken,
        breaks: [{ id: 'b1', startedAt: new Date('2026-09-06T09:30:00Z'), ruleId: 'r1' }],
      }),
    ]);
    const r = await service.sweep(new Date('2026-09-06T10:01:00Z')); // 31 min in
    expect(r.ended).toBe(1);
    expect(notify.emit).toHaveBeenCalledWith('attendance_break_over', expect.objectContaining({ breakId: 'b1' }));
    // Re-armed to whatever is next — which is nothing, so the row stops being read.
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { nextBreakRemindAt: null },
    });
  });

  it('says nothing while a rest is still running', async () => {
    const taken = plan.map((i) => ({ ...i, state: 'TAKEN' as const, breakId: 'b1' }));
    prisma.timeEntry.findMany.mockResolvedValue([
      entry({ breakPlan: taken, breaks: [{ id: 'b1', startedAt: new Date('2026-09-06T09:55:00Z'), ruleId: 'r1' }] }),
    ]);
    const r = await service.sweep(new Date('2026-09-06T10:00:00Z')); // 5 min in
    expect(r.ended).toBe(0);
    expect(notify.emit).not.toHaveBeenCalled();
  });

  it('records a rest whose window closed as missed, and asks nobody', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry()]);
    const r = await service.sweep(new Date('2026-09-06T12:00:00Z')); // past 13:30 local
    expect(r.missed).toBe(1);
    expect(notify.emit).not.toHaveBeenCalled();
    const written = prisma.timeEntry.update.mock.calls[0][0].data;
    expect(written.breakPlan[0].state).toBe('MISSED');
    expect(written.nextBreakRemindAt).toBeNull();
  });

  it('clears the deadline on an entry with no plan, so it is never read again', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry({ breakPlan: null })]);
    await service.sweep(now);
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { nextBreakRemindAt: null },
    });
  });

  it('does nothing at all when nothing is due', async () => {
    const r = await service.sweep(now);
    expect(r).toEqual({ asked: 0, ended: 0, missed: 0 });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });
});
