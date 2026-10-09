import { NotFoundException } from '@nestjs/common';
import { LocationsService } from '../locations.service';

/**
 * GET /locations/:id/members — the SINGLE roster had no scope at all: any
 * member (an external one included) read any workspace's people by id. It now
 * follows the batch's rule, through the same helper.
 */
describe('LocationsService.getLocationAssignments — space scope', () => {
  function setup(assignedTo: string[]) {
    const prisma: any = {
      companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'sp-2' }) },
      spaceAssignment: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where.userId) return assignedTo.filter((s) => where.spaceId.in.includes(s)).map((spaceId) => ({ spaceId }));
          return [];
        }),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new LocationsService(prisma, { emit: jest.fn() } as any) };
  }

  it("'own' scope: a space the caller is not assigned to reads as not found", async () => {
    const { service, prisma } = setup(['sp-1']);
    await expect(
      service.getLocationAssignments({ locationId: 'sp-2', organizationId: 'org-1', requesterId: 'u-1', spaceScope: 'own' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.companyLocation.findFirst).not.toHaveBeenCalled();
  });

  it("'tasks' scope (what an external member without a grant gets) reads none", async () => {
    const { service } = setup(['sp-2']);
    await expect(
      service.getLocationAssignments({ locationId: 'sp-2', organizationId: 'org-1', requesterId: 'u-1', spaceScope: 'tasks' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assigned there, or holding a viewing grant for it, reads it', async () => {
    const { service } = setup(['sp-2']);
    await expect(service.getLocationAssignments({ locationId: 'sp-2', organizationId: 'org-1', requesterId: 'u-1', spaceScope: 'own' })).resolves.toBeDefined();
    const other = setup([]);
    await expect(other.service.getLocationAssignments({ locationId: 'sp-2', organizationId: 'org-1', requesterId: 'u-1', spaceScope: 'tasks', canViewAll: true })).resolves.toBeDefined();
  });

  it('a cross-org shared space with showWorkers is authorised by its share', async () => {
    const { service } = setup([]);
    await expect(
      service.getLocationAssignments({ locationId: 'sp-2', organizationId: 'org-1', requesterId: 'u-1', spaceScope: 'own', sharedSpaceIds: ['sp-2'] }),
    ).resolves.toBeDefined();
  });
});
