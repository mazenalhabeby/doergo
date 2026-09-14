/**
 * Clocking in with no shift: allow, a daily limit, or shift only.
 *
 * The rule (shared) and the clock-in/clock-out that enforce it. The limit is
 * the session's planned end — so counted time, reminders and overtime follow it
 * without learning anything new.
 */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  QUEUE_NAMES, SERVICE_NAMES, TimeEntryStatus,
  noShiftAllowance, noShiftAllowanceNow, countedMinutesBetween, startOfDayIn, endOfDayIn, clampDailyMinutes,
} from '@hbcfield/shared';
import { AttendanceService } from '../attendance.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { BreakReminderService } from '../break-reminder.service';
import { BreakService } from '../break.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const at = (iso: string) => new Date(iso);
const MIN = 60_000;

describe('the rule', () => {
  it('allows freely by default, and for a value it does not know', () => {
    expect(noShiftAllowance({ policy: 'ALLOW', dailyMinutes: 480, workedTodayMinutes: 900, at: at('2026-09-15T12:00:00Z') }).kind).toBe('free');
    expect(noShiftAllowance({ policy: 'SOMETHING', dailyMinutes: 480, workedTodayMinutes: 900, at: at('2026-09-15T12:00:00Z') }).kind).toBe('free');
  });

  it('refuses outright when the workspace needs a shift', () => {
    expect(noShiftAllowance({ policy: 'SHIFT_ONLY', dailyMinutes: 480, workedTodayMinutes: 0, at: at('2026-09-15T12:00:00Z') }))
      .toMatchObject({ kind: 'refused', reason: 'SHIFT_ONLY' });
  });

  it('counts until the hours left run out', () => {
    const a = noShiftAllowance({ policy: 'LIMIT', dailyMinutes: 480, workedTodayMinutes: 300, at: at('2026-09-15T12:00:00Z') });
    expect(a).toMatchObject({ kind: 'limited', remainingMinutes: 180 });
    expect((a as any).until.toISOString()).toBe('2026-09-15T15:00:00.000Z');
  });

  it('refuses when nothing is left', () => {
    expect(noShiftAllowance({ policy: 'LIMIT', dailyMinutes: 480, workedTodayMinutes: 480, at: at('2026-09-15T12:00:00Z') }))
      .toMatchObject({ kind: 'refused', reason: 'NO_HOURS_LEFT', dailyMinutes: 480 });
  });

  it('keeps the limit between half an hour and a day', () => {
    expect(clampDailyMinutes(5)).toBe(30);
    expect(clampDailyMinutes(5000)).toBe(1440);
    expect(clampDailyMinutes(undefined)).toBe(480);
  });

  it('counts counted time, gives a session across midnight each day its share, and an open one up to now', () => {
    const from = at('2026-09-15T00:00:00Z');
    const to = at('2026-09-15T12:00:00Z');
    expect(countedMinutesBetween([
      // 22:00 → 02:00, 240 counted: two hours fall today.
      { clockInAt: '2026-09-14T22:00:00Z', clockOutAt: '2026-09-15T02:00:00Z', paidMinutes: 240 },
      // 08:00 → 10:00 with a 30-minute rest: 90 counted.
      { clockInAt: '2026-09-15T08:00:00Z', clockOutAt: '2026-09-15T10:00:00Z', paidMinutes: 90 },
      // Still open since 11:00.
      { clockInAt: '2026-09-15T11:00:00Z', clockOutAt: null },
    ], from, to)).toBe(120 + 90 + 60);
  });

  it('knows the local day, across a daylight-saving change', () => {
    expect(startOfDayIn(at('2026-10-25T12:00:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(endOfDayIn(at('2026-10-25T12:00:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('a tag read yesterday starts the next day with nothing used', () => {
    const tag = { policy: 'LIMIT' as const, dailyMinutes: 480, hasShiftNow: false, workedTodayMinutes: 480, dayEndsAt: '2026-09-15T22:00:00.000Z' };
    expect(noShiftAllowanceNow(tag, at('2026-09-15T21:00:00Z')).kind).toBe('refused');
    expect(noShiftAllowanceNow(tag, at('2026-09-16T06:00:00Z'))).toMatchObject({ kind: 'limited', remainingMinutes: 480 });
    expect(noShiftAllowanceNow({ ...tag, hasShiftNow: true }, at('2026-09-15T21:00:00Z')).kind).toBe('free');
  });
});

// ── the service ─────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-15T12:00:00.000Z'); // 14:00 in Vienna
const SITE = { lat: 47.9813, lng: 13.8269 };
const location = {
  id: 'loc-1', name: 'Main Office', organizationId: 'org-1', isActive: true, isRemote: false, workModel: 'NONE',
  ...SITE, geofenceRadius: 50, geofencePolygon: null, geofencePolicy: 'STRICT', timezone: 'Europe/Vienna',
  noShiftPolicy: 'LIMIT', noShiftDailyMinutes: 480, updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

async function build(opts: { worked?: any[]; shift?: any; space?: Partial<typeof location> } = {}) {
  const prisma: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'u1', organizationId: 'org-1', allowRemote: false, role: 'EMPLOYEE', organization: { timezone: 'Europe/Vienna' } }),
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Mike', lastName: 'Weber' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ ...location, ...opts.space }) },
    spaceAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'a1', allowRemote: null }), findMany: jest.fn().mockResolvedValue([]) },
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(opts.worked ?? []),
      create: jest.fn(async ({ data }: any) => ({ id: 'e-new', ...data, location })),
      update: jest.fn(async ({ data }: any) => ({ id: 'e1', ...data, location })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    break: { findMany: jest.fn().mockResolvedValue([]) },
    shiftInstance: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    breakRule: { findMany: jest.fn().mockResolvedValue([]) },
    shift: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AttendanceService, BreakService, CountedTimeService, BreakRulesService, BreakReminderService,
      { provide: PrismaService, useValue: prisma },
      { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn(), getRepeatableJobs: jest.fn().mockResolvedValue([]) } },
      { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) } },
      { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(opts.shift ?? null) } },
    ],
  }).compile();
  const service = moduleRef.get(AttendanceService);
  jest.spyOn(service as any, 'reverseGeocode').mockResolvedValue(null);
  return { service, prisma };
}

