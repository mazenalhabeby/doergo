/**
 * Two clock-in findings from the 2026-10 attendance audit.
 *
 * 1. The Remote bucket is for somebody with NO workspace. A member assigned to
 *    workspaces (one of them STRICT) sent `isRemote: true` and was clocked in
 *    with no flags, no rota match and no no-show fulfilment — walking around the
 *    site's ceiling entirely.
 *
 * 2. A workspace that schedules nothing (workModel NONE, the default) flagged
 *    every clock-in UNSCHEDULED_DAY — review + a pending-approval push for a
 *    shift nobody was meant to have — and SHIFT_ONLY there refused everybody.
 */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  QUEUE_NAMES,
  SERVICE_NAMES,
  effectiveNoShiftPolicy,
  noShiftPolicyConflict,
  workspaceSchedulesShifts,
} from '@hbcfield/shared';
import { AttendanceService } from '../attendance.service';
import { ATTENDANCE_SERVICE_PARTS } from '../attendance-service-parts';
import { AttendanceGeocoderService } from '../attendance-geocoder.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { BreakReminderService } from '../break-reminder.service';
import { BREAK_SERVICES } from '../break-services';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '@hbcfield/shared';
import { PresenceService } from '../presence/presence.service';
import { SpaceUpdateService } from '../../spaces/space-update.service';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const SITE = { lat: 47.9813, lng: 13.8269 };
const SPACE = {
  id: 'loc-1',
  name: 'Yard',
  organizationId: 'org-1',
  isActive: true,
  isRemote: false,
  workModel: 'NONE',
  ...SITE,
  geofenceRadius: 50,
  geofencePolygon: null,
  geofencePolicy: 'STRICT',
  timezone: 'Europe/Vienna',
  noShiftPolicy: 'ALLOW',
  noShiftDailyMinutes: 480,
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  isDefault: false,
  enabledModules: ['time_tracking'],
  organization: { enabledModules: ['time_tracking'] },
};
const BUCKET = {
  id: 'remote-1',
  name: 'Remote',
  organizationId: 'org-1',
  isActive: true,
  isRemote: true,
  workModel: 'NONE',
  timezone: 'Europe/Vienna',
  lat: null,
  lng: null,
};

async function build(
  opts: { role?: string; allowRemote?: boolean; assigned?: boolean; space?: Partial<typeof SPACE> } = {},
) {
  const assignments = opts.assigned === false ? [] : [{ spaceId: 'loc-1', allowRemote: null, isPrimary: true }];
  const space = { ...SPACE, ...opts.space };
  const prisma: any = {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: 'u1',
          organizationId: 'org-1',
          allowRemote: opts.allowRemote ?? true,
          role: opts.role ?? 'EMPLOYEE',
          organization: { timezone: 'Europe/Vienna' },
        }),
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Mike', lastName: 'Weber' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    timeOff: { findMany: jest.fn().mockResolvedValue([]) },
    companyLocation: {
      // On-site path reads the workspace; the bucket path reads the bucket.
      findFirst: jest.fn(async ({ where }: any) => (where?.isRemote ? BUCKET : space)),
      findMany: jest.fn().mockResolvedValue(assignments.length ? [space] : []),
      create: jest.fn().mockResolvedValue(BUCKET),
    },
    spaceAssignment: {
      findFirst: jest.fn().mockResolvedValue(assignments.length ? { id: 'a1', allowRemote: null } : null),
      findMany: jest.fn().mockResolvedValue(assignments),
    },
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'e-new', ...data, location: space })),
    },
    shiftInstance: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
      { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(null) } },
    ],
  }).compile();
  const service = moduleRef.get(AttendanceService);
  jest.spyOn(moduleRef.get(AttendanceGeocoderService), 'reverseGeocode').mockResolvedValue(null);
  return { service, prisma };
}

const FAR = { lat: 48.2, lng: 16.37 }; // Vienna, ~190 km from the yard
const tap = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  organizationId: 'org-1',
  accuracy: 10,
  ...SITE,
  ...over,
});

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(NOW);
});
afterAll(() => jest.useRealTimers());

