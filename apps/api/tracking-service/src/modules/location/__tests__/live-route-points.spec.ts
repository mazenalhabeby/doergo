/**
 * Points for a trip in progress (EN_ROUTE): the same shared filter as the
 * phone, only points from this trip, and a retry never counts twice.
 */
import { of } from 'rxjs';
import { LocationService } from '../location.service';

const START = new Date('2026-09-30T06:01:30Z');
const at = (s: number) => new Date(START.getTime() + s * 1000).toISOString();

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(START.getTime() + 10 * 60_000));
afterEach(() => jest.restoreAllMocks());

function build(assignedToId = 'u1') {
  const history: any[] = [];
  const prisma: any = {
    workerLastLocation: { upsert: jest.fn().mockResolvedValue({}) },
    task: {
      findUnique: jest.fn().mockResolvedValue({ status: 'EN_ROUTE', assignedToId, assignees: [], routeStartedAt: START, routeEndedAt: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    locationHistory: {
      findFirst: jest.fn(async () => (history.length ? [...history].sort((a, b) => b.timestamp - a.timestamp)[0] : null)),
      findMany: jest.fn(async ({ where }: any) =>
        history.filter((h) => where.timestamp.in.some((d: Date) => d.getTime() === h.timestamp.getTime())).map((h) => ({ timestamp: h.timestamp })),
      ),
      createMany: jest.fn(async ({ data }: any) => { history.push(...data); return { count: data.length }; }),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
  return { service: new LocationService(prisma, { emit: jest.fn(() => of(null)) } as any, {} as any), prisma, history };
}

const drive = [
  { lat: 47.9480, lng: 13.8220, accuracy: 5, timestamp: at(10) },
  { lat: 47.9482, lng: 13.8220, accuracy: 5, timestamp: at(15) },
  { lat: 47.9484, lng: 13.8220, accuracy: 5, timestamp: at(20) },
];

describe('live route points', () => {
  it('stores a real drive and adds its distance', async () => {
    const { service, history, prisma } = build();
    await service.updateLocationBatch('u1', 't1', drive, 'org1');
    expect(history).toHaveLength(3);
    expect(prisma.task.update.mock.calls[0][0].data.routeDistance.increment).toBeGreaterThan(40);
  });

  it('a retry of the same batch stores nothing twice and adds no distance', async () => {
    const { service, history, prisma } = build();
    await service.updateLocationBatch('u1', 't1', drive, 'org1');
    await service.updateLocationBatch('u1', 't1', drive, 'org1');
    expect(history).toHaveLength(3);
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
  });

  it('refuses points from before the trip, inaccurate fixes and jumps', async () => {
    const { service, history } = build();
    await service.updateLocationBatch('u1', 't1', [
      { lat: 47.94, lng: 13.82, accuracy: 5, timestamp: at(-600) }, // ten minutes before the trip
      { lat: 47.9480, lng: 13.8220, accuracy: 120, timestamp: at(5) }, // ±120 m
      ...drive,
      { lat: 48.9, lng: 13.8220, accuracy: 5, timestamp: at(25) }, // 100 km in 5 s
    ], 'org1');
    expect(history.map((h) => h.timestamp.toISOString())).toEqual(drive.map((d) => d.timestamp));
  });

  it('stores nothing for somebody who is not on the job', async () => {
    const { service, history } = build('someone-else');
    await service.updateLocationBatch('u1', 't1', drive, 'org1');
    expect(history).toHaveLength(0);
  });
});
