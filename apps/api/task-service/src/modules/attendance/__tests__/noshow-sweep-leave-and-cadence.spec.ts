/**
 * The no-show sweep: who is excused by approved leave, and how often the rest
 * are nudged.
 *
 * Two bugs pinned here:
 *  - the LAST day of leave did not excuse — `TimeOff.endDate` is a DATE (UTC
 *    midnight) and was compared with the shift's start INSTANT, so 07:00 in
 *    Vienna on the last day (05:00Z) fell "after" the leave;
 *  - the sweep always nudged every 5 min, 3 times, whatever the shift said.
 */
import { ShiftSweepService, shiftNudgeCadence } from '../no-shows/shift-sweep.service';
import { NoShowSettleService } from '../no-shows/no-show-settle.service';

const NOW = new Date('2026-10-09T05:10:00.000Z');

type Inst = {
  id: string;
  userId: string;
  spaceId: string;
  shiftId: string;
  organizationId: string;
  localDate: string;
  expectedClockInAt: Date;
  reminderCount: number;
};

function inst(over: Partial<Inst> = {}): Inst {
  return {
    id: 'inst-1',
    userId: 'u1',
    spaceId: 'space-1',
    shiftId: 'shift-1',
    organizationId: 'org-1',
    // 07:00 Europe/Vienna (CEST, UTC+2) on 9 Oct = 05:00Z
    localDate: '2026-10-09',
    expectedClockInAt: new Date('2026-10-09T05:00:00.000Z'),
    reminderCount: 0,
    ...over,
  };
}

// What Prisma hands back for a DATE column: UTC midnight of the stored day.
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

function service(due: Inst[], opts: { leaves?: any[]; shifts?: any[] } = {}) {
  const svc = Object.create(ShiftSweepService.prototype) as any;
  svc.prisma = {
    shiftInstance: {
      findMany: jest.fn().mockResolvedValue(due),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', firstName: 'Karim', lastName: 'Ahmad' }]) },
    timeOff: { findMany: jest.fn().mockResolvedValue(opts.leaves ?? []) },
    shift: { findMany: jest.fn().mockResolvedValue(opts.shifts ?? []) },
  };
  svc.notificationClient = { emit: jest.fn() };
  svc.routing = { notifyTargetsFor: jest.fn().mockResolvedValue(['leader-1']) };
  return svc;
}

const leaveTo = (endDate: string) => [{ technicianId: 'u1', startDate: day('2026-10-05'), endDate: day(endDate) }];

/*
  Leave is now one of the proofs NoShowSettleService reads (shared
  attendance/no-show.ts); the same two DATE-vs-instant bugs are pinned there.
*/
function settler(leaves: any[]) {
  const svc = Object.create(NoShowSettleService.prototype) as any;
  svc.prisma = {
    timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    timeOff: { findMany: jest.fn().mockResolvedValue(leaves) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', isActive: true, organizationId: 'org-1' }]) },
    shiftAssignment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // The rota still plans it: only the leave decides here.
  svc.shiftResolver = { matchAndWindowForDate: () => ({}) };
  svc.prisma.shiftAssignment.findMany.mockResolvedValue([
    { userId: 'u1', spaceId: 'space-1', shiftId: 'shift-1', recurrence: 'WEEKLY', daysOfWeek: [], daysOfMonth: [], dates: [], effectiveFrom: day('2026-01-01'), effectiveTo: null, shift: { isActive: true }, space: { timezone: 'Europe/Vienna' } },
  ]);
  return svc as NoShowSettleService;
}
const full = (o: Partial<Inst> = {}) => {
  const i = inst(o);
  return { ...i, expectedClockOutAt: new Date(i.expectedClockInAt.getTime() + 8 * 3_600_000) };
};

describe('no-show — approved leave closes it', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('on the LAST day of leave (07:00 Vienna on the end date)', async () => {
    const v = await settler(leaveTo('2026-10-09')).judge([full()]);
    expect(v.get('inst-1')).toEqual({ state: 'EXCUSED', reason: 'LEAVE' });
  });

  it('not the day AFTER leave ends', async () => {
    const v = await settler(leaveTo('2026-10-09')).judge([full({ localDate: '2026-10-10', expectedClockInAt: new Date('2026-10-10T05:00:00.000Z') })]);
    expect(v.get('inst-1')).toBeNull();
  });

  it('judged by the shift LOCAL day, not the UTC day of its start', async () => {
    const v = await settler(leaveTo('2026-10-09')).judge([full({ localDate: '2026-10-10', expectedClockInAt: new Date('2026-10-09T22:30:00.000Z') })]);
    expect(v.get('inst-1')).toBeNull();
  });

  it('the first day of leave too', async () => {
    const v = await settler(leaveTo('2026-10-09')).judge([full({ localDate: '2026-10-05' })]);
    expect(v.get('inst-1')).toEqual({ state: 'EXCUSED', reason: 'LEAVE' });
  });

  it('the sweep neither nudges nor tells anybody about a settled one', async () => {
    const svc = service([inst()]);
    svc.noShowSettle = { settle: jest.fn().mockResolvedValue(new Map([['inst-1', { state: 'EXCUSED', reason: 'LEAVE' }]])) };
    const res = await svc.runNoShowSweep();
    expect(res.data).toMatchObject({ excusedCount: 1, remindedCount: 0, escalatedCount: 0 });
    expect(svc.notificationClient.emit).not.toHaveBeenCalled();
  });
});

describe('no-show sweep — the shift’s own cadence', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('re-arms the next nudge at the shift’s interval', async () => {
    const svc = service([inst()], { shifts: [{ id: 'shift-1', reminderIntervalMin: 15, maxReminders: 2 }] });
    await svc.runNoShowSweep();
    expect(svc.prisma.shiftInstance.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: { state: 'REMINDED', reminderCount: 1, nextRemindAt: new Date(NOW.getTime() + 15 * 60_000) },
    });
  });

  it('escalates after the shift’s own number of nudges (2, not the default 3)', async () => {
    const svc = service([inst({ reminderCount: 2 })], { shifts: [{ id: 'shift-1', reminderIntervalMin: 15, maxReminders: 2 }] });
    const res = await svc.runNoShowSweep();
    expect(res.data.escalatedCount).toBe(1);
    expect(svc.notificationClient.emit).toHaveBeenCalledWith('attendance_noshow_escalation', expect.anything());
  });

  it('falls back to the defaults when the shift row is gone', async () => {
    const svc = service([inst({ reminderCount: 2 })]);
    const res = await svc.runNoShowSweep();
    expect(res.data.remindedCount).toBe(1); // 3rd of the default 3
    expect(svc.prisma.shiftInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nextRemindAt: new Date(NOW.getTime() + 5 * 60_000) }) }),
    );
  });

  it('loads every shift of the batch in ONE query', async () => {
    const svc = service([inst(), inst({ id: 'inst-2', shiftId: 'shift-2' }), inst({ id: 'inst-3' })]);
    await svc.runNoShowSweep();
    expect(svc.prisma.shift.findMany).toHaveBeenCalledTimes(1);
    expect(svc.prisma.shift.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['shift-1', 'shift-2'] } });
  });

  it('one cadence rule for both sweeps', () => {
    expect(shiftNudgeCadence(null)).toEqual({ intervalMin: 5, maxReminders: 3 });
    expect(shiftNudgeCadence({ reminderIntervalMin: 10, maxReminders: 1 })).toEqual({ intervalMin: 10, maxReminders: 1 });
  });
});
