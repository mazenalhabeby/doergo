import { Test } from '@nestjs/testing';
import { BreakReminderService } from '../break-reminder.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SERVICE_NAMES, resolveBreakPlan, parseBreakPlan, type BreakRuleLike } from '@hbcfield/shared';

/**
 * A rest prompt that is ignored must stop asking.
 *
 * The sweep used to re-arm five minutes later and leave `snoozeCount` untouched,
 * while the comment beside it claimed the cap would stop the asking. It would
 * not: the count moved only when somebody actively tapped "Later". A member who
 * simply ignored the prompt — phone in a locker, hands full, driving — was asked
 * again every five minutes for the rest of the shift.
 *
 * This walks a whole shift's worth of ticks and counts the notifications.
 */
describe('an ignored rest prompt stops asking', () => {
  let service: BreakReminderService;
  let prisma: any;
  let emitted: string[];

  const rule: BreakRuleLike = {
    id: 'r1', name: 'Coffee', trigger: 'AFTER_WORKED', afterMinutes: 3,
    durationMinutes: 5, isPaid: false, isRequired: true,
    remind: true, snoozeMin: 5, maxSnoozes: null, // null → the shared default of 3
  };

  const start = new Date('2026-09-06T06:00:00Z');
  const plan = resolveBreakPlan([rule], {
    clockInAt: start,
    expectedStartAt: start,
    // A twelve-hour shift, and the rest has no window that would close on its own.
    expectedEndAt: new Date('2026-09-06T18:00:00Z'),
    timezone: 'Europe/Vienna',
  });

  beforeEach(async () => {
    emitted = [];
    // One row, whose plan and deadline the sweep mutates as it goes — the same
    // loop the real engine runs, minute after minute.
    const row: any = {
      id: 'e1', userId: 'u1', organizationId: 'org1', locationId: 'loc1',
      breakPlan: plan, timezone: 'Europe/Vienna', breaks: [],
      location: { id: 'loc1', name: 'Main Office', timezone: 'Europe/Vienna' },
      user: { id: 'u1', firstName: 'Mike', lastName: 'Weber' },
      nextBreakRemindAt: new Date(plan[0].dueAt),
    };
    prisma = {
      timeEntry: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            row.nextBreakRemindAt && row.nextBreakRemindAt <= where.nextBreakRemindAt.lte ? [row] : [],
          ),
        ),
        update: jest.fn(({ data }: any) => {
          if ('breakPlan' in data) row.breakPlan = data.breakPlan;
          if ('nextBreakRemindAt' in data) row.nextBreakRemindAt = data.nextBreakRemindAt;
          return Promise.resolve(row);
        }),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        BreakReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: (e: string) => emitted.push(e) } },
      ],
    }).compile();
    service = mod.get(BreakReminderService);
    (service as any).__row = row;
  });

  it('asks a handful of times over twelve hours, not a hundred', async () => {
    const row = (service as any).__row;
    // Tick every minute for the whole shift, as the engine does.
    for (let m = 0; m <= 12 * 60; m++) {
      await service.sweep(new Date(start.getTime() + m * 60_000));
    }
    const asks = emitted.filter((e) => e === 'attendance_break_due').length;

    // Three prompts, then it stops: the cap counts an unanswered ask exactly as
    // it counts a tapped "Later", because both are the same fact about the day.
    expect(asks).toBeLessThanOrEqual(4);
    expect(asks).toBeGreaterThan(0);

    const item = parseBreakPlan(row.breakPlan)[0];
    expect(item.state).toBe('MISSED');
    // …and the row stops being selected at all, rather than being read every
    // minute for the rest of the day.
    expect(row.nextBreakRemindAt).toBeNull();
  });

  it('uses the rule’s own interval, carried on the plan, not a hardcoded five', async () => {
    const row = (service as any).__row;
    await service.sweep(new Date(plan[0].dueAt));
    const gapMin = (row.nextBreakRemindAt.getTime() - new Date(plan[0].dueAt).getTime()) / 60_000;
    expect(gapMin).toBe(rule.snoozeMin);
  });
});
