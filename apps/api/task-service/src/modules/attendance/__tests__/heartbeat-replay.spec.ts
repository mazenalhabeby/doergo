/**
 * Check-ins sent late, after a stretch without signal.
 *
 * Replayed live, a point from an hour ago says somebody "has left the site"
 * now. These pin the periods the batch turns into, and what each one does.
 */
import { AttendanceService } from '../attendance.service';
import { lastReadingIsFresh, replayRing, type RingReading } from '../heartbeat-replay';

const NOW = new Date('2026-09-14T11:40:00.000Z');
const at = (hhmm: string) => new Date(`2026-09-14T${hhmm}:00.000Z`);
const IN = (t: string): RingReading => ({ at: at(t), inside: true, outPastBuffer: false, distanceM: 10 });
const OUT = (t: string, d = 400): RingReading => ({ at: at(t), inside: false, outPastBuffer: true, distanceM: d });
const EDGE = (t: string): RingReading => ({ at: at(t), inside: false, outPastBuffer: false, distanceM: 60 });

describe('replaying late check-ins', () => {
  it('turns out-and-back into one finished period with its real times', () => {
    expect(replayRing([IN('09:00'), OUT('09:10'), OUT('09:20', 900), IN('09:25'), IN('09:40')], null)).toEqual([
      { leftAt: at('09:10'), backAt: at('09:25'), maxDistanceM: 900, continuesOpen: false },
    ]);
  });

  it('sorts points the phone sent out of order', () => {
    expect(replayRing([IN('09:25'), OUT('09:10')], null)).toEqual([
      { leftAt: at('09:10'), backAt: at('09:25'), maxDistanceM: 400, continuesOpen: false },
    ]);
  });

  it('does not count scatter at the edge as leaving', () => {
    expect(replayRing([IN('09:00'), EDGE('09:05'), IN('09:10')], null)).toEqual([]);
  });

  it('closes an excursion that was already open at the moment they came back', () => {
    expect(replayRing([OUT('09:30'), IN('09:45')], at('09:15'))).toEqual([
      { leftAt: at('09:15'), backAt: at('09:45'), maxDistanceM: 400, continuesOpen: true },
    ]);
  });

  it('knows whether the newest point describes the present', () => {
    expect(lastReadingIsFresh([OUT('11:25')], NOW)).toBe(true);
    expect(lastReadingIsFresh([OUT('09:10')], NOW)).toBe(false);
    expect(lastReadingIsFresh([], NOW)).toBe(false);
  });
});

describe('heartbeatBatch', () => {
  // A 50 m ring at 47.9813,13.8269. ~0.0045° of latitude is ~500 m.
  const SITE = { lat: 47.9813, lng: 13.8269 };
  const FAR = { lat: 47.9858, lng: 13.8269 };
  const point = (where: { lat: number; lng: number }, t: string) => ({ ...where, recordedAt: at(t).toISOString() });

  function service(active: any = null) {
    const svc = Object.create(AttendanceService.prototype) as any;
    svc.logger = { debug: jest.fn(), log: jest.fn(), warn: jest.fn() };
    svc.presence = { onBatch: jest.fn().mockResolvedValue(undefined), onPosition: jest.fn().mockResolvedValue(undefined) };
    svc.prisma = {
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1', userId: 'u1', organizationId: 'org-1', locationId: 'loc-1', isRemote: false,
          clockInAt: at('08:00'),
          location: { ...SITE, geofenceRadius: 50, geofencePolygon: null },
        }),
      },
      geofenceExcursion: {
        findFirst: jest.fn().mockResolvedValue(active),
        create: jest.fn(async ({ data }: any) => ({ id: 'x-new', ...data })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    svc.emitExcursionEvent = jest.fn();
    return svc;
  }

  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('records a finished trip out as history and tells nobody', async () => {
    const svc = service();
    const res = await svc.heartbeatBatch({
      userId: 'u1', organizationId: 'org-1',
      points: [point(SITE, '09:00'), point(FAR, '09:10'), point(SITE, '09:25'), point(SITE, '11:30')],
    });
    expect(svc.prisma.geofenceExcursion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'RETURNED', leftRingAt: at('09:10'), resolvedAt: at('09:25') }),
    });
    expect(svc.emitExcursionEvent).not.toHaveBeenCalled();
    expect(res.data).toEqual({ recorded: 1, opened: false, returned: false });
  });

  it('opens an excursion only when the newest point is recent', async () => {
    const fresh = service();
    await fresh.heartbeatBatch({ userId: 'u1', organizationId: 'org-1', points: [point(SITE, '11:00'), point(FAR, '11:30')] });
    expect(fresh.prisma.geofenceExcursion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'OUT_UNREPORTED', leftRingAt: at('11:30') }),
    });
    expect(fresh.emitExcursionEvent).toHaveBeenCalledWith('geofence_excursion_out', expect.anything(), expect.anything(), expect.anything());

    const stale = service();
    await stale.heartbeatBatch({ userId: 'u1', organizationId: 'org-1', points: [point(SITE, '09:00'), point(FAR, '09:10')] });
    expect(stale.prisma.geofenceExcursion.create).not.toHaveBeenCalled();
    expect(stale.emitExcursionEvent).not.toHaveBeenCalled();
  });

  it('closes an open excursion at the moment they came back, not now', async () => {
    const active = { id: 'x1', status: 'OUT_UNREPORTED', leftRingAt: at('09:15'), lastDistanceM: 300 };
    const svc = service(active);
    await svc.heartbeatBatch({ userId: 'u1', organizationId: 'org-1', points: [point(FAR, '09:30'), point(SITE, '09:45')] });
    expect(svc.prisma.geofenceExcursion.updateMany).toHaveBeenCalledWith({
      where: { id: 'x1', status: 'OUT_UNREPORTED' },
      data: { status: 'RETURNED', resolvedAt: at('09:45') },
    });
  });

  it('ignores points from before the shift and from the future', async () => {
    const svc = service();
    await svc.heartbeatBatch({ userId: 'u1', organizationId: 'org-1', points: [point(FAR, '07:30'), point(FAR, '13:00')] });
    expect(svc.prisma.geofenceExcursion.create).not.toHaveBeenCalled();
  });

  it('does nothing for a shift worked away from the site', async () => {
    const svc = service();
    svc.prisma.timeEntry.findFirst.mockResolvedValue({ id: 'e1', isRemote: true, clockInAt: at('08:00'), location: { ...SITE, geofenceRadius: 50 } });
    await svc.heartbeatBatch({ userId: 'u1', organizationId: 'org-1', points: [point(FAR, '11:30')] });
    expect(svc.prisma.geofenceExcursion.findFirst).not.toHaveBeenCalled();
  });
});