describe('the Remote bucket is only for somebody with no workspace', () => {
  it('refuses isRemote from a member assigned to a (strict) workspace — coded, nothing written', async () => {
    const { service, prisma } = await build({ allowRemote: true });
    await expect(service.clockIn(tap({ isRemote: true, ...FAR }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REMOTE_NOT_FOR_ASSIGNED' }),
    });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    expect(prisma.companyLocation.create).not.toHaveBeenCalled();
  });

  it('refuses it from an ADMIN with workspaces too — the same rule', async () => {
    const { service, prisma } = await build({ role: 'ADMIN', allowRemote: false });
    await expect(service.clockIn(tap({ isRemote: true, ...FAR }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REMOTE_NOT_FOR_ASSIGNED' }),
    });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  /*
    ⚠️ Recorded offline from an out-of-date list, the day is KEPT — refusing at
    sync would throw away hours actually worked. A person decides.
  */
  it('keeps an OFFLINE remote clock-in from a member with a workspace, flagged for review', async () => {
    const TAP = new Date(NOW.getTime() - 20 * 60_000);
    const anchorAt = new Date(TAP.getTime() - 5 * 60_000);
    const { service, prisma } = await build({ allowRemote: true });
    await service.clockIn(
      tap({
        isRemote: true,
        ...FAR,
        evidence: {
          occurredAt: TAP.toISOString(),
          uptimeMs: 1_000_000 + 5 * 60_000,
          anchor: { serverTime: anchorAt.toISOString(), uptimeMs: 1_000_000 },
          fix: { ...FAR, accuracy: 12, fixAt: TAP.toISOString() },
        },
      }),
    );
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ locationId: 'remote-1', isRemote: true, clockInAt: TAP, approvalStatus: 'PENDING' });
    expect(data.flagReasons).toEqual(expect.arrayContaining(['RECORDED_OFFLINE', 'REMOTE_WITH_WORKSPACE']));
  });

  it('a member with NO workspace offline gets no REMOTE_WITH_WORKSPACE flag', async () => {
    const TAP = new Date(NOW.getTime() - 20 * 60_000);
    const { service, prisma } = await build({ allowRemote: true, assigned: false });
    await service.clockIn(
      tap({
        isRemote: true,
        ...FAR,
        evidence: {
          occurredAt: TAP.toISOString(),
          uptimeMs: 1_000_000 + 5 * 60_000,
          anchor: { serverTime: new Date(TAP.getTime() - 5 * 60_000).toISOString(), uptimeMs: 1_000_000 },
          fix: { ...FAR, accuracy: 12, fixAt: TAP.toISOString() },
        },
      }),
    );
    expect(prisma.timeEntry.create.mock.calls[0][0].data.flagReasons).not.toContain('REMOTE_WITH_WORKSPACE');
  });

  it('asks about the moment of the tap, with the same window rule as the list', async () => {
    const { service, prisma } = await build({ allowRemote: true });
    await service.clockIn(tap({ isRemote: true, ...FAR })).catch(() => undefined);
    const where = prisma.spaceAssignment.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.effectiveFrom.lte).toEqual(NOW);
  });

  it('a workspace without Time Tracking does not close the bucket (the list does not offer it either)', async () => {
    const { service, prisma } = await build({
      allowRemote: true,
      space: { enabledModules: [], organization: { enabledModules: [] } } as never,
    });
    await service.clockIn(tap({ isRemote: true, ...FAR }));
    expect(prisma.timeEntry.create.mock.calls[0][0].data).toMatchObject({ locationId: 'remote-1', isRemote: true });
  });

  it('still clocks a member with no workspace into the bucket, recorded as remote', async () => {
    const { service, prisma } = await build({ allowRemote: true, assigned: false });
    await service.clockIn(tap({ isRemote: true, ...FAR }));
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ locationId: 'remote-1', isRemote: true, clockInWithinGeofence: true });
  });

  it('a member without the grant is still refused first, as before', async () => {
    const { service } = await build({ allowRemote: false, assigned: false });
    await expect(service.clockIn(tap({ isRemote: true }))).rejects.toThrow(/not permitted to clock in remotely/);
  });

  it('the strict site still refuses them away, through the workspace — the only door left', async () => {
    const { service } = await build({ allowRemote: true });
    await expect(service.clockIn(tap({ locationId: 'loc-1', ...FAR }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OUTSIDE_GEOFENCE' }),
    });
  });
});

describe('a workspace that schedules nothing', () => {
  it('does not flag UNSCHEDULED_DAY at workModel NONE — the entry is not sent to review', async () => {
    const { service, prisma } = await build();
    await service.clockIn(tap({ locationId: 'loc-1' }));
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data.flagReasons).not.toContain('UNSCHEDULED_DAY');
    expect(data.approvalStatus).toBe('AUTO');
  });

  it('does not flag UNSCHEDULED_DAY at a TASK workspace either — task-based work plans no shifts', async () => {
    const { service, prisma } = await build({ space: { workModel: 'TASK' } as never });
    await service.clockIn(tap({ locationId: 'yard-1' }));
    expect(prisma.timeEntry.create.mock.calls[0][0].data.flagReasons).not.toContain('UNSCHEDULED_DAY');
  });

  it('still flags it where shifts ARE scheduled and none matched', async () => {
    const { service, prisma } = await build({ space: { workModel: 'SHIFT' } });
    await service.clockIn(tap({ locationId: 'loc-1' }));
    expect(prisma.timeEntry.create.mock.calls[0][0].data.flagReasons).toContain('UNSCHEDULED_DAY');
  });

  it('reads SHIFT_ONLY at a NONE workspace as ALLOW (a row saved before the rule existed)', async () => {
    const { service, prisma } = await build({ space: { noShiftPolicy: 'SHIFT_ONLY' } });
    await service.clockIn(tap({ locationId: 'loc-1' }));
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data.expectedClockOutAt).toBeUndefined();
    expect(data.endIsDailyLimit).toBe(false);
  });

  it('keeps LIMIT working at a NONE workspace', async () => {
    const { service, prisma } = await build({ space: { noShiftPolicy: 'LIMIT', noShiftDailyMinutes: 120 } });
    await service.clockIn(tap({ locationId: 'loc-1' }));
    const data = prisma.timeEntry.create.mock.calls[0][0].data;
    expect(data.endIsDailyLimit).toBe(true);
    expect(data.expectedClockOutAt).toEqual(new Date(NOW.getTime() + 120 * 60_000));
  });

  it('tags SHIFT_ONLY at a NONE workspace as free, so the phone does not refuse it offline', async () => {
    const { service } = await build({ space: { noShiftPolicy: 'SHIFT_ONLY' } });
    const res: any = await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });
    expect(res.data[0].noShift).toBeNull();
  });
});