const clockIn = (over: Record<string, unknown> = {}) => ({ userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', ...SITE, accuracy: 10, ...over });
/** Five counted hours this morning. */
const MORNING = [{ clockInAt: new Date('2026-09-15T05:00:00Z'), clockOutAt: new Date('2026-09-15T10:00:00Z'), paidMinutes: 300 }];

describe('clocking in with no shift', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
  });
  afterAll(() => jest.useRealTimers());

  it('counts until the hours left today run out, as the planned end', async () => {
    const { service, prisma } = await build({ worked: MORNING });
    await service.clockIn(clockIn());
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data.expectedClockOutAt).toEqual(new Date(NOW.getTime() + 180 * MIN));
    expect(data.endIsDailyLimit).toBe(true);
    expect(data.nextRemindAt.getTime()).toBeGreaterThan(data.expectedClockOutAt.getTime());
    // Today, at every workspace, from local midnight.
    const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.locationId).toBeUndefined();
    expect(where.OR[1].clockOutAt.gt.toISOString()).toBe('2026-09-14T22:00:00.000Z');
  });

  it('refuses with a code when no hours are left', async () => {
    const { service, prisma } = await build({ worked: [{ ...MORNING[0], paidMinutes: 480 }] });
    await expect(service.clockIn(clockIn())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'NO_HOURS_LEFT' }) });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it('refuses when the workspace only allows clocking in with a shift', async () => {
    const { service, prisma } = await build({ space: { noShiftPolicy: 'SHIFT_ONLY' } });
    await expect(service.clockIn(clockIn())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'NO_SHIFT_TODAY' }) });
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it('changes nothing for a member who has a shift', async () => {
    const end = new Date(NOW.getTime() + 8 * 60 * MIN);
    const { service, prisma } = await build({
      space: { noShiftPolicy: 'SHIFT_ONLY' },
      shift: { shiftId: 's1', expectedClockInAt: NOW, expectedClockOutAt: end, nextRemindAt: end, flagToleranceMin: 10 },
    });
    await service.clockIn(clockIn());
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data.expectedClockOutAt).toEqual(end);
    expect(data.endIsDailyLimit).toBe(false);
  });

  it('changes nothing where the workspace allows it, and asks nothing', async () => {
    const { service, prisma } = await build({ space: { noShiftPolicy: 'ALLOW' } });
    await service.clockIn(clockIn());
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.timeEntry.create.mock.calls[0][0].data.expectedClockOutAt).toBeUndefined();
  });

  it('keeps a clock-in recorded offline with no hours left — it counts nothing and says so', async () => {
    const TAP = new Date('2026-09-15T11:00:00.000Z');
    const anchorAt = new Date(TAP.getTime() - 8 * MIN);
    const { service, prisma } = await build({ worked: [{ ...MORNING[0], paidMinutes: 480 }] });
    await service.clockIn(clockIn({
      evidence: {
        occurredAt: TAP.toISOString(), uptimeMs: 1_000_000 + 8 * MIN,
        anchor: { serverTime: anchorAt.toISOString(), uptimeMs: 1_000_000 },
        fix: { ...SITE, accuracy: 12, fixAt: TAP.toISOString() },
      },
    }));
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data.flagReasons).toEqual(expect.arrayContaining(['RECORDED_OFFLINE', 'PAST_DAILY_LIMIT']));
    expect(data.expectedClockOutAt).toEqual(TAP);
  });
});

