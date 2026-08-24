import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { LocationsService } from '../locations.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Audit S-B1 / S-B2 — what "empty" has to mean before a hard delete.
 *
 * `purge` is the only irreversible operation on a space, and its emptiness probe
 * covered 8 of the model's 18 relations. Three of the ones it missed lose data:
 *
 *  · `AssetCategory.space` is onDelete: Cascade — the space's whole asset taxonomy
 *    goes with it, and its assets are left uncategorised;
 *  · `StatusWorkflow.ownerSpace` is ALSO Cascade — and a workflow owned by this
 *    space can be offered to OTHER spaces, whose SpaceWorkflow rows cascade away
 *    and whose tasks have workflowId set to NULL. A space with no tasks of its own
 *    could break another space's board;
 *  · Sprint / Epic / Phase are SetNull — they survive, silently detached.
 *
 * And `SpaceShare.spaceId` carries no foreign key, so purging a shared space
 * revoked another organization's access with no notice and left the grant row
 * dangling.
 */
describe('LocationsService.purge — what counts as empty (S-B1, S-B2)', () => {
  let service: LocationsService;

  const EMPTY = {
    tasks: 0, timeEntries: 0, shifts: 0, shiftAssignments: 0, overtimeRequests: 0,
    recurringTemplates: 0, customers: 0, customerUnits: 0,
    assetCategories: 0, ownedWorkflows: 0, sprints: 0, epics: 0, phases: 0,
  };

  const prisma: any = {
    companyLocation: { findFirst: jest.fn(), delete: jest.fn() },
    spaceShare: { count: jest.fn(), deleteMany: jest.fn() },
    intakeCategory: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const notificationClient = { emit: jest.fn() };

  const space = (counts: Partial<typeof EMPTY>) => ({
    id: 'sp-1', name: 'Warehouse', isDefault: false, isRemote: false,
    _count: { ...EMPTY, ...counts },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.spaceShare.count.mockResolvedValue(0);
    // The service chains .catch() on these, so they must be real promises.
    prisma.spaceShare.deleteMany.mockResolvedValue({ count: 0 });
    prisma.intakeCategory.deleteMany.mockResolvedValue({ count: 0 });
    prisma.companyLocation.delete.mockResolvedValue({ id: 'sp-1' });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notificationClient },
      ],
    }).compile();
    service = module.get(LocationsService);
  });

  const purge = () =>
    service.purge({ id: 'sp-1', organizationId: 'org-1', userId: 'u-1' });

  describe('relations that were not probed before', () => {
    it('refuses a space that still defines asset kinds', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue(space({ assetCategories: 3 }));
      await expect(purge()).rejects.toThrow(/asset kind/i);
      expect(prisma.companyLocation.delete).not.toHaveBeenCalled();
    });

    it('refuses a space that OWNS a task type — deleting it would cascade into other spaces', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue(space({ ownedWorkflows: 1 }));
      await expect(purge()).rejects.toThrow(/task type/i);
      expect(prisma.companyLocation.delete).not.toHaveBeenCalled();
    });

    it.each(['sprints', 'epics', 'phases'] as const)(
      'refuses a space that still has %s',
      async (rel) => {
        prisma.companyLocation.findFirst.mockResolvedValue(space({ [rel]: 2 } as any));
        await expect(purge()).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.companyLocation.delete).not.toHaveBeenCalled();
      },
    );
  });

  describe('cross-org shares (S-B2)', () => {
    it('refuses while another organization still has an ACTIVE share', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue(space({}));
      prisma.spaceShare.count.mockResolvedValue(2);
      await expect(purge()).rejects.toThrow(/unshare/i);
      expect(prisma.companyLocation.delete).not.toHaveBeenCalled();
    });

    it('clears leftover non-active share rows, which no foreign key would cascade', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue(space({}));
      await purge();
      expect(prisma.spaceShare.deleteMany).toHaveBeenCalledWith({ where: { spaceId: 'sp-1' } });
    });
  });

  describe('a genuinely empty space', () => {
    beforeEach(() => prisma.companyLocation.findFirst.mockResolvedValue(space({})));

    it('is deleted', async () => {
      await expect(purge()).resolves.toMatchObject({ success: true });
      expect(prisma.companyLocation.delete).toHaveBeenCalledWith({ where: { id: 'sp-1' } });
    });

    it('announces the change, so other admins stop seeing a space that is gone (S-D1)', async () => {
      await purge();
      expect(notificationClient.emit).toHaveBeenCalledWith(
        'space_changed',
        expect.objectContaining({ organizationId: 'org-1', spaceId: 'sp-1' }),
      );
    });
  });

  describe('protected spaces', () => {
    it('still refuses the default space', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue({ ...space({}), isDefault: true });
      await expect(purge()).rejects.toThrow(/default space/i);
    });

    it('still refuses the Remote space', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue({ ...space({}), isRemote: true });
      await expect(purge()).rejects.toThrow(/Remote space/i);
    });

    it('404s a space from another organization', async () => {
      prisma.companyLocation.findFirst.mockResolvedValue(null);
      await expect(purge()).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
