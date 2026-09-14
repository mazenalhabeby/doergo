/**
 * Route points that reach the server after the route ended.
 *
 * A phone in a dead zone holds its points; "Arrived" is a queued operation too
 * and may arrive first. The points still belong to the route they were
 * recorded on.
 */
import { of } from 'rxjs';
import { LocationService } from '../location.service';

const START = new Date('2026-09-14T08:00:00Z');
const END = new Date('2026-09-14T08:30:00Z');
const at = (min: number) => new Date(START.getTime() + min * 60_000).toISOString();

function build(task: Record<string, unknown>, stored: { lat: number; lng: number; timestamp: Date }[] = []) {
  const history = [...stored];
  const prisma: any = {
    workerLastLocation: { upsert: jest.fn().mockResolvedValue({}) },
    task: {
      findUnique: jest.fn().mockResolvedValue({ assignedToId: 'u1', assignees: [], routeStartedAt: START, routeEndedAt: END, ...task }),
      update: jest.fn().mockResolvedValue({}),
    },
    locationHistory: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(async ({ where, select }: any) => {
        const rows = where.timestamp?.in
          ? history.filter((h) => where.timestamp.in.some((d: Date) => d.getTime() === h.timestamp.getTime()))
          : [...history].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return select.timestamp && !select.lat ? rows.map((r) => ({ timestamp: r.timestamp })) : rows;
      }),
      createMany: jest.fn(async ({ data }: any) => {
        history.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
  const service = new LocationService(prisma, { emit: jest.fn(() => of(null)) } as any, {} as any);
  return { service, prisma, history };
}

// ~111 m per 0.001° of latitude.
const pt = (min: number, north: number) => ({ lat: 47.98 + north * 0.001, lng: 13.82, accuracy: 10, timestamp: at(min) });

describe('late route points', () => {
  it('stores points timed inside an ended route, and recomputes its distance in time order', async () => {
    // The route already has its first and last point; the gap arrives late.
    const { service, prisma, history } = build({ status: 'ARRIVED' }, [
      { lat: 47.98, lng: 13.82, timestamp: new Date(at(0)) },
      { lat: 47.983, lng: 13.82, timestamp: new Date(at(30)) },
    ]);
    await service.updateLocationBatch('u1', 't1', [pt(10, 1), pt(20, 2)], 'o1');

    expect(prisma.locationHistory.createMany).toHaveBeenCalledTimes(1);
    expect(history).toHaveLength(4);
    const distance = prisma.task.update.mock.calls[0][0].data.routeDistance;
    // 0 → 1 → 2 → 3 thousandths north: ~333 m, not the ~555 m an increment from the last point would add.
    expect(distance).toBeGreaterThan(320);
    expect(distance).toBeLessThan(345);
  });

  it('leaves out points from outside the route window and points already stored', async () => {
    const { service, prisma } = build({ status: 'ARRIVED' }, [{ lat: 47.981, lng: 13.82, timestamp: new Date(at(10)) }]);
    await service.updateLocationBatch('u1', 't1', [pt(10, 1), pt(45, 5), { lat: 47.99, lng: 13.82 }], 'o1');
    expect(prisma.locationHistory.createMany).not.toHaveBeenCalled();
  });

  it("does nothing for a route that never ended, or a member who is not on the task", async () => {
    const neverEnded = build({ status: 'ASSIGNED', routeEndedAt: null });
    await neverEnded.service.updateLocationBatch('u1', 't1', [pt(10, 1)], 'o1');
    expect(neverEnded.prisma.locationHistory.createMany).not.toHaveBeenCalled();

    const stranger = build({ status: 'ARRIVED', assignedToId: 'someone-else' });
    await stranger.service.updateLocationBatch('u1', 't1', [pt(10, 1)], 'o1');
    expect(stranger.prisma.locationHistory.createMany).not.toHaveBeenCalled();
  });
});
