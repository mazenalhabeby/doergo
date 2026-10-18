/**
 * "Late" on an afternoon that started on time — the SECOND clock-in of a shift.
 *
 * Somebody on 08:00–16:00 clocks out for lunch at 12:00 and back in at 13:00
 * (or the automatic clock does it for them, or a provisional close is followed
 * by a fresh clock-in). The resolver binds the same shift — it has not ended —
 * and the new entry is judged against 08:00: LATE_ARRIVAL by five hours, sent
 * to review, while the morning entry already says they arrived on time.
 *
 * Fixed by the label rules (docs/plans/clock-attendance-2026-10.md): only the
 * first entry of a shift instance is judged late; the return is judged as a rest.
 */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NAMES, SERVICE_NAMES } from '@hbcfield/shared';
import { AttendanceService } from '../attendance.service';
import { ATTENDANCE_SERVICE_PARTS } from '../attendance-service-parts';
import { AttendanceGeocoderService } from '../attendance-geocoder.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { BreakReminderService } from '../break-reminder.service';
import { BREAK_SERVICES } from '../break-services';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';

// 15 Sept 2026, Vienna is UTC+2: the shift is 08:00–16:00 local = 06:00Z–14:00Z.
const SHIFT = {
  shiftId: 'shift-1',
  expectedClockInAt: new Date('2026-09-15T06:00:00.000Z'),
  expectedClockOutAt: new Date('2026-09-15T14:00:00.000Z'),
  nextRemindAt: new Date('2026-09-15T14:15:00.000Z'),
  flagToleranceMin: 5,
};
const SITE = { lat: 47.9813, lng: 13.8269 };
const location = {
  id: 'loc-1',
  name: 'Main Office',
  organizationId: 'org-1',
  isActive: true,
  isRemote: false,
  workModel: 'SHIFT_BASED',
  ...SITE,
  geofenceRadius: 50,
  geofencePolygon: null,
  geofencePolicy: 'STRICT',
  timezone: 'Europe/Vienna',
  noShiftPolicy: 'ALLOW',
  noShiftDailyMinutes: 480,
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  enabledModules: ['time_tracking'],
  organization: { enabledModules: ['time_tracking'] },
};
async function build(opts: { requests?: any[]; shift?: any } = {}) {
  const prisma: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'u1',
        organizationId: 'org-1',
        allowRemote: false,
        role: 'EMPLOYEE',
        organization: { timezone: 'Europe/Vienna' },
      }),
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Mike', lastName: 'Weber' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    companyLocation: {
      findFirst: jest.fn().mockResolvedValue(location),
      findMany: jest.fn().mockResolvedValue([location]),
    },
    // The ONE read of approved requests — what Postgres would return for this member.
    timeOff: { findMany: jest.fn().mockResolvedValue(opts.requests ?? []) },
    spaceAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1', allowRemote: null }),
      findMany: jest.fn().mockResolvedValue([{ spaceId: 'loc-1', allowRemote: null, isPrimary: true }]),
    },
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'e-new', ...data, location })),
    },
    break: { findMany: jest.fn().mockResolvedValue([]) },
    shiftInstance: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    breakRule: { findMany: jest.fn().mockResolvedValue([]) },
    shift: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AttendanceService,
      ...ATTENDANCE_SERVICE_PARTS,
      {
        provide: PresenceService,
        useValue: { atClockIn: jest.fn().mockResolvedValue({}), onPosition: jest.fn(), onBatch: jest.fn() },
      },
      ...BREAK_SERVICES,
      CountedTimeService,
      BreakRulesService,
      BreakReminderService,
      { provide: PrismaService, useValue: prisma },
      { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      {
        provide: getQueueToken(QUEUE_NAMES.OVERTIME),
        useValue: { add: jest.fn(), getRepeatableJobs: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: NotificationRoutingService,
        useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) },
      },
      {
        provide: ShiftResolverService,
        useValue: { resolveForClockIn: jest.fn().mockResolvedValue(opts.shift === undefined ? SHIFT : opts.shift) },
      },
    ],
  }).compile();
  const service = moduleRef.get(AttendanceService);
  jest.spyOn(moduleRef.get(AttendanceGeocoderService), 'reverseGeocode').mockResolvedValue('Vienna');
  // Fulfilling the rota instance is not what these tests are about.
  jest.spyOn((service as any).clockIns.site.shiftSweeps, 'markShiftInstancePresent').mockResolvedValue(undefined);
  return { service, prisma };
}

const clockIn = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  organizationId: 'org-1',
  locationId: 'loc-1',
  ...SITE,
  accuracy: 10,
  ...over,
});
const created = (prisma: any) => prisma.timeEntry.create.mock.calls[0][0].data;
const at = (iso: string) => {
  jest.setSystemTime(new Date(iso));
};

describe('late label — a second clock-in on the same shift', () => {
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());

  // The morning entry: on time at 07:58 local, clocked out 12:00 local, same shift instance.
  const morning = {
    id: 'e-morning',
    userId: 'u1',
    locationId: 'loc-1',
    shiftId: 'shift-1',
    status: 'CLOCKED_OUT',
    clockInAt: new Date('2026-09-15T05:58:00.000Z'),
    clockOutAt: new Date('2026-09-15T10:00:00.000Z'),
    expectedClockInAt: SHIFT.expectedClockInAt,
    expectedClockOutAt: SHIFT.expectedClockOutAt,
    flagReasons: [],
  };

  it('control: the FIRST clock-in at 07:58 is not late', async () => {
    at('2026-09-15T05:58:00.000Z');
    const { service, prisma } = await build();
    await service.clockIn(clockIn());
    expect(created(prisma).flagReasons).not.toContain('LATE_ARRIVAL');
  });

  /** The earlier entry of the same shift instance, as priorEntryOfShift reads it. */
  const withMorning = (prisma: any, breakPlan: unknown = null) =>
    prisma.timeEntry.findFirst.mockImplementation(async ({ where }: any) =>
      where?.expectedClockInAt ? { clockOutAt: morning.clockOutAt, breakPlan } : null,
    );

  it('back from lunch at 13:00 on the same shift is NOT late', async () => {
    at('2026-09-15T11:00:00.000Z');
    const { service, prisma } = await build();
    withMorning(prisma);
    await service.clockIn(clockIn());
    const data = created(prisma);
    expect(data.flagReasons).not.toContain('LATE_ARRIVAL');
    expect(data.labelFacts.firstOfShift).toBe(false);
    expect(data.labelRules).toBe(1);
  });

  it('back after a planned 30 min lunch that took 60 min is LATE_FROM_REST, sent to review', async () => {
    at('2026-09-15T11:00:00.000Z');
    const { service, prisma } = await build();
    withMorning(prisma, [{ state: 'PENDING', dueAt: '2026-09-15T10:00:00.000Z', durationMinutes: 30 }]);
    await service.clockIn(clockIn());
    const data = created(prisma);
    expect(data.flagReasons).toContain('LATE_FROM_REST');
    expect(data.flagReasons).not.toContain('LATE_ARRIVAL');
    expect(data.labelFacts.rest).toEqual({ plannedMin: 30, takenMin: 60, overMin: 25 });
    expect(data.approvalStatus).toBe('PENDING');
  });

  it('back within the planned rest + grace is not flagged', async () => {
    at('2026-09-15T10:34:00.000Z');
    const { service, prisma } = await build();
    withMorning(prisma, [{ state: 'PENDING', dueAt: '2026-09-15T10:00:00.000Z', durationMinutes: 30 }]);
    await service.clockIn(clockIn());
    expect(created(prisma).flagReasons).not.toContain('LATE_FROM_REST');
  });
});
