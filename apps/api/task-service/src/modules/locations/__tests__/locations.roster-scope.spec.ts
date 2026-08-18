import { Test, TestingModule } from '@nestjs/testing';
import { LocationsService } from '../locations.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Roster batch = space-scope enforcement.
 *
 * The space ids come from the client, so an organization check alone let ANY
 * member read the roster of ANY space in the org by passing its id — including
 * members whose Access Profile grants them no spaces at all. The scope now
 * travels with the request and is applied before anything is read.
 */
describe('LocationsService.getLocationAssignmentsBatch — space scope', () => {
  let service: LocationsService;

  const prisma = {
    companyLocation: { findMany: jest.fn() },
    spaceAssignment: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Two spaces exist in the org; the caller is only rostered on sp-1.
    prisma.companyLocation.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve((where.id.in as string[]).map((id) => ({ id }))),
    );
    prisma.spaceAssignment.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [LocationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(LocationsService);
  });

  /** The scope lookup is the FIRST spaceAssignment query; the roster read follows. */
  const scopeQueryFor = (spaceIds: string[]) =>
    prisma.spaceAssignment.findMany.mockImplementationOnce(({ where }: any) => {
      const asked: string[] = where.spaceId.in;
      return Promise.resolve(asked.filter((id) => spaceIds.includes(id)).map((spaceId) => ({ spaceId })));
    });

  it('returns nothing to a member scoped to tasks only, without touching the database', async () => {
    const res: any = await service.getLocationAssignmentsBatch({
      locationIds: ['sp-1', 'sp-2'],
      organizationId: 'org-1',
      requesterId: 'u-1',
      spaceScope: 'tasks',
    });

    expect(res.data).toEqual([]);
    expect(prisma.companyLocation.findMany).not.toHaveBeenCalled();
    expect(prisma.spaceAssignment.findMany).not.toHaveBeenCalled();
  });

  it('drops spaces an "own"-scope member is not rostered on', async () => {
    scopeQueryFor(['sp-1']); // rostered on sp-1 only
    prisma.spaceAssignment.findMany.mockResolvedValueOnce([
      { userId: 'u-1', spaceId: 'sp-1', user: { id: 'u-1' } },
    ]);

    await service.getLocationAssignmentsBatch({
      locationIds: ['sp-1', 'sp-2'],
      organizationId: 'org-1',
      requesterId: 'u-1',
      spaceScope: 'own',
    });

    // Only the permitted space reaches the roster read.
    expect(prisma.companyLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['sp-1'] } }) }),
    );
  });

  it('short-circuits when an "own"-scope member is rostered on none of the ids', async () => {
    scopeQueryFor([]);

    const res: any = await service.getLocationAssignmentsBatch({
      locationIds: ['sp-2'],
      organizationId: 'org-1',
      requesterId: 'u-1',
      spaceScope: 'own',
    });

    expect(res.data).toEqual([]);
    expect(prisma.companyLocation.findMany).not.toHaveBeenCalled();
  });

  it('lets an "all"-scope member read every space in the org', async () => {
    await service.getLocationAssignmentsBatch({
      locationIds: ['sp-1', 'sp-2'],
      organizationId: 'org-1',
      requesterId: 'u-1',
      spaceScope: 'all',
    });

    expect(prisma.companyLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['sp-1', 'sp-2'] } }) }),
    );
  });

  it('does not scope admins and managers', async () => {
    await service.getLocationAssignmentsBatch({
      locationIds: ['sp-1', 'sp-2'],
      organizationId: 'org-1',
      requesterId: 'admin-1',
      spaceScope: 'own',
      canViewAll: true,
    });

    expect(prisma.companyLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['sp-1', 'sp-2'] } }) }),
    );
  });

  it('credits the current task to a CO-ASSIGNEE, not only the lead', async () => {
    // Roster: two members on sp-1. The task is led by u-lead with u-co attached.
    prisma.spaceAssignment.findMany.mockResolvedValueOnce([
      { userId: 'u-lead', spaceId: 'sp-1', user: { id: 'u-lead' } },
      { userId: 'u-co', spaceId: 'sp-1', user: { id: 'u-co' } },
    ]);
    prisma.task.findMany.mockResolvedValueOnce([
      {
        assignedToId: 'u-lead',
        spaceId: 'sp-1',
        title: 'Boiler service',
        status: 'IN_PROGRESS',
        assignees: [{ userId: 'u-co' }],
      },
    ]);

    const res: any = await service.getLocationAssignmentsBatch({
      locationIds: ['sp-1'],
      organizationId: 'org-1',
      canViewAll: true,
    });

    const byUser = Object.fromEntries(res.data.map((a: any) => [a.userId, a.currentTask]));
    // Both hold the task — the co-assignee used to read as idle.
    expect(byUser['u-lead']).toBe('Boiler service');
    expect(byUser['u-co']).toBe('Boiler service');
  });

  it('picks the highest-priority active task when a member holds several', async () => {
    prisma.spaceAssignment.findMany.mockResolvedValueOnce([
      { userId: 'u-1', spaceId: 'sp-1', user: { id: 'u-1' } },
    ]);
    prisma.task.findMany.mockResolvedValueOnce([
      { assignedToId: 'u-1', spaceId: 'sp-1', title: 'Driving', status: 'EN_ROUTE', assignees: [] },
      { assignedToId: 'u-1', spaceId: 'sp-1', title: 'Fixing', status: 'IN_PROGRESS', assignees: [] },
    ]);

    const res: any = await service.getLocationAssignmentsBatch({
      locationIds: ['sp-1'],
      organizationId: 'org-1',
      canViewAll: true,
    });

    expect(res.data[0].currentTask).toBe('Fixing');
  });

  it('still scopes by organization, so a foreign space id yields nothing', async () => {
    prisma.companyLocation.findMany.mockResolvedValueOnce([]);

    const res: any = await service.getLocationAssignmentsBatch({
      locationIds: ['sp-other-org'],
      organizationId: 'org-1',
      requesterId: 'admin-1',
      canViewAll: true,
    });

    expect(res.data).toEqual([]);
  });
});
