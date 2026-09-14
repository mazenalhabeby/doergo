/**
 * Clocking in, out and resting while offline — the server's half.
 *
 * A phone records the tap (time, anchor, GPS fix) and sends it later. The
 * server must judge it as of the tap, return the same record for a resend,
 * and refuse — with a code the phone can put in words — what can no longer
 * be applied.
 */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NAMES, SERVICE_NAMES, TimeEntryStatus } from '@hbcfield/shared';
import { AttendanceService } from '../attendance.service';
import { BreakService } from '../break.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { BreakReminderService } from '../break-reminder.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { approvalFor } from '../attendance-occurrence';
import { PresenceService } from '../presence/presence.service';

const NOW = new Date('2026-09-14T11:14:00.000Z');
const TAP = new Date('2026-09-14T07:58:00.000Z');
const SITE = { lat: 47.9813, lng: 13.8269 };
const FAR = { lat: 48.2082, lng: 16.3738 }; // Vienna — where the phone is when it syncs

const location = {
  id: 'loc-1', name: 'Main Office', organizationId: 'org-1', isActive: true, isRemote: false,
  ...SITE, geofenceRadius: 50, geofencePolygon: null, geofencePolicy: 'STRICT', timezone: 'Europe/Vienna',
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

/** Evidence for a tap at TAP, anchored to a server contact at 07:50 — a believable clock. */
function evidence(at = TAP, fix: { lat: number; lng: number } | null = SITE) {
  const anchorAt = new Date(at.getTime() - 8 * 60_000);
  return {
    occurredAt: at.toISOString(),
    uptimeMs: 1_000_000 + 8 * 60_000,
    anchor: { serverTime: anchorAt.toISOString(), uptimeMs: 1_000_000 },
    ...(fix ? { fix: { ...fix, accuracy: 12, fixAt: at.toISOString() } } : {}),
  };
}

function prismaDouble() {
  const p: any = {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'u1', organizationId: 'org-1', allowRemote: false, role: 'EMPLOYEE', organization: { timezone: 'Europe/Vienna' } }),
      findUnique: jest.fn().mockResolvedValue({ firstName: 'Mike', lastName: 'Weber' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    companyLocation: { findFirst: jest.fn().mockResolvedValue(location) },
    spaceAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'a1', allowRemote: null }), findMany: jest.fn().mockResolvedValue([]) },
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: data.id ?? 'server-id', ...data, location, user: { firstName: 'Mike', lastName: 'Weber' } })),
      update: jest.fn(async ({ data }: any) => ({ id: 'e1', ...data, location, user: { firstName: 'Mike', lastName: 'Weber' } })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    break: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: data.id ?? 'b-server', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'b1', type: 'SHORT', ...data })),
    },
    shiftInstance: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    breakRule: { findMany: jest.fn().mockResolvedValue([]) },
    shift: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(p))),
  };
  return p;
}

async function build() {
  const prisma = prismaDouble();
  const moduleRef = await Test.createTestingModule({
    providers: [
      AttendanceService, { provide: PresenceService, useValue: { atClockIn: jest.fn().mockResolvedValue({}), onPosition: jest.fn().mockResolvedValue(undefined), onBatch: jest.fn().mockResolvedValue(undefined) } }, BreakService, CountedTimeService, BreakRulesService, BreakReminderService,
      { provide: PrismaService, useValue: prisma },
      { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn(), getRepeatableJobs: jest.fn().mockResolvedValue([]) } },
      { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [], emails: [] }) } },
      { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(null) } },
    ],
  }).compile();
  const service = moduleRef.get(AttendanceService);
  // The place name is a network call to the gateway; not what these tests are about.
  jest.spyOn(service as any, 'reverseGeocode').mockResolvedValue(null);
  return { service, breaks: moduleRef.get(BreakService), prisma };
}

