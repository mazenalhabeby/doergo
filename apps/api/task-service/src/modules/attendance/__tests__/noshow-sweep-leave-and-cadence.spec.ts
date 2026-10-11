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
import { ShiftSweepService, shiftNudgeCadence } from '../shift-sweep.service';

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

describe('no-show sweep — approved leave', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('excuses a shift on the LAST day of leave (07:00 Vienna on the end date)', async () => {
    const svc = service([inst()], { leaves: leaveTo('2026-10-09') });
    const res = await svc.runNoShowSweep();
    expect(res.data.excusedCount).toBe(1);
    expect(svc.prisma.shiftInstance.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inst-1'] } },
      data: { state: 'EXCUSED', nextRemindAt: null },
    });
    expect(svc.notificationClient.emit).not.toHaveBeenCalled();
  });

  it('chases the day AFTER leave ends', async () => {
    const svc = service([inst({ localDate: '2026-10-10', expectedClockInAt: new Date('2026-10-10T05:00:00.000Z') })], {
      leaves: leaveTo('2026-10-09'),
    });
    const res = await svc.runNoShowSweep();
    expect(res.data.excusedCount).toBe(0);
    expect(res.data.remindedCount).toBe(1);
  });

  it('judges by the shift LOCAL day, not the UTC day of its start', async () => {
    // 00:30 Vienna on 10 Oct is 22:30Z on 9 Oct: leave ending 9 Oct must NOT
    // excuse a shift whose own day is the 10th.
    const svc = service(
      [inst({ localDate: '2026-10-10', expectedClockInAt: new Date('2026-10-09T22:30:00.000Z') })],
      { leaves: leaveTo('2026-10-09') },
    );
    expect((await svc.runNoShowSweep()).data.excusedCount).toBe(0);
  });

  it('excuses the first day of leave too, and reads only leave that can still apply', async () => {
    const svc = service([inst({ localDate: '2026-10-05' })], { leaves: leaveTo('2026-10-09') });
    expect((await svc.runNoShowSweep()).data.excusedCount).toBe(1);
    expect(svc.prisma.timeOff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ endDate: { gte: day('2026-10-05') } }) }),
    );
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
