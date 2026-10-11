/**
 * An APPROVED request applies to that day's clock-in on its own (requests/request-kinds.ts):
 *
 *   REMOTE   → away at that workspace is allowed (even where the site is STRICT — the approver
 *              decided that day) and carries the informational APPROVED_REMOTE instead of the
 *              review flag, so it is approved on arrival unless something ELSE needs a person;
 *   HOURS    → the expected start/end move before anything is judged: no LATE_ARRIVAL at the
 *              agreed start, and counted time runs from it;
 *   OVERTIME → the expected end extends, so the existing counted-time rule counts it.
 *
 * An approval covers only what was asked: lateness on a remote day is still lateness.
 */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NAMES, SERVICE_NAMES, computeCountedTime } from '@hbcfield/shared';
import { AttendanceService } from '../attendance.service';
import { ATTENDANCE_SERVICE_PARTS } from '../attendance-service-parts';
import { AttendanceGeocoderService } from '../attendance-geocoder.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { BreakReminderService } from '../break-reminder.service';
import { BreakService } from '../break.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';

const MIN = 60_000;
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
// 15 Sept 2026, Vienna is UTC+2: the shift is 08:00–16:00 local = 06:00Z–14:00Z.
const SHIFT = {
  shiftId: 'shift-1',
  expectedClockInAt: new Date('2026-09-15T06:00:00.000Z'),
  expectedClockOutAt: new Date('2026-09-15T14:00:00.000Z'),
  nextRemindAt: new Date('2026-09-15T14:15:00.000Z'),
  flagToleranceMin: 5,
};
const SITE = { lat: 47.9813, lng: 13.8269 };
const AWAY = { lat: 48.2082, lng: 16.3738 }; // Vienna city, ~200 km from the site
const location = {
  id: 'loc-1', name: 'Main Office', organizationId: 'org-1', isActive: true, isRemote: false, workModel: 'SHIFT_BASED',
  ...SITE, geofenceRadius: 50, geofencePolygon: null, geofencePolicy: 'STRICT', timezone: 'Europe/Vienna',
  noShiftPolicy: 'ALLOW', noShiftDailyMinutes: 480, updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  enabledModules: ['time_tracking'], organization: { enabledModules: ['time_tracking'] },
};
const request = (over: Record<string, unknown>) => ({
  id: 'req-1', kind: 'REMOTE', spaceId: 'loc-1', startTime: null, endTime: null, minutes: null,
  startDate: day('2026-09-15'), endDate: day('2026-09-15'), ...over,
});

async function build(opts: { requests?: any[]; shift?: any } = {}) {
  const prisma: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'u1', organizationId: 'org-1', allowRemote: false, role: 'EMPLOYEE', organization: { timezone: 'Europe/Vienna' } }),
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
    shiftInstance: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findFirst: jest.fn().mockResolvedValue(null) },
    breakRule: { findMany: jest.fn().mockResolvedValue([]) },
    shift: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AttendanceService, ...ATTENDANCE_SERVICE_PARTS,
      { provide: PresenceService, useValue: { atClockIn: jest.fn().mockResolvedValue({}), onPosition: jest.fn(), onBatch: jest.fn() } },
      BreakService, CountedTimeService, BreakRulesService, BreakReminderService,
      { provide: PrismaService, useValue: prisma },
      { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn(), getRepeatableJobs: jest.fn().mockResolvedValue([]) } },
      { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) } },
      { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(opts.shift === undefined ? SHIFT : opts.shift) } },
    ],
  }).compile();
  const service = moduleRef.get(AttendanceService);
  jest.spyOn(moduleRef.get(AttendanceGeocoderService), 'reverseGeocode').mockResolvedValue('Vienna');
  // Fulfilling the rota instance is not what these tests are about.
  jest.spyOn((service as any).clockIns.shiftSweeps, 'markShiftInstancePresent').mockResolvedValue(undefined);
  return { service, prisma };
}