describe('attendance recorded offline', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(NOW);
  });
  afterAll(() => jest.useRealTimers());

  const clockIn = (over: Record<string, unknown> = {}) => ({
    userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', ...FAR, accuracy: 30,
    id: '0190f3c2-7b1a-7c3d-9e4f-000000000001', evidence: evidence(), ...over,
  });

  describe('clock-in', () => {
    it('records the tap time and judges the site by where the tap happened, not where the phone synced', async () => {
      const { service, prisma } = await build();
      await service.clockIn(clockIn());
      const data = prisma.timeEntry.create.mock.calls[0][0].data;
      expect(data.id).toBe('0190f3c2-7b1a-7c3d-9e4f-000000000001');
      expect(data.clockInAt).toEqual(TAP);
      expect(data.clockInWithinGeofence).toBe(true);
      expect(data.clockInLat).toBe(SITE.lat);
      expect(data.flagReasons).toContain('RECORDED_OFFLINE');
      expect(data.flagReasons).not.toContain('OUTSIDE_GEOFENCE_IN');
    });

    it('asks whether the member was assigned at the moment of the tap', async () => {
      const { service, prisma } = await build();
      await service.clockIn(clockIn());
      expect(prisma.spaceAssignment.findFirst.mock.calls[0][0].where.effectiveFrom).toEqual({ lte: TAP });
    });

    it('returns the same entry when the phone sends the clock-in again', async () => {
      const { service, prisma } = await build();
      const prior = { id: '0190f3c2-7b1a-7c3d-9e4f-000000000001', userId: 'u1', status: TimeEntryStatus.CLOCKED_OUT, location };
      prisma.timeEntry.findUnique.mockResolvedValue(prior);
      const res: any = await service.clockIn(clockIn());
      expect(res.data).toBe(prior);
      expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it("refuses somebody else's id rather than returning their shift", async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findUnique.mockResolvedValue({ id: 'x', userId: 'someone-else', location });
      await expect(service.clockIn(clockIn())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ID_IN_USE' }) });
    });

    it('is a conflict naming the open shift when the member is already clocked in', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockImplementation(async ({ where }: any) =>
        where.status === TimeEntryStatus.CLOCKED_IN ? { id: 'open-1', locationId: 'loc-1', clockInAt: new Date('2026-09-14T06:00:00Z'), location } : null,
      );
      await expect(service.clockIn(clockIn())).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'ALREADY_CLOCKED_IN', params: { current: expect.objectContaining({ id: 'open-1' }) } }),
      });
    });

    it('turns the one-open-shift index refusing a racing insert into the same conflict', async () => {
      const { service, prisma } = await build();
      let open: any = null;
      prisma.timeEntry.findFirst.mockImplementation(async ({ where }: any) => (where.status === TimeEntryStatus.CLOCKED_IN ? open : null));
      prisma.timeEntry.create.mockImplementation(async () => {
        open = { id: 'raced', locationId: 'loc-1', clockInAt: NOW, location };
        throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      });
      await expect(service.clockIn(clockIn())).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'ALREADY_CLOCKED_IN' }) });
    });

    it('refuses a clock-in from before the previous shift ended', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockImplementation(async ({ where }: any) =>
        where.clockOutAt ? { clockOutAt: new Date('2026-09-14T09:00:00Z') } : null,
      );
      await expect(service.clockIn(clockIn())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'OUT_OF_ORDER' }) });
    });

    it('flags an entry whose site boundary changed while it was on its way', async () => {
      const { service, prisma } = await build();
      prisma.companyLocation.findFirst.mockResolvedValue({ ...location, updatedAt: new Date('2026-09-14T10:00:00Z') });
      await service.clockIn(clockIn());
      expect(prisma.timeEntry.create.mock.calls[0][0].data.flagReasons).toContain('BOUNDARY_CHANGED');
    });

    it('still refuses a tap that happened outside a strict site', async () => {
      const { service } = await build();
      await expect(service.clockIn(clockIn({ evidence: evidence(TAP, FAR) }))).rejects.toThrow(/can only be clocked in at on site/);
    });

    it('behaves exactly as before for a screen that sends no evidence', async () => {
      const { service, prisma } = await build();
      await service.clockIn({ userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', ...SITE, accuracy: 10 });
      const data = prisma.timeEntry.create.mock.calls[0][0].data;
      expect(data.clockInAt).toEqual(NOW);
      expect(data.id).toBeUndefined();
      expect(data.flagReasons).not.toContain('RECORDED_OFFLINE');
    });
  });

  describe('clock-out', () => {
    const open = () => ({
      id: 'e1', userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', status: TimeEntryStatus.CLOCKED_IN,
      clockInAt: new Date('2026-09-14T06:00:00Z'), isRemote: false, flagReasons: [], breakMinutes: 0, unpaidBreakMinutes: 0,
      expectedClockOutAt: null, shiftId: null, location, breaks: [],
    });
    const clockOut = (over: Record<string, unknown> = {}) => ({ userId: 'u1', organizationId: 'org-1', entryId: 'e1', ...FAR, evidence: evidence(TAP), ...over });

    it('closes the named shift at the tap, claimed so a racing close cannot also win', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue(open());
      await service.clockOut(clockOut());
      expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'e1', userId: 'u1' });
      expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', status: TimeEntryStatus.CLOCKED_IN }, data: expect.objectContaining({ clockOutAt: TAP }) });
      const data = prisma.timeEntry.update.mock.calls[0][0].data;
      expect(data.clockOutAt).toEqual(TAP);
      expect(data.totalMinutes).toBe(118);
      expect(data.flagReasons).toContain('RECORDED_OFFLINE');
    });

    it('answers a resend of the same tap with the closed shift, and writes nothing', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ ...open(), status: TimeEntryStatus.CLOCKED_OUT, clockOutAt: TAP });
      const res: any = await service.clockOut(clockOut());
      expect(res.data.id).toBe('e1');
      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('is a conflict when the shift was closed some other way meanwhile', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ ...open(), status: TimeEntryStatus.CLOCKED_OUT, clockOutAt: new Date('2026-09-14T10:00:00Z') });
      await expect(service.clockOut(clockOut())).rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'ENTRY_ALREADY_CLOSED' }) });
    });

    it('tells the supervisors who were alerted "still clocked in" that the clock-out has arrived', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ ...open(), reminderState: 'ESCALATED', timezone: 'Europe/Vienna' });
      const targets = jest.spyOn(service as any, 'notifyTargetsFor').mockResolvedValue(['leader-1']);
      const emit = (service as any).notificationClient.emit as jest.Mock;
      await service.clockOut(clockOut());
      expect(targets).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), 'canReconcileAttendance');
      expect(emit).toHaveBeenCalledWith('attendance_shift_escalation_resolved', expect.objectContaining({
        entryId: 'e1', clockOutAt: TAP.toISOString(), recordedOffline: true, leaderIds: ['leader-1'], timezone: 'Europe/Vienna',
      }));
    });

    it('says nothing extra when nobody had been alerted', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ ...open(), reminderState: 'REMINDED' });
      const emit = (service as any).notificationClient.emit as jest.Mock;
      await service.clockOut(clockOut());
      expect(emit.mock.calls.map((c) => c[0])).not.toContain('attendance_shift_escalation_resolved');
    });

    it('replaces a temporary close with the real clock-out the phone was holding', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({
        ...open(), status: TimeEntryStatus.CLOCKED_OUT, clockOutAt: new Date('2026-09-14T17:00:00Z'),
        clockOutProvisional: true, clockOutBasis: 'SHIFT_END', flagReasons: ['LATE_ARRIVAL', 'MISSED_CLOCK_OUT', 'CLOCK_OUT_PROVISIONAL'],
      });
      await service.clockOut(clockOut());
      expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'e1', status: TimeEntryStatus.CLOCKED_OUT, clockOutProvisional: true },
        data: expect.objectContaining({ clockOutAt: TAP, clockOutProvisional: false, clockOutBasis: null }),
      });
      const data = prisma.timeEntry.update.mock.calls[0][0].data;
      expect(data.clockOutAt).toEqual(TAP);
      expect(data.flagReasons).toContain('LATE_ARRIVAL');
      expect(data.flagReasons).toContain('RECORDED_OFFLINE');
      expect(data.flagReasons).not.toContain('CLOCK_OUT_PROVISIONAL');
      expect(data.flagReasons).not.toContain('MISSED_CLOCK_OUT');
    });

    it('a late clock-out with a reason asks a leader for the overtime', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ ...open(), expectedClockOutAt: new Date('2026-09-14T06:30:00Z') });
      prisma.overtimeRequest = { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) };
      jest.spyOn(service as any, 'notifyTargetsFor').mockResolvedValue(['leader-1']);
      const emit = (service as any).notificationClient.emit as jest.Mock;
      await service.clockOut(clockOut({ overtimeReason: 'Boiler part arrived late' }));
      expect(prisma.overtimeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        status: 'PENDING_APPROVAL', technicianReason: 'Boiler part arrived late', technicianRespondedAt: TAP,
        overtimeStartAt: new Date('2026-09-14T06:30:00Z'),
      }) });
      expect(emit).toHaveBeenCalledWith('attendance_overtime_request', expect.objectContaining({ entryId: 'e1', leaderIds: ['leader-1'] }));
    });

    it('does not open a second request when one is already waiting', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ ...open(), expectedClockOutAt: new Date('2026-09-14T06:30:00Z') });
      prisma.overtimeRequest = { findMany: jest.fn().mockResolvedValue([{ cycle: 1, status: 'PENDING_APPROVAL' }]), create: jest.fn() };
      await service.clockOut(clockOut({ overtimeReason: 'Stayed' }));
      expect(prisma.overtimeRequest.create).not.toHaveBeenCalled();
    });

    it('refuses a clock-out from before a rest in the shift ended', async () => {
      const { service, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ ...open(), breaks: [{ endedAt: new Date('2026-09-14T08:30:00Z') }] });
      await expect(service.clockOut(clockOut())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'OUT_OF_ORDER' }) });
    });
  });

  describe('breaks', () => {
    it('starts a break at the tap, under the id the phone made, in the shift it names', async () => {
      const { breaks, prisma } = await build();
      prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1', clockInAt: new Date('2026-09-14T06:00:00Z'), breakPlan: null, breaks: [] });
      await breaks.startBreak({ userId: 'u1', organizationId: 'org-1', id: 'b-phone-000000000001', entryId: 'e1', evidence: evidence(TAP, null) });
      expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'e1' });
      expect(prisma.break.create.mock.calls[0][0].data).toMatchObject({ id: 'b-phone-000000000001', startedAt: TAP });
    });

    it('answers a resend of the same break end, and is a conflict if it ended differently', async () => {
      const { breaks, prisma } = await build();
      prisma.break.findFirst.mockResolvedValue({ id: 'b1', endedAt: TAP });
      await expect(breaks.endBreak({ userId: 'u1', organizationId: 'org-1', breakId: 'b1', evidence: evidence(TAP, null) })).resolves.toMatchObject({ data: { id: 'b1' } });
      prisma.break.findFirst.mockResolvedValue({ id: 'b1', endedAt: new Date('2026-09-14T09:00:00Z') });
      await expect(breaks.endBreak({ userId: 'u1', organizationId: 'org-1', breakId: 'b1', evidence: evidence(TAP, null) })).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BREAK_ALREADY_ENDED' }),
      });
    });
  });

  describe('approval', () => {
    it('does not send an entry for review only because it was recorded offline', () => {
      expect(approvalFor(['RECORDED_OFFLINE', 'UNANCHORED'])).toBe('AUTO');
      expect(approvalFor(['RECORDED_OFFLINE', 'CLOCK_SUSPECT'])).toBe('PENDING');
      expect(approvalFor(['FIX_MOCKED'])).toBe('PENDING');
    });
  });
});
