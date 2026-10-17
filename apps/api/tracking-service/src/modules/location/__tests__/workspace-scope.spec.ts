/**
 * The live map held in ONE workspace (canViewTracking in a space role — an
 * external supervisor running a client's site) shows that workspace only.
 *
 *   undefined  org-wide — the query is what it always was
 *   [ids]      people rostered there; routes/history only of jobs there
 *   []         granted nowhere — matches nothing
 */
import { of } from 'rxjs';
import { locationServices } from './location.service.fixture';
import { LocationController } from '../location.controller';

function build() {
  const prisma: any = {
    workerLastLocation: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    task: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    locationHistory: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = locationServices(
    prisma,
    { emit: jest.fn(() => of(null)) } as any,
    { matchToRoads: jest.fn() } as any,
  );
  return { service, prisma };
}

const rostered = (ids: string[]) => ({
  spaceAssignments: { some: expect.objectContaining({ spaceId: { in: ids } }) },
});

describe('live map — workspace scope', () => {
  it('asks only for roles the database has — a retired one fails the whole query', async () => {
    const { service, prisma } = build();
    await service.getActiveWorkers('org1');
    expect(prisma.workerLastLocation.findMany.mock.calls[0][0].where.user.role).toEqual({ in: ['EMPLOYEE'] });
  });

  it('org-wide callers keep the query they had', async () => {
    const { service, prisma } = build();
    await service.getActiveWorkers('org1');
    expect(prisma.workerLastLocation.findMany.mock.calls[0][0].where.user).not.toHaveProperty('spaceAssignments');
    await service.getTaskRoute('t1', 'org1');
    expect(prisma.task.findFirst.mock.calls[0][0].where).toEqual({ id: 't1', organizationId: 'org1' });
  });

  it('the list shows only people rostered in the caller’s workspaces, and names only jobs there', async () => {
    const { service, prisma } = build();
    prisma.workerLastLocation.findMany.mockResolvedValue([
      { user: { id: 'w1' }, lat: 1, lng: 2, accuracy: 5, updatedAt: new Date() },
    ]);
    await service.getActiveWorkers('org1', undefined, ['s1']);
    expect(prisma.workerLastLocation.findMany.mock.calls[0][0].where.user).toMatchObject({ organizationId: 'org1', ...rostered(['s1']) });
    expect(prisma.task.findMany.mock.calls[0][0].where.spaceId).toEqual({ in: ['s1'] });
  });

  it('granted nowhere matches nothing — never collapses into org-wide', async () => {
    const { service, prisma } = build();
    await service.getActiveWorkers('org1', undefined, []);
    expect(prisma.workerLastLocation.findMany.mock.calls[0][0].where.user).toMatchObject(rostered([]));
    await service.getTaskRoute('t1', 'org1', []);
    expect(prisma.task.findFirst.mock.calls[0][0].where.spaceId).toEqual({ in: [] });
  });

  it('one person: position only if rostered here; history only of jobs here', async () => {
    const { service, prisma } = build();
    await service.getWorkerLocation('w1', 'org1', ['s1']);
    expect(prisma.workerLastLocation.findFirst.mock.calls[0][0].where.user).toMatchObject({ organizationId: 'org1', ...rostered(['s1']) });

    await service.getWorkerHistory('w1', undefined, undefined, 'org1', ['s1']);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'w1', organizationId: 'org1', ...rostered(['s1']) });
    expect(prisma.locationHistory.findMany.mock.calls[0][0].where.task).toEqual({ spaceId: { in: ['s1'] } });
  });

  it('somebody outside the workspace reads as nobody', async () => {
    const { service, prisma } = build();
    prisma.user.findFirst.mockResolvedValue(null);
    const res: any = await service.getWorkerHistory('w9', undefined, undefined, 'org1', ['s1']);
    expect(res.data).toEqual([]);
    expect(prisma.locationHistory.findMany).not.toHaveBeenCalled();
  });

  it('a job route, or the drive in progress, only for a job in the workspace', async () => {
    const { service, prisma } = build();
    await service.getTaskRoute('t1', 'org1', ['s1']);
    expect(prisma.task.findFirst.mock.calls[0][0].where).toEqual({ id: 't1', organizationId: 'org1', spaceId: { in: ['s1'] } });
    await service.getWorkerCurrentRoute('w1', 'org1', ['s1']);
    expect(prisma.task.findFirst.mock.calls[1][0].where).toMatchObject({ assignedToId: 'w1', spaceId: { in: ['s1'] } });
  });

  it('the controller passes an array through ([] included) and treats anything else as org-wide', async () => {
    const service: any = { getTaskRoute: jest.fn(), getActiveWorkers: jest.fn() };
    const c = new LocationController(service, service, service, service); // the four location services since the split
    await c.getTaskRoute({ taskId: 't', organizationId: 'o', scopeSpaceIds: [] });
    expect(service.getTaskRoute).toHaveBeenLastCalledWith('t', 'o', []);
    await c.getTaskRoute({ taskId: 't', organizationId: 'o', scopeSpaceIds: null as any });
    expect(service.getTaskRoute).toHaveBeenLastCalledWith('t', 'o', undefined);
    await c.getActiveWorkers({ organizationId: 'o' });
    expect(service.getActiveWorkers).toHaveBeenLastCalledWith('o', undefined, undefined);
  });
});
