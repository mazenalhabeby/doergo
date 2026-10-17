import { ABSENCE_WHERE } from '@hbcfield/shared';
/**
 * ⚠️ ONLY LEAVE IS AN ABSENCE (requests/request-kinds.ts ABSENCE_WHERE).
 *
 * A remote day, changed hours or agreed overtime is a day WORKED. A reader that asks "is this
 * person off?" and counts them excuses somebody from a shift they still owe, thins cover that is
 * not thin, and draws their allowance down. The prisma double below answers like Postgres would:
 * it honours `where.kind`, so a reader that forgets the filter gets the remote day back.
 */
import { ShiftSweepService } from '../../attendance/shift-sweep.service';
import { CoverService } from '../cover.service';
import { LeaveRecordsService } from '../leave-records.service';
import { LeaveLedgerService } from '../leave-ledger.service';

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const ROWS = [
  { id: 'remote-1', technicianId: 'u1', kind: 'REMOTE', type: 'VACATION', status: 'APPROVED', startDate: day('2026-10-09'), endDate: day('2026-10-09') },
];
/** findMany that filters by kind the way the database would. */
const byKind = (rows: any[]) => jest.fn(async ({ where }: any) =>
  rows.filter((r) => !where?.kind || (typeof where.kind === 'string' ? r.kind === where.kind : where.kind.in.includes(r.kind))));

describe('only leave is an absence', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-09T05:10:00.000Z')));
  afterAll(() => jest.useRealTimers());

  it('the no-show sweep does NOT excuse a shift on an approved remote day', async () => {
    const svc = Object.create(ShiftSweepService.prototype) as any;
    svc.prisma = {
      shiftInstance: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'inst-1', userId: 'u1', spaceId: 'space-1', shiftId: 'shift-1', organizationId: 'org-1',
          localDate: '2026-10-09', expectedClockInAt: new Date('2026-10-09T05:00:00.000Z'), reminderCount: 0,
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', firstName: 'Karim', lastName: 'Ahmad' }]) },
      timeOff: { findMany: byKind(ROWS) },
      shift: { findMany: jest.fn().mockResolvedValue([]) },
    };
    svc.notificationClient = { emit: jest.fn() };
    svc.routing = { notifyTargetsFor: jest.fn().mockResolvedValue(['leader-1']) };
    const res = await svc.runNoShowSweep();
    expect(res.data.excusedCount).toBe(0);
    expect(res.data.remindedCount).toBe(1);
    // Since 2026-10-14 the sweep asks NoShowSettleService what is proven, and
    // that reads approved time off through the one absence filter.
    expect(ABSENCE_WHERE).toEqual({ kind: 'LEAVE' });
    const settleSource = require('fs').readFileSync(
      require('path').join(__dirname, '../../attendance/no-show-settle.service.ts'),
      'utf8',
    );
    expect(settleSource).toMatch(/timeOff\.findMany\(\{[\s\S]*?\.\.\.ABSENCE_WHERE/);
  });

  it('cover does not count somebody working remotely as off', async () => {
    const svc = Object.create(CoverService.prototype) as any;
    svc.prisma = { timeOff: { findMany: byKind(ROWS) } };
    const leave = await svc.approvedLeave(['u1'], '2026-10-01', '2026-10-31');
    expect(leave).toEqual([]);
    expect(svc.prisma.timeOff.findMany.mock.calls[0][0].where.kind).toBe('LEAVE');
  });

  it('the allowance is never drawn down by a remote day (its row still carries type VACATION)', async () => {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', leaveAllowance: 25, organizationId: 'org-1', employmentStartDate: null, organization: { id: 'org-1', defaultLeaveAllowance: 25, leaveYearMode: 'CALENDAR', carryOverMode: 'NONE', timezone: 'UTC' } }) },
      timeOff: { findMany: byKind(ROWS) },
      leaveAdjustment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const calendarRules = { personRules: jest.fn(), personRulesMany: jest.fn().mockResolvedValue(new Map()) } as any;
    const service = new LeaveRecordsService(
      prisma,
      {} as any,
      {} as any,
      calendarRules,
      {} as any,
      new LeaveLedgerService(prisma, calendarRules),
    );
    const res: any = await service.getLeaveBalance({ technicianId: 'u1', organizationId: 'org-1' });
    expect(res.data).toMatchObject({ taken: 0, pending: 0, remaining: 25 });
    expect(prisma.timeOff.findMany.mock.calls[0][0].where.kind).toBe('LEAVE');
  });
});
