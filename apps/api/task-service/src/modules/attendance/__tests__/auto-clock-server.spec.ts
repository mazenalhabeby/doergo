import { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';
import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';
import { autoClockParts, type AutoClockServiceParts } from './auto-clock.service.fixture';
/**
 * The automatic clock's server half (attendance/auto-clock/auto-clock.service.ts + the
 * clock-in / clock-out / close / sweeps it rides on).
 *
 * The phone decides arrival and departure offline; EVERYTHING it sends is a
 * claim the server re-checks. These tests pin the security boundaries:
 *   • a forged AUTO (no consent, not chosen, outside the window) is recorded as
 *     an ordinary clock-in — never marked, never refused;
 *   • an undo is the owner's alone (anybody else: 404, like a missing entry),
 *     only while nothing is recorded on it, and a replay answers done;
 *   • the plan costs a FIXED number of queries whatever the number of workspaces,
 *     and nothing at all without consent;
 *   • the automatic rest is a rest ROW inserted before counted time;
 *   • "still inside after the end" uses the workspace's own thresholds.
 */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { QUEUE_NAMES, SERVICE_NAMES, TimeEntryStatus, AUTO_CLOCK_DEFAULTS } from '@hbcfield/shared';
import { AttendanceService } from '../attendance.service';
import { ATTENDANCE_SERVICE_PARTS } from '../attendance-service-parts';
import { AttendanceGeocoderService } from '../core/attendance-geocoder.service';
import { ShiftResolverService } from '../core/shift-resolver.service';
import { CountedTimeService } from '../core/counted-time.service';
import { BreakRulesService } from '../core/break-rules.service';
import { BreakReminderService } from '../rests/break-reminder.service';
import { BREAK_SERVICES } from '../rests/break-services';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { PrismaService } from '@hbcfield/shared';
import { PresenceService } from '../presence/presence.service';
import { AUTO_UNDO_EVENT } from '../auto-clock/auto-clock.service';
import { clockOutServices } from './clock-out.service.fixture';
import { shiftSweepParts } from './shift-sweep.service.fixture';

const ON = { ...AUTO_CLOCK_DEFAULTS, enabled: true, leaderAfterMinutes: 5, closeAfterMinutes: 60, autoRestMinutes: 30 };
// 15 Sept 2026, Vienna UTC+2: the shift is 08:00–16:00 local = 06:00Z–14:00Z.
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
  name: 'Halle',
  organizationId: 'org-1',
  isActive: true,
  isRemote: false,
  workModel: 'SHIFT',
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
  autoClock: ON,
};

async function buildClockIn(opts: { consent?: boolean; chosen?: boolean; undone?: boolean } = {}) {
  const prisma: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'u1',
        organizationId: 'org-1',
        allowRemote: false,
        role: 'EMPLOYEE',
        isExternal: false,
        organization: { timezone: 'Europe/Vienna' },
        autoClockConsentAt: opts.consent === false ? null : new Date('2026-09-01T00:00:00.000Z'),
      }),
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Mike', lastName: 'Weber' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    companyLocation: {
      findFirst: jest.fn().mockResolvedValue(location),
      findMany: jest.fn().mockResolvedValue([location]),
    },
    timeOff: { findMany: jest.fn().mockResolvedValue([]) },
    spaceAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1', allowRemote: null, autoClock: opts.chosen !== false }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'e-new', ...data, location })),
    },
    activityLog: { findFirst: jest.fn().mockResolvedValue(opts.undone ? { id: 'log-1' } : null) },
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
      { provide: ApprovalRulesService, useValue: noOfficeRules() },
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
      { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(SHIFT) } },
    ],
  }).compile();
  const service = moduleRef.get(AttendanceService);
  jest.spyOn(moduleRef.get(AttendanceGeocoderService), 'reverseGeocode').mockResolvedValue(null);
  jest.spyOn((service as any).clockIns.site.shiftSweeps, 'markShiftInstancePresent').mockResolvedValue(undefined);
  return { service, prisma };
}