describe('clocking out of a limited session', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
  });
  afterAll(() => jest.useRealTimers());

  const open = (expectedClockOutAt: Date) => ({
    id: 'e1', userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', status: TimeEntryStatus.CLOCKED_IN,
    clockInAt: new Date('2026-09-15T08:00:00Z'), isRemote: false, flagReasons: ['UNSCHEDULED_DAY'], breakMinutes: 0, unpaidBreakMinutes: 0,
    expectedClockOutAt, endIsDailyLimit: true, shiftId: null, location, breaks: [],
  });

  it('leaving before the limit is not an early departure', async () => {
    const { service, prisma } = await build();
    prisma.timeEntry.findFirst.mockResolvedValue(open(new Date(NOW.getTime() + 3 * 60 * MIN)));
    await service.clockOut({ userId: 'u1', organizationId: 'org-1', entryId: 'e1', ...SITE } as any);
    expect(prisma.timeEntry.update.mock.calls[0][0].data.flagReasons).not.toContain('EARLY_DEPARTURE');
  });

  it('staying past it reads as past today’s limit', async () => {
    const { service, prisma } = await build();
    prisma.timeEntry.findFirst.mockResolvedValue(open(new Date(NOW.getTime() - 90 * MIN)));
    await service.clockOut({ userId: 'u1', organizationId: 'org-1', entryId: 'e1', ...SITE } as any);
    const flags = prisma.timeEntry.update.mock.calls[0][0].data.flagReasons;
    expect(flags).toContain('PAST_DAILY_LIMIT');
    expect(flags).not.toContain('OVERTIME');
  });
});

describe('what the phone and web are told before the tap', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
  });
  afterAll(() => jest.useRealTimers());

  it('tags a limited workspace with today’s hours, and one that allows it with nothing', async () => {
    const { service, prisma } = await build({ worked: MORNING });
    prisma.spaceAssignment.findMany.mockResolvedValue([{ spaceId: 'loc-1', allowRemote: null }, { spaceId: 'loc-2', allowRemote: null }]);
    prisma.companyLocation.findMany = jest.fn().mockResolvedValue([
      location,
      { ...location, id: 'loc-2', name: 'Warehouse', noShiftPolicy: 'ALLOW' },
    ]);
    const res: any = await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });
    const [main, warehouse] = res.data;
    expect(main.noShift).toEqual({
      policy: 'LIMIT', dailyMinutes: 480, hasShiftNow: false, workedTodayMinutes: 300, dayEndsAt: '2026-09-15T22:00:00.000Z',
    });
    expect(warehouse.noShift).toBeNull();
  });
});
