/**
 * An asset's service reports — the list under the jobs on the record page.
 *
 * Three things only the server can be trusted with: the asset is looked up
 * INSIDE the caller's organization (a guessed id answers "not found", never
 * "not yours"), the person the page is for — a manager holding
 * `canViewAllTasks`, who is an EMPLOYEE now that MANAGER is retired — is let
 * in, and a page size cannot be talked into returning the table.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportsService } from '../reports.service';

const ORG = 'org_1';

function setup() {
  const prisma: any = {
    asset: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.organizationId === ORG && where.id === 'a1' ? { id: 'a1' } : null,
      ),
    },
    serviceReport: {
      findMany: jest.fn(async () => [
        {
          id: 'r1',
          taskId: 't1',
          task: { id: 't1', title: 'Replace the compressor', priority: 'HIGH' },
          summary: 'Compressor swapped',
          workDuration: 5400,
          completedAt: new Date('2026-09-01T10:00:00Z'),
          completedBy: { id: 'u1', firstName: 'Mike', lastName: 'Weber', avatarUrl: null },
          partsUsed: [
            { id: 'p1', name: 'Compressor', quantity: 1, unitCost: 400 },
            { id: 'p2', name: 'Screws', quantity: 12, unitCost: 0.1 },
          ],
          attachments: [{ id: 'x', type: 'AFTER', fileName: 'after.jpg' }],
        },
      ]),
      count: jest.fn(async () => 1),
    },
  };
  const service = new ReportsService(prisma, {} as any, {} as any, { emit: jest.fn() } as any);
  return { service, prisma };
}

const manager = { assetId: 'a1', userId: 'u9', userRole: 'EMPLOYEE', canViewAllTasks: true, organizationId: ORG };

describe('ReportsService.findByAssetId', () => {
  it('lets a manager who sees all the work read them — an EMPLOYEE, since MANAGER is retired', async () => {
    const { service } = setup();
    const res: any = await service.findByAssetId(manager);
    expect(res.data).toHaveLength(1);
  });

  it('refuses somebody who only sees their own work', async () => {
    const { service } = setup();
    await expect(service.findByAssetId({ ...manager, canViewAllTasks: false })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('answers another organization’s asset as not found, never as forbidden', async () => {
    const { service, prisma } = setup();
    await expect(service.findByAssetId({ ...manager, organizationId: 'org_2' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1', organizationId: 'org_2' } }),
    );
    expect(prisma.serviceReport.findMany).not.toHaveBeenCalled();
  });

  it('says how many lines of parts were used, not how many screws', async () => {
    const { service } = setup();
    const res: any = await service.findByAssetId(manager);
    expect(res.data[0]).toEqual(
      expect.objectContaining({
        taskId: 't1',
        taskTitle: 'Replace the compressor',
        partsCount: 2,
        workDuration: 5400,
        completedBy: expect.objectContaining({ firstName: 'Mike' }),
      }),
    );
  });

  it('clamps the page size whatever arrives', async () => {
    const { service, prisma } = setup();
    await service.findByAssetId({ ...manager, limit: '100000' as any, page: 'x' as any });
    expect(prisma.serviceReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }));
  });
});