const clockIn = (over: Record<string, unknown> = {}) =>
  ({
    userId: 'u1',
    organizationId: 'org-1',
    locationId: 'loc-1',
    ...SITE,
    accuracy: 10,
    trigger: 'AUTO',
    ...over,
  }) as any;
const created = (prisma: any) => prisma.timeEntry.create.mock.calls[0][0].data;

describe('clock-in sent as AUTO — re-checked, never refused for it', () => {
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());

  it('marks it AUTO_CLOCK_IN when consent ∧ workspace ∧ chosen ∧ inside the window — approved on arrival', async () => {
    jest.setSystemTime(new Date('2026-09-15T05:50:00.000Z')); // 10 min before, lead 30
    const { service, prisma } = await buildClockIn();
    await service.clockIn(clockIn());
    const data = created(prisma);
    expect(data.flagReasons).toContain('AUTO_CLOCK_IN');
    expect(data.approvalStatus).toBe('AUTO');
  });

  it('a forged AUTO without the member’s consent is an ordinary clock-in (no flag), still recorded', async () => {
    jest.setSystemTime(new Date('2026-09-15T05:50:00.000Z'));
    const { service, prisma } = await buildClockIn({ consent: false });
    await service.clockIn(clockIn());
    expect(prisma.timeEntry.create).toHaveBeenCalledTimes(1);
    expect(created(prisma).flagReasons).not.toContain('AUTO_CLOCK_IN');
  });

  it('not chosen in this workspace → no flag', async () => {
    jest.setSystemTime(new Date('2026-09-15T05:50:00.000Z'));
    const { service, prisma } = await buildClockIn({ chosen: false });
    await service.clockIn(clockIn());
    expect(created(prisma).flagReasons).not.toContain('AUTO_CLOCK_IN');
  });

  it('before the window opens (lead 30 min) → recorded, not marked', async () => {
    jest.setSystemTime(new Date('2026-09-15T05:00:00.000Z'));
    const { service, prisma } = await buildClockIn();
    await service.clockIn(clockIn());
    expect(created(prisma).flagReasons).not.toContain('AUTO_CLOCK_IN');
  });

  it('a MANUAL clock-in is never marked, even for an automatic member', async () => {
    jest.setSystemTime(new Date('2026-09-15T05:50:00.000Z'));
    const { service, prisma } = await buildClockIn();
    await service.clockIn(clockIn({ trigger: 'MANUAL' }));
    expect(created(prisma).flagReasons).not.toContain('AUTO_CLOCK_IN');
  });

  it('arms the leader notice at the planned end + leaderAfterMinutes when that is sooner than the ordinary reminder', async () => {
    jest.setSystemTime(new Date('2026-09-15T05:50:00.000Z'));
    const { service, prisma } = await buildClockIn();
    await service.clockIn(clockIn({ trigger: 'MANUAL' }));
    expect(created(prisma).nextRemindAt).toEqual(new Date('2026-09-15T14:05:00.000Z'));
  });

  it('a resend of an automatic clock-in its owner undid does not make the shift again', async () => {
    jest.setSystemTime(new Date('2026-09-15T05:50:00.000Z'));
    const { service, prisma } = await buildClockIn({ undone: true });
    await expect(service.clockIn(clockIn({ id: 'e-undone' }))).rejects.toMatchObject({
      response: { code: 'AUTO_CLOCK_UNDONE' },
    });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ undo */

function buildAuto(prisma: any) {
  const emit = jest.fn();
  const resolver = new ShiftResolverService(prisma);
  return { svc: autoClockParts(prisma, resolver, { emit } as any), emit };
}

const autoEntry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  userId: 'u1',
  locationId: 'loc-1',
  status: TimeEntryStatus.CLOCKED_IN,
  clockInAt: new Date('2026-09-15T05:50:00.000Z'),
  clockOutAt: null,
  flagReasons: ['AUTO_CLOCK_IN'],
  shiftId: 'shift-1',
  location: { autoClock: ON },
  _count: { breaks: 0, workLog: 0 },
  ...over,
});

function undoPrisma(entry: any, opts: { logged?: boolean; worked?: boolean } = {}) {
  const prisma: any = {
    timeEntry: { findFirst: jest.fn().mockResolvedValue(entry), delete: jest.fn().mockResolvedValue({}) },
    activityLog: { findFirst: jest.fn().mockResolvedValue(opts.logged ? { id: 'log' } : null), create: jest.fn() },
    taskEvent: { findFirst: jest.fn().mockResolvedValue(opts.worked ? { id: 'ev' } : null) },
    shiftInstance: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}
const undo = (svc: AutoClockServiceParts, over: Record<string, unknown> = {}) =>
  svc.undo({ userId: 'u1', organizationId: 'org-1', entryId: 'e1', ...over } as any);

describe('undo an automatic clock-in', () => {
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(() => jest.setSystemTime(new Date('2026-09-15T05:58:00.000Z')));

  it('somebody else’s entry is 404 — the lookup is scoped to the caller, like a missing one', async () => {
    const prisma = undoPrisma(null);
    const { svc } = buildAuto(prisma);
    await expect(undo(svc, { userId: 'intruder' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'e1',
      userId: 'intruder',
      organizationId: 'org-1',
    });
    expect(prisma.timeEntry.delete).not.toHaveBeenCalled();
  });

  it('removes the entry and leaves the audit row', async () => {
    const prisma = undoPrisma(autoEntry());
    const { svc, emit } = buildAuto(prisma);
    await expect(undo(svc)).resolves.toMatchObject({ data: { undone: true } });
    expect(prisma.timeEntry.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    expect(prisma.activityLog.create.mock.calls[0][0].data).toMatchObject({
      eventType: AUTO_UNDO_EVENT,
      resourceId: 'e1',
      userId: 'u1',
    });
    expect(emit).toHaveBeenCalledWith('attendance_changed', expect.objectContaining({ action: 'auto-undo' }));
  });

  it('a replay after it was undone answers done (offline outbox)', async () => {
    const prisma = undoPrisma(null, { logged: true });
    const { svc } = buildAuto(prisma);
    await expect(undo(svc)).resolves.toMatchObject({ data: { undone: true } });
    expect(prisma.activityLog.findFirst.mock.calls[0][0].where).toMatchObject({
      resourceId: 'e1',
      eventType: AUTO_UNDO_EVENT,
      userId: 'u1',
    });
  });

  it.each([
    ['a manual clock-in', autoEntry({ flagReasons: [] }), {}, 'NOT_AUTOMATIC'],
    ['a rest recorded', autoEntry({ _count: { breaks: 1, workLog: 0 } }), {}, 'WORK_RECORDED'],
    ['a work-log note', autoEntry({ _count: { breaks: 0, workLog: 1 } }), {}, 'WORK_RECORDED'],
    ['a job moved or joined since', autoEntry(), { worked: true }, 'WORK_RECORDED'],
    ['a closed shift', autoEntry({ status: TimeEntryStatus.CLOCKED_OUT, clockOutAt: new Date() }), {}, 'CLOSED'],
  ])('refuses after %s', async (_label, entry, opts, why) => {
    const prisma = undoPrisma(entry, opts as any);
    const { svc } = buildAuto(prisma);
    await expect(undo(svc)).rejects.toMatchObject({
      response: { code: 'AUTO_CLOCK_UNDO_NOT_ALLOWED', params: { why } },
    });
    expect(prisma.timeEntry.delete).not.toHaveBeenCalled();
  });

  it('refuses past clock-in + dwell + 10 + slack — judged at the moment of the tap', async () => {
    // dwell 3 + undo 10 + slack 2 = 15 minutes → 06:05.
    jest.setSystemTime(new Date('2026-09-15T06:06:00.000Z'));
    const prisma = undoPrisma(autoEntry());
    const { svc } = buildAuto(prisma);
    await expect(undo(svc)).rejects.toMatchObject({ response: { params: { why: 'TOO_LATE' } } });
  });
});

/* ------------------------------------------------------------------ plan */

function planPrisma(nSpaces: number, consent = true) {
  const spaces = Array.from({ length: nSpaces }, (_, i) => ({
    ...location,
    id: `loc-${i}`,
    name: `Halle ${i}`,
  }));
  const calls = { n: 0 };
  const counted = (impl: any) =>
    jest.fn(async (...a: any[]) => {
      calls.n++;
      return impl(...a);
    });
  const prisma: any = {
    user: {
      findFirst: counted(() => ({
        autoClockConsentAt: consent ? new Date('2026-09-01T00:00:00Z') : null,
        isExternal: false,
      })),
    },
    spaceAssignment: { findMany: counted(() => spaces.map((s) => ({ spaceId: s.id, autoClock: true }))) },
    companyLocation: { findMany: counted(() => spaces) },
    shiftAssignment: {
      findMany: counted(() =>
        spaces.map((s) => ({
          id: `ra-${s.id}`,
          spaceId: s.id,
          recurrence: 'DAILY',
          daysOfWeek: [],
          daysOfMonth: [],
          dates: [],
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          priority: 0,
          isActive: true,
          shiftId: 'sh',
          shift: { id: 'sh', isActive: true, startLocal: '08:00', endLocal: '16:00', crossesMidnight: false },
        })),
      ),
    },
    technicianSchedule: { findMany: counted(() => []) },
    timeOff: { findMany: counted(() => []) },
  };
  return { prisma, calls };
}

describe('the plan the phone arms from', () => {
  const now = new Date('2026-09-15T05:00:00.000Z');

  it('costs the same number of queries for one workspace and for twelve', async () => {
    const one = planPrisma(1);
    await buildAuto(one.prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    const many = planPrisma(12);
    const res: any = await buildAuto(many.prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    expect(many.calls.n).toBe(one.calls.n);
    expect(res.data.places).toHaveLength(12);
  });

  it('carries the shifts (today and tomorrow, local) and the settings', async () => {
    const { prisma } = planPrisma(1);
    const res: any = await buildAuto(prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    const place = res.data.places[0];
    expect(place).toMatchObject({ spaceId: 'loc-0', radius: 50, settings: expect.objectContaining({ enabled: true }) });
    expect(place.shifts).toEqual([
      { start: '2026-09-15T06:00:00.000Z', end: '2026-09-15T14:00:00.000Z' },
      { start: '2026-09-16T06:00:00.000Z', end: '2026-09-16T14:00:00.000Z' },
    ]);
  });

  it('no consent → no places and no shifts read, but it says where the office chose them', async () => {
    const { prisma, calls } = planPrisma(3, false);
    const res: any = await buildAuto(prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    expect(res.data).toMatchObject({
      consentAt: null,
      places: [],
      offered: 3,
      offeredIn: ['Halle 0', 'Halle 1', 'Halle 2'],
    });
    // The member, their assignments, the workspaces — never the rota or the requests.
    expect(calls.n).toBe(3);
    expect(prisma.shiftAssignment.findMany).not.toHaveBeenCalled();
  });

  it('a member clocked by arriving and leaving carries their usual hours, zone and the workspace’s hours', async () => {
    const { prisma } = planPrisma(1);
    prisma.spaceAssignment.findMany = jest.fn(async () => [
      {
        spaceId: 'loc-0',
        autoClock: true,
        autoClockMode: 'PRESENCE',
        autoClockStartWindow: { from: '19:00', to: '23:00' },
      },
    ]);
    prisma.companyLocation.findMany = jest.fn(async () => [
      { ...location, id: 'loc-0', name: 'AGRU', noShiftDailyMinutes: 660, noShiftPolicy: 'ALLOW' },
    ]);
    const res: any = await buildAuto(prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    expect(res.data.places[0].presence).toEqual({
      startWindow: { from: '19:00', to: '23:00' },
      timezone: location.timezone || 'UTC',
      noShiftMinutes: 660,
      noShiftLimit: false,
    });
  });

  it('by shift → no presence on the place', async () => {
    const { prisma } = planPrisma(1);
    const res: any = await buildAuto(prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    expect(res.data.places[0].presence).toBeNull();
  });

  it('chosen nowhere → offered 0, so the phone does not offer the switch', async () => {
    const { prisma } = planPrisma(0, false);
    const res: any = await buildAuto(prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    expect(res.data).toMatchObject({ consentAt: null, places: [], offered: 0, offeredIn: [] });
  });

  it('with consent, offered counts the same workspaces it arms', async () => {
    const { prisma } = planPrisma(2);
    const res: any = await buildAuto(prisma).svc.plan({ userId: 'u1', organizationId: 'org-1', now });
    expect(res.data.places).toHaveLength(2);
    expect(res.data).toMatchObject({ offered: 2, offeredIn: ['Halle 0', 'Halle 1'] });
  });
});

/* ------------------------------------------------------------------ the rest at the close */

const at = (hhmm: string) => new Date(`2026-09-15T${hhmm}:00.000Z`);

function buildClose(entry: any, opts: { auto?: boolean } = {}) {
  const prisma: any = {
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(entry),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(async () => ({
        ...entry,
        ...prisma.timeEntry.updateMany.mock.calls.at(-1)[0].data,
        user: { firstName: 'M', lastName: 'W' },
      })),
    },
    spaceAssignment: {
      findFirst: jest.fn().mockResolvedValue(
        opts.auto === false
          ? null
          : {
              autoClock: true,
              space: { autoClock: ON, isRemote: false },
              user: { autoClockConsentAt: new Date('2026-09-01'), isExternal: false },
            },
      ),
    },
    break: { update: jest.fn(), create: jest.fn() },
    geofenceExcursion: { updateMany: jest.fn() },
    shift: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'M', lastName: 'W', email: 'm@x' }) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const auto = buildAuto(prisma).svc;
  const svc = clockOutServices(
    prisma,
    { emit: jest.fn() } as any,
    { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) } as any,
    new CountedTimeService(prisma),
    { notifyTargetsFor: jest.fn().mockResolvedValue([]) } as any,
    { reverseGeocode: jest.fn().mockResolvedValue(null) } as any,
    { requestOvertimeAtClockOut: jest.fn() } as any,
    { pauseAtClockOut: jest.fn() } as any,
    auto,
  );
  return { svc, prisma };
}

const shiftEntry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  userId: 'u1',
  organizationId: 'org-1',
  locationId: 'loc-1',
  status: TimeEntryStatus.CLOCKED_IN,
  clockInAt: at('05:55'),
  expectedClockInAt: at('06:00'),
  expectedClockOutAt: at('14:00'),
  endIsDailyLimit: false,
  shiftId: null,
  isRemote: false,
  flagReasons: ['AUTO_CLOCK_IN'],
  notes: null,
  reminderState: null,
  timezone: 'Europe/Vienna',
  breakMinutes: 0,
  unpaidBreakMinutes: 0,
  autoRestSkippedAt: null,
  breakPlan: null,
  location,
  breaks: [],
  geofenceExcursions: [],
  ...over,
});

describe('the automatic rest at the close', () => {
  beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(() => jest.setSystemTime(at('14:20')));

  it('inserts the planned rest as a REST ROW, centred in the shift, before counted time', async () => {
    const t = buildClose(shiftEntry());
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', ...SITE, trigger: 'AUTO' } as any);
    expect(t.prisma.break.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        timeEntryId: 'e1',
        startedAt: at('09:45'),
        endedAt: at('10:15'),
        durationMinutes: 30,
        isPaid: false,
        reason: 'AUTO_REST',
      }),
    });
    const data = t.prisma.timeEntry.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ breakMinutes: 30, unpaidBreakMinutes: 30 });
    // 06:00–14:00 counted, less the 30 minute rest.
    expect(data.paidMinutes).toBe(450);
    expect(data.flagReasons).toEqual(expect.arrayContaining(['AUTO_REST', 'AUTO_CLOCK_OUT']));
  });

  it('skipped ("Still working") → no rest inserted', async () => {
    const t = buildClose(shiftEntry({ autoRestSkippedAt: at('09:40') }));
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', ...SITE } as any);
    expect(t.prisma.break.create).not.toHaveBeenCalled();
  });

  it('a rest already taken → none added', async () => {
    const t = buildClose(
      shiftEntry({
        breaks: [{ id: 'b1', startedAt: at('10:00'), endedAt: at('10:20'), durationMinutes: 20, isPaid: false }],
      }),
    );
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', ...SITE } as any);
    expect(t.prisma.break.create).not.toHaveBeenCalled();
  });

  it('not an automatic member → none added, and an AUTO clock-out is not marked', async () => {
    const t = buildClose(shiftEntry(), { auto: false });
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', ...SITE, trigger: 'AUTO' } as any);
    expect(t.prisma.break.create).not.toHaveBeenCalled();
    expect(t.prisma.timeEntry.updateMany.mock.calls[0][0].data.flagReasons).not.toContain('AUTO_CLOCK_OUT');
  });

  it('an AUTO clock-out sent from outside the area (where it always comes from) is not a geofence violation', async () => {
    const t = buildClose(shiftEntry());
    // ~1.5 km north of the site: the phone sends its position after leaving.
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', lat: 47.995, lng: 13.8269, trigger: 'AUTO' } as any);
    const data = t.prisma.timeEntry.updateMany.mock.calls[0][0].data;
    expect(data.flagReasons).toContain('AUTO_CLOCK_OUT');
    expect(data.flagReasons).not.toContain('OUTSIDE_GEOFENCE_OUT');
  });

  it('…but an ordinary clock-out from outside still is', async () => {
    const t = buildClose(shiftEntry());
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', lat: 47.995, lng: 13.8269 } as any);
    expect(t.prisma.timeEntry.updateMany.mock.calls[0][0].data.flagReasons).toContain('OUTSIDE_GEOFENCE_OUT');
  });

  it('an AUTO clock-out before the planned end is an ordinary one (early departure, no AUTO mark)', async () => {
    jest.setSystemTime(at('12:00'));
    const t = buildClose(shiftEntry());
    await t.svc.clockOut({ userId: 'u1', organizationId: 'org-1', ...SITE, trigger: 'AUTO' } as any);
    const flags = t.prisma.timeEntry.updateMany.mock.calls[0][0].data.flagReasons;
    expect(flags).not.toContain('AUTO_CLOCK_OUT');
    expect(flags).toContain('EARLY_DEPARTURE');
  });
});

/* ------------------------------------------------------------------ still inside after the end */

describe('still clocked in after the end — the workspace’s own thresholds', () => {
  const now = at('15:05'); // planned end 14:00; closeAfter 60 → due; leaderAfter 5 → due

  function sweepPrisma(entries: any[]) {
    const prisma: any = {
      timeEntry: {
        findMany: jest.fn(async (args: any) =>
          args.select
            ? entries
                .filter((e) => args.where?.expectedClockOutAt !== null || !e.expectedClockOutAt)
                .map(({ id, userId, locationId, clockInAt, expectedClockOutAt, expectedClockInAt }) => ({
                  id,
                  userId,
                  locationId,
                  clockInAt,
                  expectedClockOutAt,
                  expectedClockInAt,
                }))
            : args.where?.id
              ? entries
              : [],
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      spaceAssignment: {
        findFirst: jest.fn().mockResolvedValue(null), // no own rules there (D1)
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 'u1',
            spaceId: 'loc-1',
            autoClock: true,
            effectiveFrom: new Date('2026-01-01'),
            effectiveTo: null,
            space: { autoClock: ON },
            user: { autoClockConsentAt: new Date('2026-09-01'), isExternal: false },
          },
        ]),
      },
      break: { update: jest.fn(), create: jest.fn() },
      geofenceExcursion: { updateMany: jest.fn() },
      shift: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    return prisma;
  }

  it('closes an automatic member provisionally at plannedEnd + closeAfterMinutes, replaceable like any temporary close', async () => {
    const entry = {
      ...shiftEntry({
        breaks: [{ id: 'b0', startedAt: at('10:00'), endedAt: at('10:30'), durationMinutes: 30, isPaid: false }],
      }),
      user: { firstName: 'M', lastName: 'W' },
    };
    const prisma = sweepPrisma([entry]);
    const emit = jest.fn();
    const svc = clockOutServices(
      prisma,
      { emit } as any,
      {} as any,
      new CountedTimeService(prisma),
      {} as any,
      {} as any,
      {} as any,
      { pauseAtClockOut: jest.fn() } as any,
      buildAuto(prisma).svc,
    );
    const res: any = await svc.closeAbandonedShifts(now);
    expect(res.data.closed).toBe(1);
    const data = prisma.timeEntry.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ clockOutProvisional: true, clockOutBasis: 'SHIFT_END', clockOutAt: at('14:00') });
    expect(emit).toHaveBeenCalledWith(
      'attendance_shift_closed_provisionally',
      expect.objectContaining({ entryId: 'e1' }),
    );
    // The settings for the whole batch in ONE query.
    expect(prisma.spaceAssignment.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not close before closeAfterMinutes', async () => {
    const prisma = sweepPrisma([shiftEntry()]);
    const svc = clockOutServices(
      prisma,
      { emit: jest.fn() } as any,
      {} as any,
      new CountedTimeService(prisma),
      {} as any,
      {} as any,
      {} as any,
      undefined,
      buildAuto(prisma).svc,
    );
    const res: any = await svc.closeAbandonedShifts(at('14:30'));
    expect(res.data.closed).toBe(0);
  });

  it('tells the leader (no worker nudges) once plannedEnd + leaderAfterMinutes has passed; re-arms when due early', async () => {
    const due = [
      {
        ...shiftEntry({ id: 'late' }),
        reminderCount: 0,
        user: { id: 'u1', firstName: 'M', lastName: 'W' },
        location: { id: 'loc-1', name: 'Halle', timezone: 'Europe/Vienna' },
        shift: null,
      },
    ];
    const prisma: any = {
      timeEntry: { findMany: jest.fn().mockResolvedValue(due), update: jest.fn(), updateMany: jest.fn() },
      spaceAssignment: { findMany: sweepPrisma([]).spaceAssignment.findMany },
    };
    const emit = jest.fn();
    const routing = { notifyTargetsFor: jest.fn().mockResolvedValue(['leader-1']) };
    const sweep = shiftSweepParts(prisma, { emit } as any, {} as any, routing as any, buildAuto(prisma).svc);

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(at('14:03')); // before 14:05 → re-armed, nothing sent
    await sweep.runShiftReminders();
    expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'late', status: TimeEntryStatus.CLOCKED_IN },
      data: { nextRemindAt: at('14:05') },
    });
    expect(emit).not.toHaveBeenCalled();

    jest.setSystemTime(at('14:06'));
    await sweep.runShiftReminders();
    expect(emit).toHaveBeenCalledWith(
      'attendance_shift_escalation',
      expect.objectContaining({ entryId: 'late', leaderIds: ['leader-1'] }),
    );
    expect(emit).not.toHaveBeenCalledWith('attendance_shift_reminder', expect.anything());
    jest.useRealTimers();
  });
});
