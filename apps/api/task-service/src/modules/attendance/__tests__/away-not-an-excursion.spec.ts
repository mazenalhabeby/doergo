import { Test } from '@nestjs/testing';
import { AttendanceService } from '../attendance.service';
import { CountedTimeService } from '../counted-time.service';
import { BreakRulesService } from '../break-rules.service';
import { ShiftResolverService } from '../shift-resolver.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SERVICE_NAMES, QUEUE_NAMES } from '@hbcfield/shared';
import { getQueueToken } from '@nestjs/bullmq';

/**
 * A day worked away from the site is not an excursion from it.
 *
 * Allowing an away clock-in at a PINNED workspace put the member outside the
 * ring for their whole shift, which is exactly what the geofence-excursion
 * machinery exists to notice. Left alone it would have opened an
 * OUT_UNREPORTED on their first heartbeat, escalated it to whoever reconciles
 * attendance, and repeated that every few minutes until they clocked out.
 *
 * The permission to be away IS the permission not to be asked about it. The day
 * is already marked away and already waiting for review; that is the signal a
 * manager acts on.
 */
describe('an away day is not a geofence excursion', () => {
  let service: AttendanceService;
  let prisma: any;

  // Gmunden, with the member reporting from Vienna — 200 km outside any ring.
  const WAREHOUSE = { id: 'loc1', name: 'Warehouse', lat: 47.9186, lng: 13.7991, geofenceRadius: 80, timezone: 'Europe/Vienna' };
  const VIENNA = { lat: 48.2082, lng: 16.3738 };

  const entry = (isRemote: boolean) => ({
    id: 'e1', userId: 'u1', organizationId: 'org1', locationId: 'loc1',
    status: 'CLOCKED_IN', isRemote, clockInAt: new Date(), location: WAREHOUSE,
  });

  beforeEach(async () => {
    prisma = {
      timeEntry: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      geofenceExcursion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ex1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      spaceAssignment: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: any): Promise<any> => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
    };
    const mod = await Test.createTestingModule({
      providers: [
        AttendanceService, CountedTimeService, BreakRulesService,
        { provide: ShiftResolverService, useValue: { resolveForClockIn: jest.fn().mockResolvedValue(null) } },
        { provide: NotificationRoutingService, useValue: { resolveForSpace: jest.fn().mockResolvedValue([]) } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.OVERTIME), useValue: { add: jest.fn() } },
      ],
    }).compile();
    service = mod.get(AttendanceService);
  });

  it('opens no excursion for a shift being worked away, 200 km outside the ring', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue(entry(true));
    const r: any = await service.heartbeat({ userId: 'u1', organizationId: 'org1', ...VIENNA });
    expect(prisma.geofenceExcursion.create).not.toHaveBeenCalled();
    expect(r.data.inRing).toBe(true);
    expect(r.data.distance).toBe(0);
    // …and the phone shows no out-of-ring banner for a day that is agreed to be away.
    expect(r.data.withinGeofence).toBe(true);
  });

  it('still opens one for an ON-SITE shift whose member has wandered off', async () => {
    // The behaviour this must not weaken: the same coordinates, the same site,
    // and an entry that never claimed to be away.
    prisma.timeEntry.findFirst.mockResolvedValue(entry(false));
    const r: any = await service.heartbeat({ userId: 'u1', organizationId: 'org1', ...VIENNA });
    expect(prisma.geofenceExcursion.create).toHaveBeenCalled();
    expect(r.data.inRing).toBe(false);
    expect(r.data.distance).toBeGreaterThan(100_000);
  });
});
