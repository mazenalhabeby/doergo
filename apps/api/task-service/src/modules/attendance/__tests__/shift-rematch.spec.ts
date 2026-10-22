import { ShiftRematchService } from '../shifts/shift-rematch.service';
import { CountedTimeService } from '../core/counted-time.service';

/**
 * A shift added after the clock-in.
 *
 * Written after two night-shift workers clocked in on 30 Sep, the evening their
 * rota ran out. The office added October's shifts that night, and both entries
 * stayed "Unscheduled" for good — counted from the minute they arrived, with no
 * late or overtime check, because the clock-in matches a shift once and never
 * looked again.
 */
describe('ShiftRematchService', () => {
  const ORG = 'org-1';
  const USER = 'u-1';
  const SPACE = 'space-1';
  // Night shift 18:00 → 06:00 (EDT = UTC-4): 22:00Z → 10:00Z next day.
  const SHIFT_START = new Date('2026-09-30T22:00:00Z');
  const SHIFT_END = new Date('2026-10-01T10:00:00Z');

  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'e-1',
    userId: USER,
    organizationId: ORG,
    locationId: SPACE,
    status: 'CLOCKED_OUT',
    clockInAt: new Date('2026-09-30T21:51:00Z'), // 17:51, nine minutes early
    clockOutAt: new Date('2026-10-01T07:00:00Z'), // 03:00, three hours early
    timezone: 'America/New_York',
    shiftId: null,
    expectedClockInAt: null,
    expectedClockOutAt: null,
    flagReasons: ['UNSCHEDULED_DAY'],
    approvalStatus: 'PENDING',
    approvalNotes: null,
    paidMinutes: 549,
    breakMinutes: 0,
    unpaidBreakMinutes: 0,
    breakPlan: null,
    location: { id: SPACE, timezone: 'America/New_York', workModel: 'SHIFTS', lat: 40, lng: -74 },
    ...over,
  });

  let prisma: any;
  let resolver: any;
  let breakRules: any;
  let client: any;
  let service: ShiftRematchService;

  beforeEach(() => {
    prisma = {
      timeEntry: { findMany: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      shift: { findUnique: jest.fn().mockResolvedValue({ flagToleranceMin: 10, name: 'Night Shift' }) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    resolver = {
      resolveForClockIn: jest.fn().mockResolvedValue({
        shiftId: 'shift-night',
        expectedClockInAt: SHIFT_START,
        expectedClockOutAt: SHIFT_END,
        nextRemindAt: new Date(SHIFT_END.getTime() + 15 * 60_000),
        flagToleranceMin: 10,
      }),
    };
    breakRules = { planForClockIn: jest.fn().mockResolvedValue({ breakPlan: [], nextBreakRemindAt: null }) };
    client = { emit: jest.fn() };
    service = new ShiftRematchService(prisma, resolver, new CountedTimeService(prisma), breakRules, client);
  });

  const written = () => prisma.timeEntry.updateMany.mock.calls[0][0];

  it('gives an unscheduled entry its shift, counts from the shift start and checks the departure', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry()]);
    await expect(service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE, actorId: 'admin-1' })).resolves.toBe(1);

    const { where, data } = written();
    expect(where).toEqual({ id: 'e-1', shiftId: null, flagReasons: { has: 'UNSCHEDULED_DAY' } });
    expect(data.shiftId).toBe('shift-night');
    expect(data.flagReasons).not.toContain('UNSCHEDULED_DAY');
    expect(data.flagReasons).toContain('EARLY_DEPARTURE');
    // 18:00 → 03:00, not 17:51 → 03:00.
    expect(data.countedStartAt).toEqual(SHIFT_START);
    expect(data.paidMinutes).toBe(540);
    // The real times are evidence and are never written.
    expect(data).not.toHaveProperty('clockInAt');
    expect(data).not.toHaveProperty('clockOutAt');
    expect(prisma.activityLog.create.mock.calls[0][0].data).toMatchObject({
      eventType: 'TIME_ENTRY_EDITED',
      userId: 'admin-1',
      resourceId: 'e-1',
      organizationId: ORG,
    });
    expect(client.emit).toHaveBeenCalledWith('attendance_changed', { organizationId: ORG, action: 'rematch' });
  });

  it('only ever looks at UNSCHEDULED entries of that person, in that workspace, in that organization', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([]);
    await service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE });
    const { where } = prisma.timeEntry.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      organizationId: ORG,
      userId: USER,
      locationId: SPACE,
      shiftId: null,
      flagReasons: { has: 'UNSCHEDULED_DAY' },
    });
  });

  it('never reaches back further than 90 days, whatever the rota says', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([]);
    await service.rematch({ organizationId: ORG, userId: USER, from: new Date('2020-01-01T00:00:00Z') });
    const { gte } = prisma.timeEntry.findMany.mock.calls[0][0].where.clockInAt;
    expect(Date.now() - gte.getTime()).toBeLessThanOrEqual(90 * 86_400_000 + 1000);
  });

  it('keeps an approved entry approved when the counted time does not change', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([
      entry({
        approvalStatus: 'APPROVED',
        clockInAt: new Date('2026-09-30T22:00:00Z'),
        clockOutAt: new Date('2026-10-01T10:00:00Z'),
        paidMinutes: 720,
      }),
    ]);
    await service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE });
    expect(written().data).not.toHaveProperty('approvalStatus');
  });

  it('sends an approved entry back to Pending, with a note, when its counted time changes', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry({ approvalStatus: 'APPROVED', approvalNotes: 'ok' })]);
    await service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE });
    const { data } = written();
    expect(data.approvalStatus).toBe('PENDING');
    expect(data.approvedById).toBeNull();
    expect(data.approvalNotes).toMatch(/^ok\n.*9h 09m → 9h 00m/);
  });

  it('leaves an entry alone when the rota still has no shift for that day', async () => {
    resolver.resolveForClockIn.mockResolvedValue(null);
    prisma.timeEntry.findMany.mockResolvedValue([entry()]);
    await expect(service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE })).resolves.toBe(0);
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('writes nothing twice when another pass got there first', async () => {
    prisma.timeEntry.findMany.mockResolvedValue([entry()]);
    prisma.timeEntry.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.rematch({ organizationId: ORG, userId: USER, spaceId: SPACE })).resolves.toBe(0);
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('collapses a burst of rota edits for one person into one pass', async () => {
    jest.useFakeTimers();
    try {
      const run = jest.spyOn(service, 'rematch').mockResolvedValue(0);
      for (let d = 1; d <= 10; d++) {
        service.schedule({ organizationId: ORG, userId: USER, spaceId: SPACE, from: new Date(`2026-10-${String(d).padStart(2, '0')}T00:00:00Z`) });
      }
      jest.advanceTimersByTime(2000);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0][0].from).toEqual(new Date('2026-10-01T00:00:00Z'));
    } finally {
      jest.useRealTimers();
    }
  });
});