describe('the shared rule', () => {
  it.each([
    [null, false],
    [undefined, false],
    ['NONE', false],
    ['SHIFT', true],
    ['FIXED', true],
    ['TASK', false],
  ])('workModel %s schedules shifts: %s', (wm, expected) => {
    expect(workspaceSchedulesShifts(wm as string | null | undefined)).toBe(expected);
  });

  it('SHIFT_ONLY applies only where shifts are scheduled; LIMIT and ALLOW always', () => {
    expect(effectiveNoShiftPolicy('SHIFT_ONLY', 'NONE')).toBe('ALLOW');
    expect(effectiveNoShiftPolicy('SHIFT_ONLY', 'SHIFT')).toBe('SHIFT_ONLY');
    expect(effectiveNoShiftPolicy('LIMIT', 'NONE')).toBe('LIMIT');
    expect(effectiveNoShiftPolicy('nonsense', 'SHIFT')).toBe('ALLOW');
    expect(noShiftPolicyConflict('SHIFT_ONLY', 'NONE')).toBe('SHIFT_ONLY_WITHOUT_SHIFTS');
    expect(noShiftPolicyConflict('SHIFT_ONLY', 'SHIFT')).toBeNull();
    expect(noShiftPolicyConflict('LIMIT', 'NONE')).toBeNull();
  });
});

describe('saving the workspace settings', () => {
  const existing = { id: 'loc-1', organizationId: 'org-1', workModel: 'NONE', noShiftPolicy: 'ALLOW' };
  const makeService = (row: Record<string, unknown> = existing) => {
    const prisma: any = {
      companyLocation: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(async ({ data }: any) => ({ ...row, ...data })),
      },
    };
    return { svc: new SpaceUpdateService(prisma, { emit: jest.fn() } as never), prisma };
  };
  const base = { id: 'loc-1', organizationId: 'org-1', userId: 'admin' };

  it('refuses SHIFT_ONLY on a NONE workspace, coded, before writing', async () => {
    const { svc, prisma } = makeService();
    await expect(svc.update({ ...base, noShiftPolicy: 'SHIFT_ONLY' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SHIFT_ONLY_WITHOUT_SHIFTS' }),
    });
    expect(prisma.companyLocation.update).not.toHaveBeenCalled();
  });

  it('refuses switching a SHIFT_ONLY workspace to NONE without changing the rule', async () => {
    const { svc } = makeService({ ...existing, workModel: 'SHIFT', noShiftPolicy: 'SHIFT_ONLY' });
    await expect(svc.update({ ...base, workModel: 'NONE' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SHIFT_ONLY_WITHOUT_SHIFTS' }),
    });
  });

  it('accepts SHIFT_ONLY together with a work model that schedules shifts', async () => {
    const { svc, prisma } = makeService();
    await svc.update({ ...base, workModel: 'SHIFT', noShiftPolicy: 'SHIFT_ONLY' }).catch(() => undefined);
    expect(prisma.companyLocation.update).toHaveBeenCalled();
  });

  it('accepts LIMIT on a NONE workspace', async () => {
    const { svc, prisma } = makeService();
    await svc.update({ ...base, noShiftPolicy: 'LIMIT', noShiftDailyMinutes: 240 }).catch(() => undefined);
    expect(prisma.companyLocation.update).toHaveBeenCalled();
  });

  it('a rename never trips over a row that already holds the pair', async () => {
    const { svc, prisma } = makeService({ ...existing, noShiftPolicy: 'SHIFT_ONLY' });
    await svc.update({ ...base, name: 'New name' }).catch(() => undefined);
    expect(prisma.companyLocation.update).toHaveBeenCalled();
  });
});