const clockIn = (over: Record<string, unknown> = {}) => ({ userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', ...SITE, accuracy: 10, ...over });
const created = (prisma: any) => prisma.timeEntry.create.mock.calls[0][0].data;
const at = (iso: string) => {
  jest.setSystemTime(new Date(iso));
};

describe('clock-in with an approved request', () => {
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());

  describe('REMOTE', () => {
    it('control: away from a STRICT site with no approval is refused', async () => {
      at('2026-09-15T06:00:00.000Z');
      const { service } = await build();
      await expect(service.clockIn(clockIn(AWAY))).rejects.toMatchObject({ response: { code: 'OUTSIDE_GEOFENCE' } });
    });

    it('lets them clock in away at that workspace despite STRICT, flagged APPROVED_REMOTE and approved on arrival', async () => {
      at('2026-09-15T06:00:00.000Z');
      const { service, prisma } = await build({ requests: [request({})] });
      await service.clockIn(clockIn(AWAY));
      const data = created(prisma);
      expect(data.isRemote).toBe(true);
      expect(data.flagReasons).toContain('APPROVED_REMOTE');
      expect(data.flagReasons).not.toContain('OUTSIDE_GEOFENCE_IN');
      expect(data.approvalStatus).toBe('AUTO');
      // One indexed read, approved remote/hours/overtime only.
      expect(prisma.timeOff.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.timeOff.findMany.mock.calls[0][0].where).toMatchObject({ technicianId: 'u1', status: 'APPROVED', kind: { in: ['REMOTE', 'HOURS', 'OVERTIME'] } });
    });

    it('covers only WHERE — lateness on a remote day still goes to a person', async () => {
      at('2026-09-15T07:00:00.000Z'); // an hour late
      const { service, prisma } = await build({ requests: [request({})] });
      await service.clockIn(clockIn(AWAY));
      const data = created(prisma);
      expect(data.flagReasons).toEqual(expect.arrayContaining(['APPROVED_REMOTE', 'LATE_ARRIVAL']));
      expect(data.approvalStatus).toBe('PENDING');
    });

    it('does not apply to another workspace', async () => {
      at('2026-09-15T06:00:00.000Z');
      const { service } = await build({ requests: [request({ spaceId: 'elsewhere' })] });
      await expect(service.clockIn(clockIn(AWAY))).rejects.toMatchObject({ response: { code: 'OUTSIDE_GEOFENCE' } });
    });

    it('an assigned member pressing "Clock in remotely" is clocked in away AT the workspace — no REMOTE_NOT_FOR_ASSIGNED, no grant needed', async () => {
      at('2026-09-15T06:00:00.000Z');
      const { service, prisma } = await build({ requests: [request({})] });
      await service.clockIn({ userId: 'u1', organizationId: 'org-1', isRemote: true, ...AWAY, accuracy: 10 });
      const data = created(prisma);
      expect(data.locationId).toBe('loc-1');
      expect(data.flagReasons).toContain('APPROVED_REMOTE');
      expect(data.approvalStatus).toBe('AUTO');
    });

    it('control: without it, the same tap is refused as REMOTE_NOT_FOR_ASSIGNED… for a granted member', async () => {
      at('2026-09-15T06:00:00.000Z');
      const { service, prisma } = await build();
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', organizationId: 'org-1', allowRemote: true, role: 'EMPLOYEE', organization: { timezone: 'Europe/Vienna' } });
      await expect(service.clockIn({ userId: 'u1', organizationId: 'org-1', isRemote: true, ...AWAY, accuracy: 10 }))
        .rejects.toMatchObject({ response: { code: 'REMOTE_NOT_FOR_ASSIGNED' } });
    });
  });

  describe('HOURS', () => {
    // Start at 10:00 local (08:00Z) instead of 08:00.
    const later = request({ kind: 'HOURS', startTime: '10:00' });

    it('control: arriving at 10:00 against an 08:00 shift is late', async () => {
      at('2026-09-15T08:00:00.000Z');
      const { service, prisma } = await build();
      await service.clockIn(clockIn());
      expect(created(prisma).flagReasons).toContain('LATE_ARRIVAL');
    });

    it('no LATE_ARRIVAL at the agreed start; the expected start moved and counted time runs from it', async () => {
      at('2026-09-15T08:00:00.000Z');
      const { service, prisma } = await build({ requests: [later] });
      await service.clockIn(clockIn());
      const data = created(prisma);
      expect(data.flagReasons).not.toContain('LATE_ARRIVAL');
      expect(data.approvalStatus).toBe('AUTO');
      expect(data.expectedClockInAt).toEqual(new Date('2026-09-15T08:00:00.000Z'));
      expect(data.expectedClockOutAt).toEqual(SHIFT.expectedClockOutAt);
      // The existing rule, reading what was stamped: 10:00 → 16:00 local = 360 minutes.
      const counted = computeCountedTime({
        clockInAt: data.clockInAt,
        clockOutAt: new Date('2026-09-15T14:00:00.000Z'),
        expectedStartAt: data.expectedClockInAt,
        expectedEndAt: data.expectedClockOutAt,
        toleranceMin: 5,
      });
      expect(counted.paidMinutes).toBe(360);
    });

    it('arriving before the agreed start is counted from the agreed start', async () => {
      at('2026-09-15T07:00:00.000Z');
      const { service, prisma } = await build({ requests: [later] });
      await service.clockIn(clockIn());
      const data = created(prisma);
      const counted = computeCountedTime({ clockInAt: data.clockInAt, clockOutAt: new Date('2026-09-15T14:00:00.000Z'), expectedStartAt: data.expectedClockInAt, expectedEndAt: data.expectedClockOutAt });
      expect(counted.countedStartAt).toEqual(new Date('2026-09-15T08:00:00.000Z'));
    });
  });

  describe('OVERTIME', () => {
    it('extends the expected end by the agreed minutes, and re-arms the clock-out reminder after it', async () => {
      at('2026-09-15T06:00:00.000Z');
      const { service, prisma } = await build({ requests: [request({ kind: 'OVERTIME', spaceId: null, minutes: 120 })] });
      await service.clockIn(clockIn());
      const data = created(prisma);
      expect(data.expectedClockOutAt).toEqual(new Date(SHIFT.expectedClockOutAt.getTime() + 120 * MIN));
      expect(data.nextRemindAt.getTime()).toBeGreaterThan(data.expectedClockOutAt.getTime());
      expect(data.approvalStatus).toBe('AUTO');
    });
  });
});

describe('the clock-in list with an approved remote day', () => {
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());

  it('tags the STRICT workspace awayAllowed for today only — the phone’s offline check reads the tag', async () => {
    at('2026-09-15T06:00:00.000Z');
    const { service: without } = await build();
    const none: any = await without.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });
    expect(none.data[0].awayAllowed).toBe(false);

    const { service, prisma } = await build({ requests: [request({})] });
    const res: any = await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });
    expect(res.data[0].awayAllowed).toBe(true);
    expect(prisma.timeOff.findMany.mock.calls[0][0].where.kind).toEqual({ in: ['REMOTE'] });
  });

  it('a remote day on ANOTHER date does not tag it', async () => {
    at('2026-09-15T06:00:00.000Z');
    const { service } = await build({ requests: [request({ startDate: day('2026-09-16'), endDate: day('2026-09-16') })] });
    const res: any = await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });
    expect(res.data[0].awayAllowed).toBe(false);
  });
});
