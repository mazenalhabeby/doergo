import { WorkModel } from '@hbcfield/shared';
import { ShiftRematchService } from '../shift-rematch.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { CountedTimeService } from '../counted-time.service';

/**
 * ⚠️ The past is not touched. An entry written BEFORE the label rules
 * (labelRules = null) re-matched after a rota change must get exactly the shift
 * and times the old code gave it — the first matching rota row — never the new
 * instance chooser. Only a new entry is re-judged by the chooser.
 *
 * Vienna, summer (UTC+2). A split day: morning 08:00–12:00 (higher priority,
 * so first in the old loop) and afternoon 13:00–17:00. Back at 12:05.
 */
describe('re-match of an OLD entry on a split-shift day', () => {
  const ORG = 'org-1';
  const USER = 'u-1';
  const SPACE = 'sp-1';
  const MORNING = { start: '2026-08-07T06:00:00.000Z', end: '2026-08-07T10:00:00.000Z' };
  const AFTERNOON = { start: '2026-08-07T11:00:00.000Z', end: '2026-08-07T15:00:00.000Z' };

  const row = (id: string, startLocal: string, endLocal: string, priority: number) => ({
    id: `sa-${id}`,
    userId: USER,
    spaceId: SPACE,
    shiftId: id,
    recurrence: 'DAILY',
    daysOfWeek: [] as number[],
    daysOfMonth: [] as number[],
    dates: [] as Date[],
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    priority,
    isActive: true,
    shift: {
      id,
      name: id,
      isActive: true,
      graceMin: 5,
      reminderIntervalMin: 5,
      maxReminders: 3,
      flagToleranceMin: 10,
      startLocal,
      endLocal,
      crossesMidnight: false,
    },
  });

  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'e-1',
    userId: USER,
    organizationId: ORG,
    locationId: SPACE,
    status: 'CLOCKED_OUT',
    clockInAt: new Date('2026-08-07T10:05:00Z'), // 12:05
    clockOutAt: new Date('2026-08-07T15:00:00Z'), // 17:00
    timezone: 'Europe/Vienna',
    shiftId: null,
    expectedClockInAt: null,
    expectedClockOutAt: null,
    flagReasons: ['UNSCHEDULED_DAY'],
    approvalStatus: 'PENDING',
    approvalNotes: null,
    paidMinutes: 295,
    breakMinutes: 0,
    unpaidBreakMinutes: 0,
    breakPlan: null,
    labelRules: null,
    labelFacts: null,
    location: { id: SPACE, timezone: 'Europe/Vienna', workModel: WorkModel.SHIFT, lat: 48.2, lng: 16.37 },
    shift: null,
    ...over,
  });

  let prisma: Record<string, Record<string, jest.Mock>>;
  let service: ShiftRematchService;

  beforeEach(() => {
    prisma = {
      timeEntry: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shiftAssignment: {
        findMany: jest.fn().mockResolvedValue([row('morning', '08:00', '12:00', 1), row('afternoon', '13:00', '17:00', 0)]),
      },
      technicianSchedule: { findFirst: jest.fn().mockResolvedValue(null) },
      timeOff: { findMany: jest.fn().mockResolvedValue([]) },
      shift: { findUnique: jest.fn().mockResolvedValue({ flagToleranceMin: 10, name: 'x' }) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const resolver = new ShiftResolverService(prisma as never);
    const breakRules = { planForClockIn: jest.fn().mockResolvedValue({ breakPlan: [], nextBreakRemindAt: null }) };
    service = new ShiftRematchService(
      prisma as never,
      resolver,
      new CountedTimeService(prisma as never),
      breakRules as never,
      { emit: jest.fn() } as never,
    );
  });

  const written = () => prisma.timeEntry.updateMany.mock.calls[0][0].data;

  it('an old entry gets the first matching row, as the old code did (morning, not afternoon)', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry()]);
    await service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE, actorId: 'admin-1' });
    const data = written();
    expect(data.shiftId).toBe('morning');
    expect(data.expectedClockInAt.toISOString()).toBe(MORNING.start);
    expect(data.expectedClockOutAt.toISOString()).toBe(MORNING.end);
    expect(data).not.toHaveProperty('labelFacts');
  });

  it('a new entry (label rules) is matched to the instance it falls next to (afternoon)', async () => {
    const facts = { shift: null, firstOfShift: true, clockIn: { judged: true, metresOutside: 0 } };
    prisma.timeEntry.findMany.mockResolvedValue([entry({ labelRules: 1, labelFacts: facts })]);
    await service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE, actorId: 'admin-1' });
    const data = written();
    expect(data.shiftId).toBe('afternoon');
    expect(data.expectedClockInAt.toISOString()).toBe(AFTERNOON.start);
    expect(data.expectedClockOutAt.toISOString()).toBe(AFTERNOON.end);
  });
});
